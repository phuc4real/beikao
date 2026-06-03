import {
  createDeck,
  dealFromDeck,
  deckCanSeat,
  settleCaoCai,
  settlePot,
  shuffle,
  type CaoCaiCon,
} from '@/features/cao';
import { bytesToHex, combineSeeds, hexToBytes, randomSeed, sha256Hex } from '@/utils/crypto';
import { genId } from '@/utils/id';
import { REACTIONS, type Intention, type ServerMessage } from '@/network/protocol/messages';
import {
  DEFAULT_CONFIG,
  MIN_PLAYERS,
  SPECTATOR_CAP,
  type PlayerView,
  type RevealedHand,
  type RoomConfig,
  type RoomState,
  type RoundResult,
} from './types';

const CHAT_CAP = 50;
const HISTORY_CAP = 50;
const REACTION_CAP = 24;
const ALLOWED_EMOJIS = new Set<string>(REACTIONS);

export interface AuthorityCallbacks {
  /** Push the latest authoritative state to every connection (incl. host loopback). */
  broadcast: (state: RoomState) => void;
  /** Send a targeted message to one player (errors, welcome). */
  sendTo: (playerId: string, msg: ServerMessage) => void;
}

/**
 * The authority's private (never-broadcast) state. Kept out of RoomState because
 * `pendingSeed` during BETTING would let a con compute the deck early. In P2P
 * this lives in memory on the host; in the Phase-3 server it is persisted to a
 * service-role-only table between stateless Edge Function invocations.
 */
export interface AuthoritySecrets {
  pendingSeedHex: string | null;
  pendingPlayerSeeds: Record<string, string>;
  roundCounter: number;
}

export interface AuthorityOptions {
  roomId: string;
  hostId: string;
  hostName: string;
  config?: Partial<RoomConfig>;
  callbacks: AuthorityCallbacks;
  /**
   * Phase 3: hydrate from persisted state instead of building a fresh room.
   * When given, `roomId`/`hostName`/`config` are ignored (already in the state).
   */
  snapshot?: RoomState;
  /** Phase 3: the persisted private state to resume with (paired with `snapshot`). */
  secrets?: AuthoritySecrets;
  /**
   * Phase 3: the stateless server runs one intention per invocation and lets a
   * cron tick close betting at the deadline, so the in-process `setTimeout` is
   * disabled. P2P (host in a live tab) keeps it on. Default: true.
   */
  useTimers?: boolean;
}

/**
 * Host-authoritative game loop. Holds the single source of truth, validates
 * every intention, and runs the LOBBY → BETTING → REVEAL state machine. The
 * deck/seed and unrevealed hands live only here and are never broadcast.
 *
 * Invariant: this code must never grant the host/cái any advantage — the cái's
 * hand is dealt from the same shuffled deck and its bets/accounting use the same
 * paths as any con.
 */
export class GameAuthority {
  private state: RoomState;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private roundCounter = 0;
  private readonly cb: AuthorityCallbacks;

  // Provably-fair: host seed is committed (hashed) before betting and kept
  // private until REVEAL; con entropy seeds are collected privately during
  // betting so the cái can't compute the deck early.
  private pendingSeed: Uint8Array | null = null;
  private pendingPlayerSeeds: Record<string, string> = {};
  private starting = false;
  private readonly useTimers: boolean;

  constructor(opts: AuthorityOptions) {
    this.cb = opts.callbacks;
    this.useTimers = opts.useTimers ?? true;

    // Phase 3: resume a persisted room instead of creating a fresh one.
    if (opts.snapshot) {
      this.state = opts.snapshot;
      const s = opts.secrets;
      this.roundCounter = s?.roundCounter ?? this.deriveRoundCounter(opts.snapshot);
      this.pendingSeed = s?.pendingSeedHex ? hexToBytes(s.pendingSeedHex) : null;
      this.pendingPlayerSeeds = s?.pendingPlayerSeeds ? { ...s.pendingPlayerSeeds } : {};
      return;
    }

    const config: RoomConfig = { ...DEFAULT_CONFIG, ...opts.config };
    this.state = {
      id: opts.roomId,
      hostId: opts.hostId,
      caiId: opts.hostId,
      status: 'LOBBY',
      config,
      players: [
        {
          id: opts.hostId,
          name: opts.hostName.trim().slice(0, 20) || 'Cái',
          balance: config.startingBalance,
          ready: true,
          isCai: true,
          connected: true,
        },
      ],
      spectators: [],
      round: null,
      history: [],
      chat: [],
      reactions: [],
      version: 1,
    };
  }

