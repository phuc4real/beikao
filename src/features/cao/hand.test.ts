import { describe, expect, it } from 'vitest';
import { Card, Rank, Suit } from './cards';
import { compareHands, evaluateHand, handScore, isBaTien, topCard } from './hand';

const c = (rank: Rank, suit: Suit): Card => ({ rank, suit });

describe('handScore', () => {
  it('A=1, 2-10 face value, J/Q/K=10, last digit only', () => {
    expect(handScore([c('A', 'S'), c('2', 'S'), c('3', 'S')])).toBe(6); // 1+2+3
    expect(handScore([c('K', 'S'), c('Q', 'H'), c('9', 'D')])).toBe(9); // 10+10+9=29 → 9
    expect(handScore([c('5', 'C'), c('5', 'H'), c('K', 'S')])).toBe(0); // 20 → 0 (bù)
    expect(handScore([c('9', 'S'), c('9', 'H'), c('9', 'D')])).toBe(7); // 27 → 7
    expect(handScore([c('10', 'S'), c('J', 'H'), c('Q', 'D')])).toBe(0); // 0+10+10=20 → 0
  });

  it('the best score 9 is "cào", the worst 0 is "bù"', () => {
    expect(handScore([c('A', 'D'), c('3', 'S'), c('5', 'H')])).toBe(9); // cào
    expect(handScore([c('10', 'D'), c('10', 'S'), c('10', 'H')])).toBe(0); // bù
  });
});

describe('isBaTien', () => {
  it('is true only for three face cards', () => {
    expect(isBaTien([c('J', 'S'), c('Q', 'H'), c('K', 'D')])).toBe(true);
    expect(isBaTien([c('J', 'S'), c('J', 'H'), c('J', 'D')])).toBe(true);
    expect(isBaTien([c('J', 'S'), c('Q', 'H'), c('10', 'D')])).toBe(false); // 10 is not a face card
    expect(isBaTien([c('A', 'S'), c('K', 'H'), c('Q', 'D')])).toBe(false);
  });
});

describe('evaluateHand', () => {
  it('rejects hands that are not exactly 3 cards', () => {
    expect(() => evaluateHand([c('A', 'S'), c('2', 'S')])).toThrow();
    expect(() => evaluateHand([c('A', 'S'), c('2', 'S'), c('3', 'S'), c('4', 'S')])).toThrow();
  });
});

describe('compareHands — tier 1: ba tiên', () => {
  const baTien = evaluateHand([c('J', 'S'), c('Q', 'S'), c('K', 'S')]); // ba tiên, but score would be 0
  const cao = evaluateHand([c('A', 'D'), c('3', 'D'), c('5', 'D')]); // score 9

  it('ba tiên beats even a cào (9)', () => {
    expect(compareHands(baTien, cao)).toBeGreaterThan(0);
    expect(compareHands(cao, baTien)).toBeLessThan(0);
  });

  it('ba tiên ignores its own numeric score', () => {
    // baTien sums to 30 → score 0, yet it must win.
    expect(baTien.score).toBe(0);
    expect(compareHands(baTien, cao)).toBeGreaterThan(0);
  });
});

describe('compareHands — tier 2: higher score wins', () => {
  it('higher nút beats lower nút', () => {
    const nine = evaluateHand([c('A', 'D'), c('3', 'S'), c('5', 'H')]); // 9
    const eight = evaluateHand([c('A', 'C'), c('3', 'C'), c('4', 'C')]); // 8
    expect(compareHands(nine, eight)).toBeGreaterThan(0);
    expect(compareHands(eight, nine)).toBeLessThan(0);
  });

  it('bù (0) loses to any positive score', () => {
    const bu = evaluateHand([c('10', 'D'), c('10', 'S'), c('K', 'D')]); // 0
    const one = evaluateHand([c('A', 'S'), c('10', 'C'), c('K', 'C')]); // 1
    expect(compareHands(one, bu)).toBeGreaterThan(0);
  });
});

describe('compareHands — tier 3: suit tie-break (♦ > ♥ > ♣ > ♠)', () => {
  // Both score 9; differ only by the suit of the top card.
  const mk = (suit: Suit) => evaluateHand([c('A', suit), c('3', suit), c('5', suit)]);

  it('ranks diamond > heart > club > spade on equal score', () => {
    expect(compareHands(mk('D'), mk('H'))).toBeGreaterThan(0);
    expect(compareHands(mk('H'), mk('C'))).toBeGreaterThan(0);
    expect(compareHands(mk('C'), mk('S'))).toBeGreaterThan(0);
    expect(compareHands(mk('D'), mk('S'))).toBeGreaterThan(0);
  });

  it('is a strict total order across all four suits', () => {
    const order = [mk('S'), mk('C'), mk('H'), mk('D')];
    for (let i = 0; i < order.length; i++) {
      for (let j = 0; j < order.length; j++) {
        const cmp = compareHands(order[i]!, order[j]!);
        if (i === j) expect(cmp).toBe(0);
        else if (i < j) expect(cmp).toBeLessThan(0);
        else expect(cmp).toBeGreaterThan(0);
      }
    }
  });

  it('suit dominates rank: a higher card of a weaker suit still loses', () => {
    // Hand A top card K♠ (strong rank, weak suit) vs hand B top card 2♦ (weak rank, strong suit).
    const a = evaluateHand([c('K', 'S'), c('5', 'S'), c('4', 'S')]); // 10+5+4=19 → 9
    const b = evaluateHand([c('2', 'D'), c('3', 'D'), c('4', 'D')]); // 9
    expect(a.score).toBe(9);
    expect(b.score).toBe(9);
    expect(compareHands(b, a)).toBeGreaterThan(0); // diamond top beats spade top
  });
});

describe('compareHands — ba tiên vs ba tiên', () => {
  it('breaks by the strongest face card suit', () => {
    const withDiamond = evaluateHand([c('K', 'D'), c('Q', 'S'), c('J', 'S')]);
    const withSpade = evaluateHand([c('K', 'S'), c('Q', 'C'), c('J', 'C')]);
    expect(compareHands(withDiamond, withSpade)).toBeGreaterThan(0);
  });
});

describe('topCard', () => {
  it('returns the strongest card (suit-weighted)', () => {
    const h = evaluateHand([c('K', 'S'), c('2', 'D'), c('3', 'C')]);
    expect(topCard(h)).toEqual(c('2', 'D')); // diamond beats the spade king
  });

  it('A♦ is the single strongest card in the deck', () => {
    const withAceDiamond = evaluateHand([c('A', 'D'), c('2', 'S'), c('3', 'S')]);
    expect(topCard(withAceDiamond)).toEqual(c('A', 'D'));
  });
});
