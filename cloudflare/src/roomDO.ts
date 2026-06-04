// Room Durable Object (cloudflare_migration_plan.md §5) — one instance per room
// code (idFromName(code)). It owns the GameAuthority, the live WebSocket set, and
// the betting-deadline alarm. This is the structural win of the migration: the
// authority and its state live in the SAME isolate, so there is no function↔DB
// round trip per intention (the ~1.3s Supabase cost), and the DO serializes all
// mutations — the OCC version/retry loop, the presence reporter election, and the
// pg_cron tick all disappear (see the plan's "what we delete" table).
//
// The engine + authority + protocol are reused VERBATIM from src/ (imported via
// the `@/` alias; wrangler bundles them). The authority already routes all output
// through callbacks and keeps hidden hands out of RoomState until REVEAL, so this
// file just wires those callbacks to WebSocket sends and persists on each commit.

import { GameAuthority, type AuthorityCallbacks, type AuthoritySecrets } from '@/features/room/authority';
import { DEFAULT_CONFIG, type ReactionMsg, type RoomState } from '@/features/room/types';
import { intentionSchema, REACTIONS, type Intention } from '@/network/protocol/messages';
import type { ClientFrame, ServerFrame } from '@/network/cf/protocol';
import { signingKey, verifyToken } from './auth';
import { deleteDirectory, getOrCreateProfile, recordRoundResult, upsertDirectory } from './d1';
import { roundResults } from './stats';
import type { Env } from './worker';

/** Persisted DO storage shape — lossless rehydration after eviction (plan §5.2a). */
interface Persisted {
  code: string;
  state: RoomState;
  secrets: AuthoritySecrets;
  createdAt: string;
  isPublic: boolean;
  roomName: string | null;
  /** When the last socket closed (epoch ms), for the empty-room grace; null while occupied. */
  emptySince: number | null;
}

/** How long an empty room lingers before the DO cleans itself up (replaces reapEmptyRooms). */
const EMPTY_GRACE_MS = 30_000;
const ALLOWED_EMOJIS = new Set<string>(REACTIONS);

export class RoomDO {
  private readonly ctx: DurableObjectState;
  private readonly env: Env;

  private code: string | null = null;
  private auth: GameAuthority | null = null;
  /** Open sockets → the verified player id ('' until the socket's HELLO). */
  private readonly conns = new Map<WebSocket, string>();

  private isPublic = true;
  private roomName: string | null = null;
  private createdAt = '';
  private emptySince: number | null = null;

  /** Serializes mutating frames: the authority's beginRound awaits a SHA-256
   *  digest, so without this a concurrent intent could interleave mid-deal. */
  private tail: Promise<void> = Promise.resolve();

  constructor(ctx: DurableObjectState, env: Env) {
    this.ctx = ctx;
    this.env = env;
  }

  // ── entry points ──────────────────────────────────────────────────────────

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    // /api/room/:code → capture the code so the DO knows its own room.
    const code = decodeURIComponent(url.pathname.slice('/api/room/'.length).split('/')[0] ?? '');
    if (code) this.code = code;

    if (request.headers.get('Upgrade') !== 'websocket') {
      return new Response('Expected a WebSocket upgrade', { status: 426 });
    }

    const pair = new WebSocketPair();
    const client = pair[0];
    const server = pair[1];
    server.accept();
    this.conns.set(server, '');
    this.emptySince = null;
    server.addEventListener('message', (e) => this.enqueue(() => this.onMessage(server, e)));
    server.addEventListener('close', () => this.enqueue(() => this.onClose(server)));
    server.addEventListener('error', () => this.enqueue(() => this.onClose(server)));