  getState(): RoomState {
    return this.state;
  }

  /** Phase 3: the private state to persist alongside the snapshot. */
  getSecrets(): AuthoritySecrets {
    return {
      pendingSeedHex: this.pendingSeed ? bytesToHex(this.pendingSeed) : null,
      pendingPlayerSeeds: { ...this.pendingPlayerSeeds },
      roundCounter: this.roundCounter,
    };
  }

  /**
   * Phase 3 (3d): override a seat's chip balance from the player's durable
   * profile (called by the server right after a JOIN/create so chips follow the
   * player between rooms). No-op in P2P.
   */
  setBalance(playerId: string, balance: number): void {
    const p = this.findPlayer(playerId);
    if (p) {
      p.balance = balance;
      this.commit();
    }
  }

  /** Fallback when resuming without persisted secrets (e.g. legacy rows). */
  private deriveRoundCounter(state: RoomState): number {
    const fromHistory = state.history[0]?.roundNumber ?? 0;
    return Math.max(state.round?.roundNumber ?? 0, fromHistory);
  }

  dispose(): void {
    this.clearTimer();
  }

  /**
   * Phase 3 cron entry: close betting if the deadline has passed. P2P uses the
   * internal `setTimeout` instead; the server calls this from a ~1s tick.
   * Returns true if it acted (so the caller knows to persist).
   */
  tickDeadline(now: number): boolean {
    const { status, round } = this.state;
    if (status === 'BETTING' && round?.endsAt != null && now >= round.endsAt) {
      this.closeBetting();
      return true;
    }
    return false;
  }

  // ── connection lifecycle ──────────────────────────────────────────────

  /** A connection opened or reconnected; create/restore a player or spectator. */
  join(playerId: string, name: string, spectator = false): void {
    const existing = this.findPlayer(playerId);
    if (existing) {
      existing.connected = true;
      this.commit();
      return;
    }
    if (this.state.spectators.some((s) => s.id === playerId)) {
      this.commit(); // already a spectator (reconnect)
      return;
    }

    const connectedCount = this.state.players.filter((p) => p.connected).length;
    const full = connectedCount >= this.state.config.maxPlayers;

    if (spectator || full) {
      if (this.state.spectators.length >= SPECTATOR_CAP) {
        this.cb.sendTo(playerId, { v: 1, type: 'ERROR', code: 'ROOM_FULL', reason: 'Phòng đã đầy (cả chỗ xem)' });
        return;
      }
      this.state.spectators.push({ id: playerId, name: this.uniqueName(name) });
      if (full && !spectator) {
        this.cb.sendTo(playerId, { v: 1, type: 'ERROR', code: 'ROOM_FULL', reason: 'Phòng đã đầy — bạn vào xem' });
      }
      this.commit();
      return;
    }

    this.state.players.push({
      id: playerId,
      name: this.uniqueName(name),
      balance: this.state.config.startingBalance,
      ready: false,
      isCai: false,
      connected: true,
    });
    this.commit();
  }

  /** A connection dropped; keep player seats, drop spectators. */
  disconnect(playerId: string): void {
    const p = this.findPlayer(playerId);
    if (p) {
      p.connected = false;
      if (p.id !== this.state.caiId) p.ready = false;
      this.commit();
      return;
    }
    if (this.state.spectators.some((s) => s.id === playerId)) {
      this.state.spectators = this.state.spectators.filter((s) => s.id !== playerId);
      this.commit();
    }
  }

