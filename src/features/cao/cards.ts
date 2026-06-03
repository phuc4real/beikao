/**
 * Card primitives for Bài cào.
 *
 * Suit ranking is central to the game: ties on score are broken by the suit of
 * the strongest card, NOT by numeric rank. Order (high → low): ♦ > ♥ > ♣ > ♠.
 * The Ace of Diamonds (A♦) is therefore the single strongest card in the deck.
 */

export type Suit = 'D' | 'H' | 'C' | 'S'; // ♦ rô, ♥ cơ, ♣ chuồn/tép, ♠ bích
export type Rank =
  | 'A' | '2' | '3' | '4' | '5' | '6' | '7'
  | '8' | '9' | '10' | 'J' | 'Q' | 'K';

export interface Card {
  rank: Rank;
  suit: Suit;
}

export const SUITS: readonly Suit[] = ['D', 'H', 'C', 'S'];
export const RANKS: readonly Rank[] = [
  'A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K',
];

/** Higher number = stronger suit. ♦4 > ♥3 > ♣2 > ♠1. */
export const SUIT_STRENGTH: Record<Suit, number> = { D: 4, H: 3, C: 2, S: 1 };

/**
 * Rank strength for "highest card" tie-break comparison. Ace is HIGH here
 * (A > K > Q > … > 2) so that A♦ is the strongest card in the deck — distinct
 * from `cardPoints`, where Ace counts as 1.
 */
export const RANK_ORDER: Record<Rank, number> = {
  '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7, '8': 8,
  '9': 9, '10': 10, J: 11, Q: 12, K: 13, A: 14,
};

export const SUIT_SYMBOL: Record<Suit, string> = { D: '♦', H: '♥', C: '♣', S: '♠' };

/** Diamonds and hearts are red; clubs and spades black. */
export function isRedSuit(suit: Suit): boolean {
  return suit === 'D' || suit === 'H';
}

/** Bài cào point value: A=1, 2–10 face value, J/Q/K=10. */
export function cardPoints(card: Card): number {
  switch (card.rank) {
    case 'A':
      return 1;
    case 'J':
    case 'Q':
    case 'K':
      return 10;
    default:
      return Number(card.rank);
  }
}

/** Face cards J/Q/K — three of them form "ba tiên". */
export function isFaceCard(card: Card): boolean {
  return card.rank === 'J' || card.rank === 'Q' || card.rank === 'K';
}

/**
 * Total strength of a single card for tie-breaking. Suit dominates rank
 * (suit strength is weighted far above any rank), matching the rule that the
 * suit of the highest card decides ties and A♦ outranks everything.
 */
export function cardStrength(card: Card): number {
  return SUIT_STRENGTH[card.suit] * 100 + RANK_ORDER[card.rank];
}

/** Stable string id for a card, e.g. "A♦" — handy for keys/logging/equality. */
export function cardId(card: Card): string {
  return `${card.rank}${SUIT_SYMBOL[card.suit]}`;
}

export function cardsEqual(a: Card, b: Card): boolean {
  return a.rank === b.rank && a.suit === b.suit;
}