    return new Response(null, { status: 101, webSocket: client });
  }

  /** Betting-deadline close and/or empty-room cleanup (replaces tick + reaper). */
  async alarm(): Promise<void> {
    await this.enqueue(async () => {
      await this.ensureLoaded();
      if (!this.auth) return;

      if (this.conns.size === 0 && this.emptySince != null && Date.now() - this.emptySince >= EMPTY_GRACE_MS) {
        await this.cleanup();
        return;
      }

      const acted = this.auth.tickDeadline(Date.now()); // → closeBetting → broadcast STATE
      if (acted) await this.recordIfSettled(true);
      await this.afterMutation();
    });
  }

  // ── frame handling ──────────────────────────────────────────────────────────

  private async onMessage(ws: WebSocket, event: MessageEvent): Promise<void> {
    let frame: ClientFrame;
    try {
      frame = JSON.parse(typeof event.data === 'string' ? event.data : '') as ClientFrame;
    } catch {
      return;
    }
    switch (frame.t) {
      case 'HELLO':
        return this.onHello(ws, frame);
      case 'INTENT':
        return this.onIntent(ws, frame.intention);
      case 'REACTION':
        return this.onReaction(ws, frame.emoji);
      case 'LEAVE':
        return this.onLeave(ws, !!frame.permanent);
    }
  }

  private async onHello(ws: WebSocket, f: Extract<ClientFrame, { t: 'HELLO' }>): Promise<void> {
    const payload = await verifyToken(f.token, signingKey(this.env.AUTH_SIGNING_KEY));
    if (!payload) {
      this.send(ws, { t: 'SERVER', msg: { v: 1, type: 'ERROR', code: 'NOT_ALLOWED', reason: 'Phiên không hợp lệ' } });
      try {
        ws.close(1008, 'bad token');
      } catch {
        /* already closing */
      }
      return;
    }
    const playerId = payload.uid;
    this.conns.set(ws, playerId);

    await this.ensureLoaded();
    if (!this.auth) {
      if (f.role !== 'host') {
        this.send(ws, { t: 'SERVER', msg: { v: 1, type: 'ERROR', code: 'BAD_STATE', reason: 'Phòng không tồn tại' } });
        try {
          ws.close(4004, 'no room'); // app close code: fatal, the client must not reconnect-loop
        } catch {
          /* already closing */
        }
        return;
      }
      await this.createRoom(playerId, f);
    } else {
      await this.runIntent(playerId, { type: 'JOIN', name: f.name, spectator: f.spectator });
    }

    // WELCOME to this socket, then the current state (covers an idempotent rejoin
    // that produced no broadcast-worthy change).
    this.send(ws, { t: 'SERVER', msg: { v: 1, type: 'WELCOME', playerId, roomId: this.code ?? '' } });
    if (this.auth) this.send(ws, { t: 'STATE', state: this.auth.getState() });
  }

  private async onIntent(ws: WebSocket, raw: unknown): Promise<void> {
    const playerId = this.conns.get(ws);
    if (!playerId) return; // must HELLO first
    const parsed = intentionSchema.safeParse(raw);
    if (!parsed.success) {
      this.send(ws, { t: 'SERVER', msg: { v: 1, type: 'ERROR', code: 'BAD_STATE', reason: 'Lệnh không hợp lệ' } });
      return;
    }
    await this.runIntent(playerId, parsed.data);
  }

  private onReaction(ws: WebSocket, emoji: string): void {
    const playerId = this.conns.get(ws);
    if (!playerId || !ALLOWED_EMOJIS.has(emoji) || !this.auth) return;
    const st = this.auth.getState();
    const name =
      st.players.find((p) => p.id === playerId)?.name ?? st.spectators.find((s) => s.id === playerId)?.name ?? 'Người chơi';
    const reaction: ReactionMsg = { id: crypto.randomUUID(), playerId, name, emoji, ts: Date.now() };
    // Relay to ALL sockets incl. the sender (so the client does NOT self-echo).
    this.sendAll({ t: 'REACTION', reaction });
  }

  private async onLeave(ws: WebSocket, permanent: boolean): Promise<void> {
    const playerId = this.conns.get(ws);
    if (!playerId || !this.auth) return;
    if (permanent) {
      this.auth.leave(playerId); // frees the seat; promotes a new cái if needed
      if (this.auth.getState().players.length === 0) {
        await this.cleanup();
        return;
      }
    } else {
      this.disconnectIfLastSocket(playerId);
    }
    await this.afterMutation();
  }

  private async onClose(ws: WebSocket): Promise<void> {
    const playerId = this.conns.get(ws);
    this.conns.delete(ws);
    if (playerId && this.auth) this.disconnectIfLastSocket(playerId);
    if (this.conns.size === 0 && this.emptySince == null) this.emptySince = Date.now();
    if (this.auth) await this.afterMutation();
  }

  // ── room operations ─────────────────────────────────────────────────────────

  private async createRoom(hostId: string, f: Extract<ClientFrame, { t: 'HELLO' }>): Promise<void> {
    const config = { ...DEFAULT_CONFIG, ...(f.config ?? {}) };
    this.auth = new GameAuthority({
      roomId: this.code ?? '',
      hostId,
      hostName: f.name,
      config,
      useTimers: false,
      callbacks: this.callbacks(),
    });
    const balance = await getOrCreateProfile(this.env.DB, hostId, f.name, config.startingBalance);
    this.auth.setBalance(hostId, balance); // commit → broadcast STATE
    this.isPublic = f.isPublic ?? true;
    this.roomName = f.roomName ?? `Bàn của ${f.name}`;
    this.createdAt = new Date().toISOString();
    await this.afterMutation();
  }

  /** Hydrate (if needed), apply one intention, seed durable balance on join, record settled rounds. */
  private async runIntent(playerId: string, intention: Intention): Promise<void> {
    await this.ensureLoaded();
    if (!this.auth) return;
    const wasBetting = this.auth.getState().status === 'BETTING';

    await this.auth.submit(playerId, intention);

    // A fresh seat (JOIN / spectator→player) is seeded from the durable profile,
    // overriding the room default — same path as the Supabase server.
    if (intention.type === 'JOIN' || intention.type === 'BECOME_PLAYER') {
      const seat = this.auth.getState().players.find((p) => p.id === playerId);
      if (seat) {
        const balance = await getOrCreateProfile(this.env.DB, playerId, seat.name, this.auth.getState().config.startingBalance);
        this.auth.setBalance(playerId, balance);
      }
    }

    await this.recordIfSettled(wasBetting);
    await this.afterMutation();
  }

  /** Write durable balances/stats when a round just settled (BETTING → REVEAL). */
  private async recordIfSettled(wasBetting: boolean): Promise<void> {
    if (!this.auth || !wasBetting || this.auth.getState().status !== 'REVEAL') return;
    await recordRoundResult(this.env.DB, roundResults(this.auth.getState()));
  }

  /** Disconnect a player only once their LAST socket has gone (multi-tab safe). */
  private disconnectIfLastSocket(playerId: string): void {
    if (![...this.conns.values()].includes(playerId)) this.auth?.disconnect(playerId);
  }

  // ── persistence, directory, alarm ─────────────────────────────────────────────

  /** Side effects after any state mutation: directory + lobby ping + persist + alarm. */
  private async afterMutation(): Promise<void> {
    if (!this.auth) return;
    const st = this.auth.getState();
    const connected = st.players.filter((p) => p.connected).length;
    await upsertDirectory(this.env.DB, {
      code: this.code ?? '',
      name: this.roomName,
      mode: st.config.mode,
      status: st.status,
      playerCount: connected,
      maxPlayers: st.config.maxPlayers,
      isPublic: this.isPublic,
      createdAt: this.createdAt,
    });
    this.notifyLobby();
    await this.persist();
    await this.scheduleAlarm();
  }

  private async persist(): Promise<void> {
    if (!this.auth || !this.code) return;
    const data: Persisted = {
      code: this.code,
      state: this.auth.getState(),
      secrets: this.auth.getSecrets(),
      createdAt: this.createdAt,
      isPublic: this.isPublic,
      roomName: this.roomName,
      emptySince: this.emptySince,
    };
    await this.ctx.storage.put('room', data);
  }

  /** Lazily resume a persisted room into a warm authority after eviction. */
  private async ensureLoaded(): Promise<void> {
    if (this.auth) return;
    const p = await this.ctx.storage.get<Persisted>('room');
    if (!p) return;
    this.code = p.code;
    this.isPublic = p.isPublic;
    this.roomName = p.roomName;
    this.createdAt = p.createdAt;
    this.emptySince = p.emptySince;
    this.auth = new GameAuthority({
      roomId: p.state.id,
      hostId: p.state.hostId,
      hostName: '',
      snapshot: p.state,
      secrets: p.secrets,
      useTimers: false,
      callbacks: this.callbacks(),
    });
  }

  /** Single alarm slot = min(betting deadline, empty-room grace). */
  private async scheduleAlarm(): Promise<void> {
    const st = this.auth?.getState();
    const times: number[] = [];
    if (st?.status === 'BETTING' && st.round?.endsAt != null) times.push(st.round.endsAt);
    if (this.conns.size === 0 && this.emptySince != null) times.push(this.emptySince + EMPTY_GRACE_MS);
    if (times.length === 0) {
      await this.ctx.storage.deleteAlarm();
      return;
    }
    await this.ctx.storage.setAlarm(Math.min(...times));
  }

  /** Room is gone (last seat left, or empty past the grace): wipe storage + directory. */
  private async cleanup(): Promise<void> {
    if (this.code) await deleteDirectory(this.env.DB, this.code);
    this.notifyLobby();
    await this.ctx.storage.deleteAll();
    this.auth = null;
  }

  private notifyLobby(): void {
    try {
      const id = this.env.LOBBY.idFromName('global');
      void this.env.LOBBY.get(id).fetch('https://lobby/notify', { method: 'POST' });
    } catch {
      /* best-effort */
    }
  }

  // ── socket plumbing ───────────────────────────────────────────────────────────

  private callbacks(): AuthorityCallbacks {
    return {
      broadcast: (state) => this.sendAll({ t: 'STATE', state }),
      sendTo: (pid, msg) => this.sendToPlayer(pid, { t: 'SERVER', msg }),
    };
  }

  private send(ws: WebSocket, frame: ServerFrame): void {
    try {
      ws.send(JSON.stringify(frame));
    } catch {
      /* socket closing */
    }
  }

  private sendAll(frame: ServerFrame): void {
    const data = JSON.stringify(frame);
    for (const ws of this.conns.keys()) {
      try {
        ws.send(data);
      } catch {
        /* socket closing */
      }
    }
  }

  private sendToPlayer(playerId: string, frame: ServerFrame): void {
    const data = JSON.stringify(frame);
    for (const [ws, id] of this.conns) {
      if (id !== playerId) continue;
      try {
        ws.send(data);
      } catch {
        /* socket closing */
      }
    }
  }

  /** Run mutating work serially so async intents (beginRound's digest) can't interleave. */
  private enqueue(fn: () => Promise<void>): Promise<void> {
    this.tail = this.tail.then(fn).catch(() => undefined);
    return this.tail;
  }
}