  /**
   * Phase 3 (presence): reconcile every seat's `connected` flag against the set
   * of player ids currently present on the Realtime channel, and drop spectators
   * who left. Many-at-once equivalent of join/disconnect, driven by Realtime
   * Presence so genuine drops (crash/sleep/network) are detected, not just clean
   * tab closes. The cái keeps its `ready` flag (same exemption as disconnect()).
   */
  reconcilePresence(presentIds: readonly string[]): void {
    const present = new Set(presentIds);
    for (const p of this.state.players) {
      const online = present.has(p.id);
      if (p.connected !== online) {
        p.connected = online;
        if (!online && p.id !== this.state.caiId) p.ready = false;
      }
    }
    this.state.spectators = this.state.spectators.filter((s) => present.has(s.id));
    this.commit();
  }

  // ── intention handling ────────────────────────────────────────────────

  /**
   * Apply one intention. Async because START_ROUND/NEXT_ROUND await the deck
   * commitment (SHA-256). P2P callers fire-and-forget (the host tab stays alive
   * and `commit()` broadcasts when it resolves); the stateless Phase-3 server
   * awaits it so it persists the post-`beginRound` state, not the state before.
   */
  async submit(playerId: string, msg: Intention): Promise<void> {
    const p = this.findPlayer(playerId);
    switch (msg.type) {
      case 'JOIN':
        this.join(playerId, msg.name, msg.spectator);
        return;
      case 'REQUEST_SNAPSHOT':
        this.cb.sendTo(playerId, { v: 1, type: 'SNAPSHOT', state: this.state });
        return;
      // Spectators (not seated players) may still chat and react.
      case 'CHAT': {
        const name = p?.name ?? this.findSpectatorName(playerId);
        if (name) this.addChat(playerId, name, msg.text);
        return;
      }
      case 'REACTION': {
        const name = p?.name ?? this.findSpectatorName(playerId);
        if (name) this.addReaction(playerId, name, msg.emoji);
        return;
      }
    }
    if (!p) return; // remaining intentions require a seated player

    switch (msg.type) {
      case 'SET_READY':
        if (this.state.status === 'LOBBY' && !p.isCai) {
          p.ready = msg.ready;
          this.commit();
        }
        return;
      case 'PLACE_BET':
        this.placeBet(p, msg.amount);
        return;
      case 'CLEAR_BET':
        if (this.state.status === 'BETTING' && this.state.round && this.state.config.mode === 'CAO_CAI') {
          delete this.state.round.bets[p.id];
          this.commit();
        }
        return;
      case 'PLAYER_SEED':
        // Cons contribute entropy during betting. The cái must NOT (it knows the
        // host seed and could otherwise grind the combined seed).
        if (this.state.status === 'BETTING' && !p.isCai) this.pendingPlayerSeeds[p.id] = msg.seed;
        return;
      case 'UPDATE_CONFIG':
        if (p.isCai && this.state.status === 'LOBBY') this.applyConfig(msg.config);
        return;
      case 'START_ROUND':
        if (p.isCai && this.state.status === 'LOBBY') await this.beginRound(playerId);
        return;
      case 'CLOSE_BETTING':
        if (p.isCai && this.state.status === 'BETTING') this.closeBetting();
        return;
      case 'NEXT_ROUND':
        if (p.isCai && this.state.status === 'REVEAL') await this.beginRound(playerId);
        return;
      case 'BACK_TO_LOBBY':
        if (p.isCai && this.state.status !== 'LOBBY') this.toLobby();
        return;
    }
  }

  // ── betting ───────────────────────────────────────────────────────────

  private placeBet(p: PlayerView, amount: number): void {
    const { status, round, config } = this.state;
    if (status !== 'BETTING' || !round) return this.reject(p.id, 'BAD_STATE', 'Không trong lượt cược');
    if (config.mode !== 'CAO_CAI') return this.reject(p.id, 'NOT_ALLOWED', 'Chế độ này cược cố định');
    if (p.isCai) return this.reject(p.id, 'NOT_ALLOWED', 'Cái không đặt cược');
    if (!p.connected || !p.ready) return this.reject(p.id, 'NOT_ALLOWED', 'Bạn chưa sẵn sàng');
    if (amount < config.minBet || amount > config.maxBet) {
      return this.reject(p.id, 'BET_REJECTED', `Cược phải từ ${config.minBet} đến ${config.maxBet}`);
    }
    if (amount > p.balance) return this.reject(p.id, 'BET_REJECTED', 'Không đủ chip');
    round.bets[p.id] = amount;
    this.commit();
  }

