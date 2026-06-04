import { getSupabase } from './client';

/**
 * Durable wallet for the Home "Số dư" panel. Reads `profiles` directly
 * (public read-only; only the server writes it — settles, top-ups, gifts).
 */
export interface Wallet {
  balance: number;
  /** VN-time date (YYYY-MM-DD) of the last claimed daily gift; null = never. */
  lastGiftAt: string | null;
}

/** Null if Supabase isn't configured or the player has no profile yet. */
export async function fetchWallet(id: string): Promise<Wallet | null> {
  const supabase = getSupabase();
  if (!supabase) return null;
  const { data, error } = await supabase
    .from('profiles')
    .select('balance, last_gift_at')
    .eq('id', id)
    .maybeSingle();
  if (error || !data) return null;
  const row = data as { balance: number; last_gift_at: string | null };
  return { balance: row.balance, lastGiftAt: row.last_gift_at ?? null };
}

/**
 * +2000 to MY wallet (the server credits auth.uid() from the JWT — the id can't
 * be spoofed). Returns the new balance, or null if it didn't apply (no session
 * / no profile yet).
 */
export async function claimTopup(): Promise<number | null> {
  const supabase = getSupabase();
  if (!supabase) return null;
  const { data, error } = await supabase.rpc('claim_topup');
  return !error && typeof data === 'number' ? data : null;
}

/**
 * +1000 to MY wallet, at most once per VN-time day, claim-only. Returns the
 * new balance, or null if already claimed today (the server is the authority
 * on the date — the client's "claimed" state is cosmetic).
 */
export async function claimDailyGift(): Promise<number | null> {
  const supabase = getSupabase();
  if (!supabase) return null;
  const { data, error } = await supabase.rpc('claim_daily_gift');
  return !error && typeof data === 'number' ? data : null;
}
