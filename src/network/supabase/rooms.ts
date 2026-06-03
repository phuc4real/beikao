import { getSupabase } from './client';

/**
 * Active-room discovery (Phase 3, §19.9). Reads the `room_directory` view —
 * which exposes ONLY directory columns of public rooms still in the lobby — and
 * subscribes to live changes so the browser self-updates. Pure P2P can't offer
 * this (no shared list of rooms living in other browsers).
 */

export interface DirectoryRoom {
  code: string;
  name: string | null;
  mode: 'CAO_CAI' | 'CAO_RUA';
  status: string;
  player_count: number;
  max_players: number;
  created_at: string;
}

/** Public, joinable rooms, freshest first. Empty if Supabase isn't configured. */
export async function fetchDirectory(): Promise<DirectoryRoom[]> {
  const supabase = getSupabase();
  if (!supabase) return [];
  const { data, error } = await supabase
    .from('room_directory')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(50);
  if (error || !data) return [];
  return data as DirectoryRoom[];
}

/**
 * Call `onChange` whenever any room row changes (the view can't be subscribed
 * to directly, so we watch the base table and let the caller re-fetch the
 * filtered view). Returns an unsubscribe function.
 */
export function subscribeDirectory(onChange: () => void): () => void {
  const supabase = getSupabase();
  if (!supabase) return () => undefined;
  const channel = supabase
    .channel('room-directory')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'rooms' }, () => onChange())
    .subscribe();
  return () => {
    void supabase.removeChannel(channel);
  };
}
