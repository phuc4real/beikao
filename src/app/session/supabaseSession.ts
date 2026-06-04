import type { RealtimeChannel } from '@supabase/supabase-js';
import { getSupabase } from '@/network/supabase/client';
import { REACTIONS, type Intention, type ServerMessage } from '@/network/protocol/messages';
import type { ReactionMsg, RoomConfig, RoomState } from '@/features/room/types';
import { genId } from '@/utils/id';
import type { Session, SessionHooks } from './types';

const CONNECT_TIMEOUT_MS = 15000;
/** Palette guard for inbound/outbound reactions (broadcast is untrusted). */
const ALLOWED_EMOJIS = new Set<string>(REACTIONS);
/** Broadcast event name carrying a {@link ReactionMsg} payload. */
const REACTION_EVENT = 'reaction';

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
  /** True once the create/JOIN handshake has run — distinguishes a first
   *  connect (failure is fatal) from a re-subscribe after a dropped socket
   *  (recoverable: we just refresh state and clear the reconnecting banner). */
  private handshaken = false;
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

  send(intention: Intention): Promise<void> {
    return this.invoke({ op: 'intent', intention }).then(() => undefined);
  }

  /**
   * Reactions are ephemeral chatter, so they skip the authority entirely: we
   * broadcast over the open Realtime socket (instant, no Edge cold start, no
   * full-state rewrite). Broadcast doesn't echo to self, so we surface our own
   * reaction locally too. Palette-checked both ways since broadcast is untrusted.
   */
  sendReaction(emoji: string): void {
    if (this.disposed || !ALLOWED_EMOJIS.has(emoji)) return;
    const msg: ReactionMsg = {
      id: genId(),
      playerId: this.opts.playerId,
      name: this.opts.name,
      emoji,
      ts: Date.now(),
    };
    this.hooks.onReaction(msg);
    void this.channel?.send({ type: 'broadcast', event: REACTION_EVENT, payload: msg });
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
      // Ephemeral reactions ride broadcast (peer→peer over the socket), not the
      // authoritative state — so they never touch the Edge Function or Postgres.
      .on('broadcast', { event: REACTION_EVENT }, ({ payload }) => {
        if (this.disposed) return;
        this.onBroadcastReaction(payload as Partial<ReactionMsg> | null);
      })
      // Realtime Presence is the source of truth for "who's actually connected":
      // a dropped socket (close/crash/sleep/network) removes the peer here.
      .on('presence', { event: 'sync' }, () => this.onPresenceSync())
      .subscribe((status) => {
        if (this.disposed) return;
        if (status === 'SUBSCRIBED') {
          void this.channel?.track({ id: this.opts.playerId });
          if (!this.handshaken) {
            this.handshaken = true;
            void this.handshake();
            this.startHeartbeat();
          } else {
            // Re-subscribed after a dropped socket: Realtime only streams future
            // changes, so pull the current room state back (a JOIN re-seats us by
            // playerId) and clear the "reconnecting" banner.
            void this.reconnect();
          }
        } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          // A drop mid-session is recoverable — supabase-js auto-rejoins the
          // channel and fires SUBSCRIBED again. Surface it as a soft banner
          // instead of ejecting the player from a room they hold chips in. A
          // failure on the *first* connect is left to the 15s connect timeout.
          if (this.connected) this.hooks.onStatus('reconnecting', 'Mất kết nối — đang kết nối lại…');
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

  /**
   * Recover after the Realtime socket dropped and re-subscribed. A JOIN is
   * idempotent (the server matches our existing seat by playerId) and echoes
   * the current room state — so this both re-seats us and refreshes the state
   * Realtime missed while we were away, then clears the reconnecting banner.
   */
  private async reconnect(): Promise<void> {
    const res = await this.invoke(
      { op: 'intent', intention: { type: 'JOIN', name: this.opts.name, spectator: this.opts.spectator } },
      { silent: true },
    );
    if (this.disposed) return;
    if (res && res.ok !== false) this.hooks.onStatus('connected');
    else this.hooks.onStatus('reconnecting', 'Mất kết nối — đang kết nối lại…');
  }

  /** Invoke the `intent` Edge Function with the shared room/player envelope. */
  private async invoke(
    body: Record<string, unknown>,
    opts: { silent?: boolean } = {},
  ): Promise<IntentResponse | null> {
    const supabase = getSupabase();
    if (!supabase) return null;
    const { data, error } = await supabase.functions.invoke<IntentResponse>('intent', {
      body: { roomCode: this.opts.roomId, playerId: this.opts.playerId, name: this.opts.name, ...body },
    });
    if (error) {
      // `silent` callers (reconnect refresh) handle failure themselves rather
      // than escalating to a fatal 'error' that would eject the player.
      if (!this.disposed && !opts.silent) this.hooks.onStatus('error', 'Lỗi máy chủ');
      return null;
    }
    if (data && !this.disposed) this.applyResponse(data);
    return data;
  }

  private applyResponse(res: IntentResponse): void {
    if (res.state) this.hooks.onState(res.state);
    for (const msg of res.server ?? []) this.hooks.onServerMessage(msg);
  }

  /** Validate an inbound broadcast reaction (untrusted peer payload) and surface it. */
  private onBroadcastReaction(payload: Partial<ReactionMsg> | null): void {
    if (!payload || typeof payload.emoji !== 'string' || !ALLOWED_EMOJIS.has(payload.emoji)) return;
    if (typeof payload.id !== 'string' || typeof payload.name !== 'string') return;
    this.hooks.onReaction({
      id: payload.id,
      playerId: typeof payload.playerId === 'string' ? payload.playerId : '',
      name: payload.name,
      emoji: payload.emoji,
      ts: typeof payload.ts === 'number' ? payload.ts : Date.now(),
    });
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
