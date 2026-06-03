import { describe, expect, it } from 'vitest';
import { cardId } from './cards';
import { createDeck, deckCanSeat, maxPlayersForDeck, shuffle } from './deck';
import { dealFromDeck, shuffleAndDeal } from './deal';
import { seedFromString } from '@/utils/rng';

describe('createDeck', () => {
  it('produces 52 unique cards', () => {
    const deck = createDeck();
    expect(deck).toHaveLength(52);
    expect(new Set(deck.map(cardId)).size).toBe(52);
  });
});

describe('shuffle', () => {
  const seedA = seedFromString('seed-A');
  const seedB = seedFromString('seed-B');

  it('is deterministic: same seed → same order', () => {
    const a1 = shuffle(createDeck(), seedA).map(cardId);
    const a2 = shuffle(createDeck(), seedA).map(cardId);
    expect(a1).toEqual(a2);
  });

  it('different seeds → different order', () => {
    const a = shuffle(createDeck(), seedA).map(cardId);
    const b = shuffle(createDeck(), seedB).map(cardId);
    expect(a).not.toEqual(b);
  });

  it('preserves all 52 cards (permutation only) and does not mutate input', () => {
    const deck = createDeck();
    const original = deck.map(cardId);
    const shuffled = shuffle(deck, seedA);
    expect(new Set(shuffled.map(cardId))).toEqual(new Set(original));
    expect(deck.map(cardId)).toEqual(original); // input untouched
  });
});

describe('deck capacity guard', () => {
  it('one deck seats up to 17 players', () => {
    expect(maxPlayersForDeck()).toBe(17);
    expect(deckCanSeat(16)).toBe(true);
    expect(deckCanSeat(17)).toBe(true);
    expect(deckCanSeat(18)).toBe(false);
    expect(deckCanSeat(0)).toBe(false);
  });
});

describe('dealFromDeck', () => {
  it('deals 3 cards to each player round-robin in seat order', () => {
    const deck = createDeck(); // canonical order
    const { hands, usedCards } = dealFromDeck(deck, ['p0', 'p1']);
    expect(usedCards).toBe(6);
    // round-robin: p0 gets deck[0], deck[2], deck[4]; p1 gets deck[1], deck[3], deck[5]
    expect(hands[0]!.hand.cards).toEqual([deck[0], deck[2], deck[4]]);
    expect(hands[1]!.hand.cards).toEqual([deck[1], deck[3], deck[5]]);
  });

  it('every dealt card is unique across all hands', () => {
    const ids = new Set<string>();
    const { hands } = shuffleAndDeal(createDeck(), seedFromString('x'), [
      'a', 'b', 'c', 'd', 'e', 'f', 'g', 'h',
    ]);
    for (const h of hands) for (const card of h.hand.cards) ids.add(cardId(card));
    expect(ids.size).toBe(8 * 3);
  });

  it('throws if too many players for one deck', () => {
    const ids = Array.from({ length: 18 }, (_, i) => `p${i}`);
    expect(() => dealFromDeck(createDeck(), ids)).toThrow();
  });
});
