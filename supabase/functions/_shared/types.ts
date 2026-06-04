// Minimal structural types for the Edge Functions. The actual rules run inside
// the bundled GameAuthority (engine.bundle.js, imported as untyped values);
// these annotate only the fields the functions themselves read. They mirror a
// subset of src/features/room/types.ts — keep in sync if those fields change.

export interface RoomState {
  id: string;
  hostId: string;
  caiId: string;
  status: 'LOBBY' | 'BETTING' | 'REVEAL';
  config: { mode: 'CAO_CAI' | 'CAO_RUA'; maxPlayers: number; startingBalance: number };
  players: Array<{ id: string; name: string; connected: boolean; balance: number }>;
  round: { endsAt: number | null; result?: { deltas: Record<string, number> } } | null;
  version: number;
}

export interface AuthoritySecrets {
  pendingSeedHex: string | null;
  pendingPlayerSeeds: Record<string, string>;
  roundCounter: number;
}

export interface ServerMessage {
  v: 1;
  type: string;
  [k: string]: unknown;
}

export interface Intention {
  type: string;
  [k: string]: unknown;
}

/** The subset of GameAuthority the functions call (it's imported untyped from the bundle). */
export interface AuthorityLike {
  submit(playerId: string, intention: Intention): void | Promise<void>;
  disconnect(playerId: string): void;
  /** Permanent leave: frees the seat and promotes a new cái if needed. */
  leave(playerId: string): void;
  reconcilePresence(presentIds: readonly string[]): void;
  setBalance(playerId: string, balance: number): void;
  tickDeadline(now: number): boolean;
  getState(): RoomState;
  getSecrets(): AuthoritySecrets;
}
