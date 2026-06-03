import type { RoomState } from './types.ts';

export interface RoundResult {
  id: string;
  name: string;
  net: number;
  balance: number;
}

/**
 * Build the per-player result rows for a just-settled round (the input to
 * `record_round_result`), or null if there's nothing to record. Pure — the
 * caller passes the array straight into `commit_room` so stats are written in
 * the SAME transaction as the state commit (one round trip, atomic). Persists
 * the post-settle balance so chips follow the player across rooms. See 0008.
 */
export function roundResults(state: RoomState): RoundResult[] | null {
  const deltas = state.round?.result?.deltas;
  if (!deltas) return null;
  const playerById = new Map(state.players.map((p) => [p.id, p]));
  const results = Object.entries(deltas).map(([id, net]) => {
    const p = playerById.get(id);
    return { id, name: p?.name ?? 'Người chơi', net, balance: p?.balance ?? 0 };
  });
  return results.length > 0 ? results : null;
}
