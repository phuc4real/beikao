import { createClient, type SupabaseClient } from '@supabase/supabase-js';

/**
 * Supabase client for the Phase-3 server-authoritative backend.
 *
 * The anon key is a public, RLS-gated key (safe to ship in the bundle) — every
 * authoritative mutation goes through Edge Functions running with the
 * service-role key, never directly from the browser. See TDD §19.
 *
 * Returns null when Supabase isn't configured, so the P2P build keeps working
 * with no env set.
 */

const URL = import.meta.env.VITE_SUPABASE_URL;
const ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

let client: SupabaseClient | null = null;

export function isSupabaseConfigured(): boolean {
  return Boolean(URL && ANON_KEY);
}

/** The shared Supabase client, or null if env is missing. Cached per tab. */
export function getSupabase(): SupabaseClient | null {
  if (!isSupabaseConfigured()) return null;
  if (!client) {
    client = createClient(URL!, ANON_KEY!, {
      // Persist the (anonymous) session so the player's identity — and thus their
      // seat + durable profile/balance — survives reloads. See auth.ts (3d).
      auth: { persistSession: true, autoRefreshToken: true },
      realtime: { params: { eventsPerSecond: 10 } },
    });
  }
  return client;
}
