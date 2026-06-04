// Identity / auth (cloudflare_migration_plan.md §4.1) — the one genuinely new
// piece. Supabase gave us anonymous-but-real, reload-stable uids for free; on
// Cloudflare we mint our own: a signed token over {uid, iat}, HMAC-SHA256 with a
// secret in Worker env (AUTH_SIGNING_KEY). The client stores it in localStorage
// (replacing the persisted Supabase session) and presents it on every
// authenticated call + the WS HELLO, so the server derives a *verified*
// playerId that can't be spoofed ("clients send intentions, never results").
//
// Format: base64url(JSON payload) "." base64url(HMAC). Stateless — no DB lookup
// to verify. Upgrade-friendly: linking email/OAuth later just mints a token for
// an authenticated user and migrates the D1 profile row.

export interface TokenPayload {
  /** Stable player id (also the D1 profiles PK). */
  uid: string;
  /** Issued-at, epoch ms. */
  iat: number;
}

const enc = new TextEncoder();
const dec = new TextDecoder();

function b64urlEncode(bytes: Uint8Array): string {
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function b64urlDecode(s: string): Uint8Array {
  const pad = s.length % 4 === 0 ? '' : '='.repeat(4 - (s.length % 4));
  const bin = atob(s.replace(/-/g, '+').replace(/_/g, '/') + pad);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

async function hmacKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, [
    'sign',
    'verify',
  ]);
}

/** Constant-time equality (avoid leaking signature bytes via timing). */
function timingSafeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i]! ^ b[i]!;
  return diff === 0;
}

/** Mint a signed token for a uid. `now` is epoch ms (Date.now() in the Worker). */
export async function mintToken(uid: string, secret: string, now: number): Promise<string> {
  const payload: TokenPayload = { uid, iat: now };
  const body = b64urlEncode(enc.encode(JSON.stringify(payload)));
  const key = await hmacKey(secret);
  const sig = new Uint8Array(await crypto.subtle.sign('HMAC', key, enc.encode(body)));
  return `${body}.${b64urlEncode(sig)}`;
}

/** Verify a token's signature and return its payload, or null if invalid/malformed. */
export async function verifyToken(token: string, secret: string): Promise<TokenPayload | null> {
  const dot = token.indexOf('.');
  if (dot <= 0) return null;
  const body = token.slice(0, dot);
  const sigPart = token.slice(dot + 1);
  try {
    const key = await hmacKey(secret);
    const expected = new Uint8Array(await crypto.subtle.sign('HMAC', key, enc.encode(body)));
    const given = b64urlDecode(sigPart);
    if (!timingSafeEqual(expected, given)) return null;
    const payload = JSON.parse(dec.decode(b64urlDecode(body))) as Partial<TokenPayload>;
    if (typeof payload.uid !== 'string' || typeof payload.iat !== 'number') return null;
    return { uid: payload.uid, iat: payload.iat };
  } catch {
    return null;
  }
}

/** A fresh random uid (matches Supabase's anonymous-uid shape: a UUID). */
export function newUid(): string {
  return crypto.randomUUID();
}
