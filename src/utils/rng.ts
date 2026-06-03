/**
 * Deterministic, seedable PRNG used by the game engine so a given seed always
 * produces the same shuffle. This makes rounds reproducible and is the basis
 * for the (Phase-2) provably-fair verification, where every client recomputes
 * the shuffle from the agreed seed.
 *
 * NOTE: this is deterministic, not cryptographically secure. Seeds must be
 * generated with crypto.getRandomValues (see utils/crypto). The PRNG only needs
 * to expand a high-entropy seed into a reproducible stream.
 */

/** Hash arbitrary bytes into a 32-bit state via FNV-1a. */
function fnv1a(bytes: Uint8Array): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < bytes.length; i++) {
    h ^= bytes[i]!;
    // h *= 16777619 with 32-bit overflow
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

export interface Rng {
  /** Next float in [0, 1). */
  next(): number;
  /** Unbiased integer in [0, maxExclusive). */
  int(maxExclusive: number): number;
}

/** mulberry32 — tiny, fast, good-enough distribution for shuffling. */
export function makeRng(seed: Uint8Array): Rng {
  let state = fnv1a(seed) || 1;

  function nextUint32(): number {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return (t ^ (t >>> 14)) >>> 0;
  }

  return {
    next() {
      return nextUint32() / 0x100000000;
    },
    int(maxExclusive: number) {
      if (maxExclusive <= 0) return 0;
      // Rejection sampling to avoid modulo bias.
      const limit = 0x100000000 - (0x100000000 % maxExclusive);
      let r = nextUint32();
      while (r >= limit) r = nextUint32();
      return r % maxExclusive;
    },
  };
}

/** Create a seed from a plain string (tests, deterministic fixtures). */
export function seedFromString(s: string): Uint8Array {
  return new TextEncoder().encode(s);
}
