import type { RealtimeChannel } from '@supabase/supabase-js';
import { getSupabase } from '@/network/supabase/client';
import type { Intention, ServerMessage } from '@/network/protocol/messages';
import type { RoomConfig, RoomState } from '@/features/room/types';
import type { Session, SessionHooks } from './types';

const CONNECT_TIMEOUT_MS = 15000;

export interface SupabaseSessionOptions {
  roomId: string;
  playerId: string;
  name: string;
  /** 'host' creates the room (and is the cái); 'client' joins an existing one. */
  role: 'host' | 'client';
  spectator?: boolean;
  /** Host-only: initial room config + discovery metadata. */
  config?: Partial<RoomConfig>;
  isPublic?: boolean;
  roomName?: string;
}

interface IntentResponse {
  ok: boolean;
  error?: string;
  state?: RoomState;
  /** Targeted messages for the caller (WELCOME / ERROR), mirroring host→client. */
  server?: ServerMessage[];
}

/**
 * Phase-3 server-authoritative session. State arrives via Supabase Realtime
 * (Postgres changes on the room's row); intentions go out as Edge Function RPCs
 * (`intent`). Satisfies the same `Session` contract as Host/ClientSession, so
 * the store and UI are unchanged — only the transport differs (TDD §19.2).
 */
export class SupabaseSession implements Session {
  readonly isHost: boolean;
  private readonly opts: SupabaseSessionOptions;
  private readonly hooks: SessionHooks;
  private channel: RealtimeChannel | null = null;
  private disposed = false;
  private connected = false;
  private connectTimer: ReturnType<typeof setTimeout> | null = null;
  private heartbeat: ReturnType<typeof setInterval> | null = null;
  private syncTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(opts: SupabaseSessionOptions, hooks: SessionHooks) {
    this.opts = opts;
    this.hooks = hooks;
    this.isHost = opts.role === 'host';
    this.hooks.onStatus('connecting');

    this.connectTimer = setTimeout(() => {
      if (this.disposed || this.connected) return;
      this.hooks.onStatus('error', 'Không kết nối được tới máy chủ. Kiểm tra cấu hình Supabase.');
    }, CONNECT_TIMEOUT_MS);

    void this.init();
  }

  getPlayerId(): string {
    return this.opts.playerId;
  }

  send(intention: Intention): void {
    void this.invoke({ op: 'intent', intention });
  }

  leave(): void {
    this.disposed = true;
    this.clearConnectTimer();
    if (this.heartbeat) clearInterval(this.heartbeat);
    if (this.syncTimer) clearTimeout(this.syncTimer);
    this.heartbeat = null;
    this.syncTimer = null;
    window.removeEventListener('pagehide', this.onPageHide);
    // Explicit in-app leave is permanent: if we're the last one in, the server
    // deletes the room (vs. a tab-close beacon, which only marks us disconnected).
    void this.invoke({ op: 'leave', permanent: true }).catch(() => undefined);
    const supabase = getSupabase();
    if (this.channel) {
      void this.channel.untrack();
      supabase?.removeChannel(this.channel);
    }
    this.channel = null;
  }

  /**
   * On tab close / reload there's no socket the server can observe, so send a
   * leave that survives unload (`fetch` with `keepalive`). It's NON-permanent:
   * it just marks us disconnected, so the room empties (and drops off the
   * browser) but isn't deleted — a reload reconnects within the reaper's grace.
   */
  private readonly onPageHide = (): void => {
    const url = import.meta.env.VITE_SUPABASE_URL;
    const key = import.meta.env.VITE_SUPABASE_ANON_KEY;
    if (!url || !key) return;
    const body = JSON.stringify({
      op: 'leave',
      roomCode: this.opts.roomId,
      playerId: this.opts.playerId,
      name: this.opts.name,
    });
    try {
      void fetch(`${url}/functions/v1/intent`, {
        method: 'POST',
        keepalive: true,
        headers: { 'Content-Type': 'application/json', apikey: key, Authorization: `Bearer ${key}` },
        body,
      });
    } catch {
      /* best-effort */
    }
  };

  // ── internals ───────────────────────────────────────────────────────────

