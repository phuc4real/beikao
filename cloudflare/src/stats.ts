// Port of supabase/functions/_shared/stats.ts — pure, no Supabase dependency.
//
// Build the per-player result rows for a just-settled round (the input to
// recordRoundResult in d1.ts). Persists the post-settle balance so chips follow
// the player across rooms. Detected on the BETTING → REVEAL transition.

import type { RoomState } from '@/features/room/types';

export interface RoundResultRow {
  id: string;
  name: string;
  net: number;
  balance: number;
}

export function roundResults(state: RoomState): RoundResultRow[] {
  const deltas = state.round?.result?.deltas;
  if (!deltas) return [];
  const byId = new Map(state.players.map((p) => [p.id, p]));
  return Object.entries(deltas).map(([id, net]) => {
    const p = byId.get(id);
    return { id, name: p?.name ?? 'Người chơi', net, balance: p?.balance ?? 0 };
  });
}
