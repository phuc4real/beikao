import type { SupabaseClient } from 'npm:@supabase/supabase-js@2';
import type { RoomState } from './types.ts';

/**
 * Record a just-settled round's per-player net into durable `profiles` (powers
 * the leaderboard). Call only when a round transitioned into REVEAL. Failures
 * are swallowed — stats must never break gameplay. See migration 0003.
 */
export async function recordRound(db: SupabaseClient, state: RoomState): Promise<void> {
  const deltas = state.round?.result?.deltas;
  if (!deltas) return;
  const playerById = new Map(state.players.map((p) => [p.id, p]));
  const results = Object.entries(deltas).map(([id, net]) => {
    const p = playerById.get(id);
    // Persist the post-settle balance so chips follow the player to other rooms.
    return { id, name: p?.name ?? 'Người chơi', net, balance: p?.balance ?? 0 };
  });
  if (results.length === 0) return;
  try {
    await db.rpc('record_round_result', { results });
  } catch {
    /* stats are best-effort */
  }
}