  // ── round lifecycle ───────────────────────────────────────────────────

  private async beginRound(hostId: string): Promise<void> {
    if (this.starting) return;
    const { config } = this.state;
    const readyParticipants = this.state.players.filter((p) => p.connected && (p.ready || p.isCai));
    if (config.mode === 'CAO_CAI') {
      const readyCons = readyParticipants.filter((p) => !p.isCai);
      if (readyCons.length < 1) return this.reject(hostId, 'BAD_STATE', 'Cần ít nhất 1 người chơi sẵn sàng');
    } else if (readyParticipants.length < MIN_PLAYERS) {
      return this.reject(hostId, 'BAD_STATE', `Cần ít nhất ${MIN_PLAYERS} người chơi`);
    }

    this.starting = true;
    try {
      // Commit to the deck before betting opens: publish only SHA-256(hostSeed).
      this.pendingSeed = randomSeed(32);
      this.pendingPlayerSeeds = {};
      const deckCommitment = await sha256Hex(this.pendingSeed);
      if (this.state.status === 'BETTING') return; // a round already started during the await

      this.roundCounter += 1;
      const bets: Record<string, number> = {};
      if (config.mode === 'CAO_RUA') {
        // Equal-ante pot: every ready participant who can afford the ante is in.
        for (const p of readyParticipants) {
          if (p.balance >= config.minBet) bets[p.id] = config.minBet;
        }
      }
      this.state.round = {
        roundNumber: this.roundCounter,
        bets,
        endsAt: Date.now() + config.bettingSeconds * 1000,
        deckCommitment,
      };
      this.state.status = 'BETTING';
      this.clearTimer();
      // P2P: the host tab owns the betting clock. Server (Phase 3): a cron tick
      // closes betting at `round.endsAt`, so no in-process timer is scheduled.
      if (this.useTimers) {
        this.timer = setTimeout(() => this.closeBetting(), config.bettingSeconds * 1000);
      }
      this.commit();
    } finally {
      this.starting = false;
    }
  }

  /** Deal, settle, reveal. Called by the betting timer or an early close. */
  private closeBetting(): void {
    this.clearTimer();
    const { round, config } = this.state;
    if (!round || this.state.status !== 'BETTING') return;

    const participants = this.resolveParticipants();
    if (participants.length < MIN_PLAYERS) {
      // Not enough stakes to play — keep the betting window open (don't drop to
      // lobby), pause the countdown, and notify the cái so they can wait/retry.
      round.endsAt = null;
      this.reject(this.state.caiId, 'BAD_STATE', 'Chưa có ai đặt cược — chưa thể chốt');
      this.commit();
      return;
    }
    if (!deckCanSeat(participants.length)) {
      round.endsAt = null;
      this.reject(this.state.caiId, 'BAD_STATE', 'Quá nhiều người chơi cho một bộ bài');
      this.commit();
      return;
    }

    // Final shuffle seed = committed host seed mixed with all con entropy seeds.
    const finalSeed = combineSeeds(this.pendingSeed ?? randomSeed(), Object.values(this.pendingPlayerSeeds));
    const deck = shuffle(createDeck(), finalSeed);
    const ids = participants.map((p) => p.id);
    const { hands } = dealFromDeck(deck, ids);
    const handById = new Map(hands.map((h) => [h.playerId, h.hand]));

    let result: RoundResult;
    if (config.mode === 'CAO_CAI') {
      const caiHand = handById.get(this.state.caiId)!;
      const cons: CaoCaiCon[] = participants
        .filter((p) => p.id !== this.state.caiId)
        .map((p) => ({ playerId: p.id, hand: handById.get(p.id)!, bet: round.bets[p.id]! }));
      const s = settleCaoCai(this.state.caiId, caiHand, cons, {
        baTienPayout: config.baTienPayout,
        caoPayout: config.caoPayout,
      });
      result = { mode: 'CAO_CAI', deltas: s.deltas, outcomes: s.outcomes, roundNumber: round.roundNumber };
    } else {
      const s = settlePot(config.minBet, participants.map((p) => ({ playerId: p.id, hand: handById.get(p.id)! })));
      result = { mode: 'CAO_RUA', deltas: s.deltas, potWinner: s.potWinner, roundNumber: round.roundNumber };
    }

    for (const [pid, delta] of Object.entries(result.deltas)) {
      const player = this.findPlayer(pid);
      if (player) player.balance += delta;
    }

    const revealed: Record<string, RevealedHand> = {};
    for (const { playerId, hand } of hands) {
      revealed[playerId] = { cards: hand.cards, score: hand.score, baTien: hand.baTien };
    }
    round.hands = revealed;
    round.result = result;
    round.endsAt = null;
    round.dealOrder = ids;
    // Reveal the provably-fair data so every client can verify the deck.
    round.playerSeeds = { ...this.pendingPlayerSeeds };
    if (this.pendingSeed) round.hostSeedRevealed = bytesToHex(this.pendingSeed);
    this.pendingSeed = null;
    this.pendingPlayerSeeds = {};
    this.state.status = 'REVEAL';
    // Keep the full round view (cards + fairness data) so it can be replayed/verified.
    this.state.history = [{ ...round }, ...this.state.history].slice(0, HISTORY_CAP);
    this.commit();
  }

