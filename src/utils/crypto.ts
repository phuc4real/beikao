/**
 * Cryptographically secure random seed for the deck shuffle. The engine expands
 * this deterministically, so the only randomness comes from here — never
 * Math.random. (Phase 2 provably-fair will commit to a hash of this seed.)
 */
export function randomSeed(bytes = 32): Uint8Array {
  const seed = new Uint8Array(bytes);
  crypto.getRandomValues(seed);
  return seed;
}

export function bytesToHex(bytes: Uint8Array): string {
  let hex = '';
  for (const b of bytes) hex += b.toString(16).padStart(2, '0');
  return hex;
}

export function hexToBytes(hex: string): Uint8Array {
  const clean = hex.length % 2 ? '0' + hex : hex;
  const out = new Uint8Array(clean.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(clean.slice(i * 2, i * 2 + 2), 16);
  return out;
}

export function randomSeedHex(bytes = 16): string {
  return bytesToHex(randomSeed(bytes));
}

/** SHA-256 of bytes, as lowercase hex. Used for the provably-fair commitment. */
export async function sha256Hex(bytes: Uint8Array): Promise<string> {
  // Copy into a plain ArrayBuffer so the type is an unambiguous BufferSource.
  const buffer = new ArrayBuffer(bytes.length);
  new Uint8Array(buffer).set(bytes);
  const digest = await crypto.subtle.digest('SHA-256', buffer);
  return bytesToHex(new Uint8Array(digest));
}

/**
 * Combine the host seed with all player seeds into the final shuffle seed.
 * Player seed hexes are sorted so host and verifier derive an identical seed
 * regardless of arrival order. The host committed to its seed before betting,
 * so it cannot grind this; players can't predict it (host seed is hidden until
 * reveal), so they can't grind it either.
 */
export function combineSeeds(hostSeed: Uint8Array, playerSeedHexes: readonly string[]): Uint8Array {
  const parts = [hostSeed, ...[...playerSeedHexes].sort().map(hexToBytes)];
  const total = parts.reduce((n, p) => n + p.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const p of parts) {
    out.set(p, offset);
    offset += p.length;
  }
  return out;
}