  private async init(): Promise<void> {
    const supabase = getSupabase();
    if (!supabase) {
      this.hooks.onStatus('error', 'Supabase chưa được cấu hình');
      return;
    }

    this.channel = supabase
      .channel(`room:${this.opts.roomId}`, { config: { presence: { key: this.opts.playerId } } })
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'rooms', filter: `code=eq.${this.opts.roomId}` },
        (payload) => {
          if (this.disposed) return;
          if (payload.eventType === 'DELETE') {
            this.hooks.onStatus('closed', 'Phòng đã đóng');
            return;
          }
          const row = payload.new as { state?: RoomState } | null;
          if (row?.state) this.hooks.onState(row.state);
        },
      )
      // Realtime Presence is the source of truth for "who's actually connected":
      // a dropped socket (close/crash/sleep/network) removes the peer here.
      .on('presence', { event: 'sync' }, () => this.onPresenceSync())
      .subscribe((status) => {
        if (this.disposed) return;
        if (status === 'SUBSCRIBED') {
          void this.channel?.track({ id: this.opts.playerId });
          void this.handshake();
          this.startHeartbeat();
        } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          this.hooks.onStatus('error', 'Lỗi kết nối realtime');
        }
      });

    // Detect tab close / reload so the room empties (and a stale room isn't left
    // listed in the browser). `pagehide` is more reliable than `beforeunload`.
    window.addEventListener('pagehide', this.onPageHide);
  }

  /** Create (host) or JOIN (client) once subscribed, then mark connected. */
  private async handshake(): Promise<void> {
    const res =
      this.opts.role === 'host'
        ? await this.invoke({
            op: 'create',
            config: this.opts.config ?? {},
            isPublic: this.opts.isPublic ?? true,
            roomName: this.opts.roomName,
          })
        : await this.invoke({ op: 'intent', intention: { type: 'JOIN', name: this.opts.name, spectator: this.opts.spectator } });

    if (this.disposed) return;
    if (!res || res.ok === false) {
      this.hooks.onStatus('error', res?.error ?? 'Không vào được phòng');
      return;
    }
    this.connected = true;
    this.clearConnectTimer();
    this.hooks.onStatus('connected');
    this.applyResponse(res);
  }

  /** Invoke the `intent` Edge Function with the shared room/player envelope. */
  private async invoke(body: Record<string, unknown>): Promise<IntentResponse | null> {
    const supabase = getSupabase();
    if (!supabase) return null;
    const { data, error } = await supabase.functions.invoke<IntentResponse>('intent', {
      body: { roomCode: this.opts.roomId, playerId: this.opts.playerId, name: this.opts.name, ...body },
    });
    if (error) {
      if (!this.disposed) this.hooks.onStatus('error', 'Lỗi máy chủ');
      return null;
    }
    if (data && !this.disposed) this.applyResponse(data);
    return data;
  }

  private applyResponse(res: IntentResponse): void {
    if (res.state) this.hooks.onState(res.state);
    for (const msg of res.server ?? []) this.hooks.onServerMessage(msg);
  }

  // ── presence ──────────────────────────────────────────────────────────────

  /** Player ids currently present on the channel (presence key === playerId). */
  private presentIds(): string[] {
    return this.channel ? Object.keys(this.channel.presenceState()) : [];
  }

  /**
   * Only ONE client pushes presence to the server — the lowest present id (a
   * deterministic "reporter"). This avoids every client racing to reconcile;
   * if the reporter drops, the next-lowest takes over on the next sync.
   */
  private isReporter(present: string[]): boolean {
    return present.length > 0 && [...present].sort()[0] === this.opts.playerId;
  }

  private onPresenceSync(): void {
    if (this.disposed) return;
    const present = this.presentIds();
    if (!this.isReporter(present)) return;
    // Debounce: presence sync can fire in bursts as peers settle.
    if (this.syncTimer) clearTimeout(this.syncTimer);
    this.syncTimer = setTimeout(() => void this.invoke({ op: 'sync_presence', present }), 400);
  }

  /** Reporter re-sends the present set periodically so the reaper sees liveness. */
  private startHeartbeat(): void {
    if (this.heartbeat) return;
    this.heartbeat = setInterval(() => {
      if (this.disposed) return;
      const present = this.presentIds();
      if (this.isReporter(present)) void this.invoke({ op: 'sync_presence', present });
    }, 25000);
  }

  private clearConnectTimer(): void {
    if (this.connectTimer) {
      clearTimeout(this.connectTimer);
      this.connectTimer = null;
    }
  }
}