  private resolveParticipants(): PlayerView[] {
    const { round, config } = this.state;
    if (!round) return [];
    if (config.mode === 'CAO_CAI') {
      const cai = this.findPlayer(this.state.caiId);
      const cons = this.state.players.filter(
        (p) => !p.isCai && p.connected && (round.bets[p.id] ?? 0) > 0,
      );
      return cai && cons.length > 0 ? [cai, ...cons] : [];
    }
    return this.state.players.filter((p) => (round.bets[p.id] ?? 0) > 0);
  }

  /** Host edits room settings in the lobby. Validated by the protocol schema. */
  private applyConfig(patch: Partial<RoomConfig>): void {
    const next: RoomConfig = { ...this.state.config, ...patch };
    if (next.minBet > next.maxBet) next.maxBet = next.minBet;
    // startingBalance / maxPlayers changes affect future joiners, not existing seats.
    this.state.config = next;
    this.commit();
  }

  private toLobby(): void {
    this.clearTimer();
    this.pendingSeed = null;
    this.pendingPlayerSeeds = {};
    this.state.status = 'LOBBY';
    this.state.round = null;
    this.commit();
  }

  // ── chat ──────────────────────────────────────────────────────────────

  private addChat(playerId: string, name: string, text: string): void {
    this.state.chat = [
      ...this.state.chat,
      { id: genId(), playerId, name, text, ts: Date.now() },
    ].slice(-CHAT_CAP);
    this.commit();
  }

  private addReaction(playerId: string, name: string, emoji: string): void {
    if (!ALLOWED_EMOJIS.has(emoji)) return;
    this.state.reactions = [
      ...this.state.reactions,
      { id: genId(), playerId, name, emoji, ts: Date.now() },
    ].slice(-REACTION_CAP);
    this.commit();
  }

  private findSpectatorName(id: string): string | undefined {
    return this.state.spectators.find((s) => s.id === id)?.name;
  }

  // ── helpers ───────────────────────────────────────────────────────────

  private findPlayer(id: string): PlayerView | undefined {
    return this.state.players.find((p) => p.id === id);
  }

  private uniqueName(raw: string): string {
    const base = raw.trim().slice(0, 20) || 'Người chơi';
    const taken = new Set([
      ...this.state.players.map((p) => p.name),
      ...this.state.spectators.map((s) => s.name),
    ]);
    if (!taken.has(base)) return base;
    for (let i = 2; i < 100; i++) {
      const candidate = `${base} #${i}`;
      if (!taken.has(candidate)) return candidate;
    }
    return `${base} #${genId().slice(0, 4)}`;
  }

  private reject(playerId: string, code: 'ROOM_FULL' | 'NAME_TAKEN' | 'BET_REJECTED' | 'NOT_ALLOWED' | 'BAD_STATE', reason: string): void {
    this.cb.sendTo(playerId, { v: 1, type: 'ERROR', code, reason });
  }

  private clearTimer(): void {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }

  private commit(): void {
    this.state.version += 1;
    this.cb.broadcast(this.state);
  }
}
