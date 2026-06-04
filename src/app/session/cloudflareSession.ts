import { wsBase } from '@/network/cf/apiClient';
import { REACTIONS, type Intention, type ServerMessage } from '@/network/protocol/messages';
import type { ClientFrame, ServerFrame } from '@/network/cf/protocol';
import type { RoomConfig } from '@/features/room/types';
import type { Session, SessionHooks } from './types';

const CONNECT_TIMEOUT_MS = 15000;
const MAX_BACKOFF_MS = 8000;
/** A dropped echo must never hang the pending UI forever. */
const SEND_RESOLVE_TIMEOUT_MS = 12000;
const ALLOWED_EMOJIS = new Set<string>(REACTIONS);

/** App-level WS close codes the DO sends for fatal conditions (don't reconnect). */
const CLOSE_BAD_TOKEN = 1008;
const CLOSE_NO_ROOM = 4004;

export interface CloudflareSessionOptions {
  roomId: string;
  playerId: string;
  name: string;
  role: 'host' | 'client';
  spectator?: boolean;
  config?: Partial<RoomConfig>;
  isPublic?: boolean;
  roomName?: string;
  /** The signed identity token presented on HELLO (from cf/auth ensureIdentity). */
  token: string;
}

/**
 * Server-authoritative session over a single Cloudflare WebSocket to the room's
 * Durable Object. The direct analogue of SupabaseSession behind the SAME Session
 * interface (migration plan §7), so the store and UI are unchanged — only the
 * transport differs. One socket replaces Realtime's changes + presence + broadcast:
 *   STATE   → onState        SERVER → onServerMessage (WELCOME/ERROR/SNAPSHOT/CLOSED)
 *   REACTION→ onReaction     close  → onStatus('reconnecting') + auto-reconnect
 */
export class CloudflareSession implements Session {
  readonly isHost: boolean;
  private readonly opts: CloudflareSessionOptions;
  private readonly hooks: SessionHooks;
  private ws: WebSocket | null = null;
  private disposed = false;
  private connected = false;
  /** True once we've connected at least once (a later drop is recoverable, not fatal). */
  private handshaken = false;
  private backoff = 500;
  private connectTimer: ReturnType<typeof setTimeout> | null = null;
  /** Resolvers for in-flight send() calls — drained when the server's state echo lands. */
  private pendingSends: Array<() => void> = [];

  constructor(opts: CloudflareSessionOptions, hooks: SessionHooks) {
    this.opts = opts;
    this.hooks = hooks;
    this.isHost = opts.role === 'host';
    this.hooks.onStatus('connecting');
    this.connectTimer = setTimeout(() => {
      if (!this.disposed && !this.connected) this.hooks.onStatus('error', 'Không kết nối được tới máy chủ.');
    }, CONNECT_TIMEOUT_MS);
    this.open();
  }

  getPlayerId(): string {
    return this.opts.playerId;
  }

  /**
   * Send an intention; resolves once the server's next authoritative STATE (or a
   * targeted ERROR) lands — by which point onState has already applied it, so the
   * store's pending/optimistic logic reconciles correctly. A timeout backstops a
   * lost echo so the UI never hangs.
   */
  send(intention: Intention): Promise<void> {
    if (this.disposed || !this.ws || this.ws.readyState !== WebSocket.OPEN) return Promise.resolve();
    return new Promise<void>((resolve) => {
      this.pendingSends.push(resolve);
      this.sendFrame({ t: 'INTENT', intention });
      setTimeout(() => this.drainPending(), SEND_RESOLVE_TIMEOUT_MS);
    });
  }

  sendReaction(emoji: string): void {
    if (this.disposed || !ALLOWED_EMOJIS.has(emoji)) return;
    // The DO relays to ALL sockets incl. us, so (unlike Supabase broadcast) we
    // do NOT echo locally — the relay frame is the single source of truth.
    this.sendFrame({ t: 'REACTION', emoji });
  }

  leave(): void {
    this.disposed = true;
    this.clearConnectTimer();
    this.sendFrame({ t: 'LEAVE', permanent: true });
    try {
      this.ws?.close();
    } catch {
      /* already closing */
    }
    this.ws = null;
    this.drainPending();
  }

  // ── internals ───────────────────────────────────────────────────────────

  private open(): void {
    if (this.disposed) return;
    const ws = new WebSocket(`${wsBase()}/api/room/${encodeURIComponent(this.opts.roomId)}`);
    this.ws = ws;
    ws.addEventListener('open', () => {
      this.sendFrame({
        t: 'HELLO',
        token: this.opts.token,
        name: this.opts.name,
        role: this.opts.role,
        spectator: this.opts.spectator,
        config: this.opts.config,
        isPublic: this.opts.isPublic,
        roomName: this.opts.roomName,
      });
    });
    ws.addEventListener('message', (e) => this.onFrame(e));
    ws.addEventListener('close', (e) => this.onClose(e));
    ws.addEventListener('error', () => {
      /* a close event always follows; reconnect is handled there */
    });
  }

  private onFrame(event: MessageEvent): void {
    if (this.disposed) return;
    let frame: ServerFrame;
    try {
      frame = JSON.parse(typeof event.data === 'string' ? event.data : '') as ServerFrame;
    } catch {
      return;
    }
    switch (frame.t) {
      case 'STATE':
        this.markConnected();
        this.hooks.onState(frame.state);
        this.drainPending(); // the server responded — clear any in-flight commands
        return;
      case 'REACTION':
        this.hooks.onReaction(frame.reaction);
        return;
      case 'SERVER':
        this.onServer(frame.msg);
        return;
    }
  }

  private onServer(msg: ServerMessage): void {
    if (msg.type === 'WELCOME') this.markConnected();
    this.hooks.onServerMessage(msg);
    if (msg.type === 'ERROR') this.drainPending();
    if (msg.type === 'CLOSED') {
      this.disposed = true;
      this.clearConnectTimer();
    }
  }

  private markConnected(): void {
    if (this.connected) return;
    this.connected = true;
    this.handshaken = true;
    this.backoff = 500;
    this.clearConnectTimer();
    this.hooks.onStatus('connected');
  }

  private onClose(event: CloseEvent): void {
    this.drainPending();
    if (this.disposed) return;

    // Fatal conditions from the DO (bad token / no such room): surface and stop —
    // reconnecting would just loop on the same rejection.
    if (event.code === CLOSE_BAD_TOKEN || event.code === CLOSE_NO_ROOM) {
      this.disposed = true;
      this.clearConnectTimer();
      this.hooks.onStatus('error', event.code === CLOSE_BAD_TOKEN ? 'Phiên không hợp lệ' : 'Phòng không tồn tại');
      return;
    }

    this.connected = false;
    // A drop after we'd connected is recoverable — re-HELLO is an idempotent
    // re-seat by playerId. A first-connect failure is left to the connect timeout.
    if (this.handshaken) this.hooks.onStatus('reconnecting', 'Mất kết nối — đang kết nối lại…');
    const delay = this.backoff;
    this.backoff = Math.min(this.backoff * 2, MAX_BACKOFF_MS);
    setTimeout(() => {
      if (!this.disposed) this.open();
    }, delay);
  }

  private sendFrame(frame: ClientFrame): void {
    try {
      this.ws?.send(JSON.stringify(frame));
    } catch {
      /* socket not open */
    }
  }

  private drainPending(): void {
    const resolvers = this.pendingSends;
    this.pendingSends = [];
    for (const resolve of resolvers) resolve();
  }

  private clearConnectTimer(): void {
    if (this.connectTimer) {
      clearTimeout(this.connectTimer);
      this.connectTimer = null;
    }
  }
}
