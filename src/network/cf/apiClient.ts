// Cloudflare API client — same-origin, so there is no base URL to configure and
// no VITE_* env var: the SPA is served by the same Worker that hosts the API/WS,
// and the browser derives everything from window.location (migration plan §7/§9.1).
//
// Identity is a Worker-minted signed token (replacing the persisted Supabase
// session): stored in localStorage, presented on the WS HELLO and as a Bearer on
// the authenticated wallet endpoints. The verified uid can't be spoofed.

const TOKEN_KEY = 'beikao.cf.token';
const UID_KEY = 'beikao.cf.uid';

/** `wss://<same-host>` (or `ws://` on http dev) — the room/lobby socket origin. */
export function wsBase(): string {
  const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${proto}//${location.host}`;
}

export function getToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export function getStoredUid(): string | null {
  try {
    return localStorage.getItem(UID_KEY);
  } catch {
    return null;
  }
}

export function storeIdentity(uid: string, token: string): void {
  try {
    localStorage.setItem(UID_KEY, uid);
    localStorage.setItem(TOKEN_KEY, token);
  } catch {
    /* private mode / storage disabled — degrade to in-memory for this tab */
  }
}

/** GET a JSON endpoint; null on network/HTTP error (callers treat null as "no data"). */
export async function apiGet<T>(path: string): Promise<T | null> {
  try {
    const res = await fetch(path);
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

/** POST a JSON endpoint; `auth` attaches the Bearer token. Null on error / non-2xx. */
export async function apiPost<T>(path: string, body?: unknown, auth = false): Promise<T | null> {
  try {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (auth) {
      const token = getToken();
      if (token) headers.Authorization = `Bearer ${token}`;
    }
    const res = await fetch(path, {
      method: 'POST',
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}
