import { Card } from './cards';
import { CARDS_PER_HAND, deckCanSeat, shuffle } from './deck';
import { evaluateHand, Hand } from './hand';

export interface DealtHand {
  playerId: string;
  hand: Hand;
}

export interface DealResult {
  hands: DealtHand[];
  /** Cards consumed from the deck (3 × players). */
  usedCards: number;
}

/**
 * Deal 3 cards to each player from a pre-shuffled deck, round-robin in seat
 * order (one card to each per pass, three passes) as in a real deal.
 *
 * `playerIds` must be in deal order. The shuffled deck is the single source of
 * randomness — every hand, including the cái's, comes from the same deck with
 * no positional advantage.
 */
export function dealFromDeck(deck: readonly Card[], playerIds: readonly string[]): DealResult {
  const n = playerIds.length;
  if (!deckCanSeat(n)) {
    throw new Error(`Cannot deal to ${n} players: needs ${n * CARDS_PER_HAND} cards, deck has ${deck.length}`);
  }

  const piles: Card[][] = playerIds.map(() => []);
  let idx = 0;
  for (let pass = 0; pass < CARDS_PER_HAND; pass++) {
    for (let seat = 0; seat < n; seat++) {
      piles[seat]!.push(deck[idx]!);
      idx++;
    }
  }

  return {
    hands: playerIds.map((playerId, seat) => ({
      playerId,
      hand: evaluateHand(piles[seat]!),
    })),
    usedCards: idx,
  };
}

/** Convenience: shuffle a deck with `seed` then deal in seat order. */
export function shuffleAndDeal(
  deck: readonly Card[],
  seed: Uint8Array,
  playerIds: readonly string[],
): DealResult {
  return dealFromDeck(shuffle(deck, seed), playerIds);
}
