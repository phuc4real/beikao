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

/** Top players by cumulative net winnings. Empty if Supabase isn't configured. */
export async function fetchLeaderboard(): Promise<LeaderboardRow[]> {
  const supabase = getSupabase();
  if (!supabase) return [];
  const { data, error } = await supabase.from('leaderboard').select('*');
  if (error || !data) return [];
  return data as LeaderboardRow[];
}
