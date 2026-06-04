import { getSupabase } from './client';

/** Durable per-player stats for the leaderboard (Phase 3d). Read-only/public. */
export interface LeaderboardRow {
  id: string;
  name: string | null;
  total_net: number;
  balance: number;
  rounds_played: number;
  wins: number;
}

/** Own durable wallet balance (drives the Home wallet). Null if unknown/new. */
export async function fetchProfileBalance(id: string): Promise<number | null> {
  const supabase = getSupabase();
  if (!supabase) return null;
  const { data, error } = await supabase.from('leaderboard').select('balance').eq('id', id).maybeSingle();
  if (error || !data) return null;
  return (data as { balance: number }).balance;
}

/** Top players by cumulative net winnings. Empty if Supabase isn't configured. */
export async function fetchLeaderboard(): Promise<LeaderboardRow[]> {
  const supabase = getSupabase();
  if (!supabase) return [];
  const { data, error } = await supabase
    .from('leaderboard')
    .select('id, name, total_net, balance, rounds_played, wins');
  if (error || !data) return [];
  return data as LeaderboardRow[];
}
