// Cloudflare identity — the twin of network/supabase/auth.ts, SAME signatures so
// callers (the store, WalletPanel) are unchanged. The id is a Worker-minted,
// reload-stable, upgradeable uid carried by a signed token (migration plan §4.1).

import { apiPost, getStoredUid, getToken, storeIdentity } from './apiClient';
import { getPlayerId } from '@/utils/storage';

interface AnonResponse {
  ok: boolean;
  uid: string;
  token: string;
}

/**
 * The persisted identity if one exists, with NO mint side effect (read-only
 * lookups keyed by uid, e.g. the Home wallet). Null for a brand-new visitor.
 */
export async function peekIdentity(): Promise<string | null> {
  return getStoredUid();
}

/** Resolve the player id, minting + storing a signed token on first use. */
export async function ensureIdentity(): Promise<string> {
  const uid = getStoredUid();
  const token = getToken();
  if (uid && token) return uid;

  const res = await apiPost<AnonResponse>('/api/auth/anon');
  if (res?.ok && res.uid && res.token) {
    storeIdentity(res.uid, res.token);
    return res.uid;
  }
  // Degraded mode (same as the Supabase fallback): a local id with no server
  // token. Wallet/seat features that need the verified uid won't work, but the
  // app doesn't hard-crash. Same-origin means this path should be rare.
  return uid ?? getPlayerId();
}
