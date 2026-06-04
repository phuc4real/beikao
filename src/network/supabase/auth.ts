import { getSupabase } from './client';
import { getPlayerId } from '@/utils/storage';

/**
 * Player identity (Phase 3d). The identity is an anonymous Supabase Auth user id
 * — a real, upgradeable account (link email/OAuth later) that's stable across
 * reloads (the session is persisted), so seats and durable balances follow the
 * player. Falls back to the localStorage id if Supabase/anon-auth is unavailable.
 */

let cachedId: string | null = null;

/**
 * The persisted auth identity, if a session already exists. Async (it reads
 * the stored session) but with NO sign-in side effects — unlike ensureIdentity,
 * it never creates an anonymous user. Null for a brand-new visitor. Use this
 * for read-only lookups keyed by the auth uid (e.g. the Home wallet) — the
 * localStorage fallback id is a DIFFERENT uuid than the auth uid, so querying
 * with it would hit the wrong (nonexistent) profiles row.
 */
export async function peekIdentity(): Promise<string | null> {
  const supabase = getSupabase();
  if (!supabase) return null;
  const { data: { session } } = await supabase.auth.getSession();
  if (session?.user) cachedId = session.user.id;
  return session?.user?.id ?? null;
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
