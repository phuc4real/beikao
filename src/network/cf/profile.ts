// Cloudflare wallet — twin of network/supabase/profile.ts (same signatures). The
// SECURITY-DEFINER SQL RPCs become Worker endpoints keyed to the VERIFIED token
// uid (claim_topup / claim_daily_gift); the read is public (balance isn't secret).

import { apiGet, apiPost } from './apiClient';

export interface Wallet {
  balance: number;
  /** VN-time date (YYYY-MM-DD) of the last claimed daily gift; null = never. */
  lastGiftAt: string | null;
}

/** Null if the player has no profile yet (created server-side on first room join). */
export async function fetchWallet(id: string): Promise<Wallet | null> {
  const res = await apiGet<{ ok: boolean; wallet: Wallet | null }>(`/api/wallet/${encodeURIComponent(id)}`);
  return res?.wallet ?? null;
}

/** +2000 to MY wallet (server credits the verified token uid). Null if no profile/session. */
export async function claimTopup(): Promise<number | null> {
  const res = await apiPost<{ ok: boolean; balance: number | null }>('/api/wallet/topup', undefined, true);
  return res?.balance ?? null;
}

/** +1000 once per VN-day, claim-only. Null if already claimed today / no profile. */
export async function claimDailyGift(): Promise<number | null> {
  const res = await apiPost<{ ok: boolean; balance: number | null }>('/api/wallet/daily', undefined, true);
  return res?.balance ?? null;
}
