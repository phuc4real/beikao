import { Card, cardPoints, cardStrength, isFaceCard } from './cards';
import { CARDS_PER_HAND } from './deck';

export interface Hand {
  cards: [Card, Card, Card];
  /** "nút": last digit of the card-point sum, 0..9. 9 = "cào", 0 = "bù". */
  score: number;
  /** Three face cards (J/Q/K) — "ba tiên": auto-win, beats any score. */
  baTien: boolean;
}

/** Last digit of the 3-card point sum. */
export function handScore(cards: readonly Card[]): number {
  let sum = 0;
  for (const c of cards) sum += cardPoints(c);
  return sum % 10;
}

/** True when all three cards are face cards (J/Q/K). */
export function isBaTien(cards: readonly Card[]): boolean {
  return cards.length === CARDS_PER_HAND && cards.every(isFaceCard);
}

export function evaluateHand(cards: readonly Card[]): Hand {
  if (cards.length !== CARDS_PER_HAND) {
    throw new Error(`A Bài cào hand must have exactly ${CARDS_PER_HAND} cards, got ${cards.length}`);
  }
  const tuple = [cards[0]!, cards[1]!, cards[2]!] as [Card, Card, Card];
  return {
    cards: tuple,
    score: handScore(tuple),
    baTien: isBaTien(tuple),
  };
}

/** Cards sorted strongest-first (suit dominates rank). */
function cardsByStrengthDesc(hand: Hand): Card[] {
  return hand.cards.slice().sort((a, b) => cardStrength(b) - cardStrength(a));
}

/**
 * Break a tie (equal score, or both ba tiên) by comparing each hand's cards
 * strongest-first. With a single deck no two hands can share a card, so this is
 * a strict ordering — there are no true pushes.
 */
function tieBreak(a: Hand, b: Hand): number {
  const as = cardsByStrengthDesc(a);
  const bs = cardsByStrengthDesc(b);
  for (let i = 0; i < as.length; i++) {
    const diff = cardStrength(as[i]!) - cardStrength(bs[i]!);
    if (diff !== 0) return diff;
  }
  return 0; // unreachable with one deck
}

/**
 * Compare two hands. Returns >0 if `a` beats `b`, <0 if `b` beats `a`, 0 only
 * if truly identical (impossible with a single deck).
 *
 * Ranking tiers, high → low:
 *   1. ba tiên beats any non-ba-tiên hand
 *   2. higher score ("nút") wins
 *   3. tie → suit-rank of the strongest card (♦ > ♥ > ♣ > ♠; A♦ supreme)
 */
export function compareHands(a: Hand, b: Hand): number {
  if (a.baTien !== b.baTien) return a.baTien ? 1 : -1;
  if (!a.baTien && a.score !== b.score) return a.score - b.score;
  return tieBreak(a, b);
}

/** The single strongest card in a hand (decides ties; useful for UI callouts). */
export function topCard(hand: Hand): Card {
  return cardsByStrengthDesc(hand)[0]!;
}
