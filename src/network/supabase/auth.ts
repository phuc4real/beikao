import { getSupabase } from './client';
import { getPlayerId } from '@/utils/storage';

/**
 * Player identity (Phase 3d). The identity is an anonymous Supabase Auth user id
 * — a real, upgradeable account (link email/OAuth later) that's stable across
 * reloads (the session is persisted), so seats and durable balances follow the
 * player. Falls back to the localStorage id if Supabase/anon-auth is unavailable.
 */

let cachedId: string | null = null;

/** The resolved id if already known (sync) — for UI that can tolerate a miss. */
export function getCachedIdentity(): string {
  return cachedId ?? getPlayerId();
}

/** Resolve the player id, signing in anonymously on first use. */
export async function ensureIdentity(): Promise<string> {
  const supabase = getSupabase();
  if (!supabase) return getPlayerId();

  const { data: { session } } = await supabase.auth.getSession();
  if (session?.user) {
    cachedId = session.user.id;
    return cachedId;
  }
  const { data, error } = await supabase.auth.signInAnonymously();
  if (error || !data.user) {
    // Anonymous sign-in disabled/unavailable → degrade to the local id.
    return getPlayerId();
  }
  cachedId = data.user.id;
  return cachedId;
}
