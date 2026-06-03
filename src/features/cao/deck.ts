import { Card, RANKS, SUITS } from './cards';
import { makeRng } from '@/utils/rng';

export const DECK_SIZE = 52;
export const CARDS_PER_HAND = 3;

/** A fresh 52-card deck in canonical order (suit-major). */
export function createDeck(): Card[] {
  const deck: Card[] = [];
  for (const suit of SUITS) {
    for (const rank of RANKS) {
      deck.push({ rank, suit });
    }
  }
  return deck;
}

/**
 * Deterministic Fisher–Yates shuffle. Same `seed` → same order. Does not mutate
 * the input deck.
 */
export function shuffle(deck: readonly Card[], seed: Uint8Array): Card[] {
  const out = deck.slice();
  const rng = makeRng(seed);
  for (let i = out.length - 1; i > 0; i--) {
    const j = rng.int(i + 1);
    const tmp = out[i]!;
    out[i] = out[j]!;
    out[j] = tmp;
  }
  return out;
}

/** Max players a single deck can serve (3 cards each). */
export function maxPlayersForDeck(): number {
  return Math.floor(DECK_SIZE / CARDS_PER_HAND); // 17
}

/** True if `playerCount` hands of 3 fit in one deck. */
export function deckCanSeat(playerCount: number): boolean {
  return playerCount >= 1 && playerCount * CARDS_PER_HAND <= DECK_SIZE;
}
