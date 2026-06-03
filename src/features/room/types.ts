import type { Card, GameMode } from '@/features/cao';

export type RoomStatus = 'LOBBY' | 'BETTING' | 'REVEAL';

export interface RoomConfig {
  maxPlayers: number; // 2–16 (deck supports ≤17)
  startingBalance: number;
  minBet: number;
  maxBet: number;
  bettingSeconds: number;
  mode: GameMode;
  baTienPayout: number; // multiplier, 1 = off
  caoPayout: number; // multiplier, 1 = off
  allowRebuy: boolean;
}

export const DEFAULT_CONFIG: RoomConfig = {
  maxPlayers: 16,
  startingBalance: 1000,
  minBet: 10,
  maxBet: 500,
  bettingSeconds: 15,
  mode: 'CAO_CAI',
  baTienPayout: 1,
  caoPayout: 1,
  allowRebuy: true,
};

export const MIN_PLAYERS = 2;
export const MAX_PLAYERS = 16;

export interface PlayerView {
  id: string;
  name: string;
  balance: number;
  ready: boolean;
  isCai: boolean;
  connected: boolean;
}

export interface RevealedHand {
  cards: Card[];
  score: number;
  baTien: boolean;
}

export interface RoundResult {
  mode: GameMode;
  /** Net chip change per player this round. */
  deltas: Record<string, number>;
  /** Cào cái: each con's result vs the cái. */
  outcomes?: Record<string, 'WIN' | 'LOSE'>;
  /** Cào rùa: the single pot winner. */
  potWinner?: string;
  roundNumber: number;
}

export interface RoundView {
  roundNumber: number;
  /** playerId → stake (Cào cái: cons only; Cào rùa: every participant's ante). */
  bets: Record<string, number>;
  /** Betting deadline in host-clock ms; null outside the betting window. */
  endsAt: number | null;
  /** Present only at REVEAL — hidden during betting so no one can peek. */
  hands?: Record<string, RevealedHand>;
  result?: RoundResult;

  // ── Provably-fair (commit–reveal) ──
  /** SHA-256(hostSeed), published when betting opens — locks the deck. */
  deckCommitment?: string;
  /** Host seed, revealed at REVEAL so clients can verify the commitment. */
  hostSeedRevealed?: string;
  /** Player entropy seeds (hex), revealed at REVEAL. Mixed into the shuffle. */
  playerSeeds?: Record<string, string>;
  /** Seat order used to deal — needed to reproduce the per-player deal. */
  dealOrder?: string[];
}

export interface ChatMessage {
  id: string;
  playerId: string;
  name: string;
  text: string;
  ts: number;
}

export interface ReactionMsg {
  id: string;
  playerId: string;
  name: string;
  emoji: string;
  ts: number;
}

export interface SpectatorView {
  id: string;
  name: string;
}

export const SPECTATOR_CAP = 50;

/**
 * The authoritative, broadcastable room state. The host holds the master copy;
 * clients render a mirror. NOTE: the deck/seed and unrevealed hands are NEVER
 * part of this object during betting — only `round.hands` at REVEAL.
 */
export interface RoomState {
  id: string; // room code
  hostId: string;
  caiId: string; // current dealer (= host in MVP)
  status: RoomStatus;
  config: RoomConfig;
  players: PlayerView[];
  /** Watch-only participants (don't hold a seat or balance; can chat/react). */
  spectators: SpectatorView[];
  round: RoundView | null;
  /** Completed rounds (full views with revealed hands), newest first — for replay. */
  history: RoundView[];
  chat: ChatMessage[];
  version: number;
}
