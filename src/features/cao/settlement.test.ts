import { describe, expect, it } from 'vitest';
import { Card, Rank, Suit } from './cards';
import { evaluateHand } from './hand';
import { settleCaoCai, settlePot } from './settlement';

const c = (rank: Rank, suit: Suit): Card => ({ rank, suit });
const hand = (cards: [Card, Card, Card]) => evaluateHand(cards);

const NINE = hand([c('A', 'D'), c('3', 'S'), c('5', 'H')]); // score 9
const EIGHT = hand([c('A', 'C'), c('3', 'C'), c('4', 'C')]); // score 8
const BU = hand([c('10', 'S'), c('10', 'H'), c('K', 'S')]); // score 0
const BA_TIEN = hand([c('J', 'S'), c('Q', 'S'), c('K', 'S')]);

describe('settleCaoCai', () => {
  it('pays a winning con and debits the cái (zero-sum)', () => {
    const r = settleCaoCai('cai', EIGHT, [{ playerId: 'con', hand: NINE, bet: 100 }]);
    expect(r.outcomes!.con).toBe('WIN');
    expect(r.deltas.con).toBe(100);
    expect(r.deltas.cai).toBe(-100);
  });

  it('the cái takes a losing con’s bet', () => {
    const r = settleCaoCai('cai', NINE, [{ playerId: 'con', hand: EIGHT, bet: 100 }]);
    expect(r.outcomes!.con).toBe('LOSE');
    expect(r.deltas.con).toBe(-100);
    expect(r.deltas.cai).toBe(100);
  });

  it('the cái wins score ties (resolved by suit, never a push)', () => {
    // Both score 9; cái holds the diamond top card, con the heart → cái wins.
    const conNine = hand([c('A', 'H'), c('3', 'H'), c('5', 'C')]);
    const r = settleCaoCai('cai', NINE, [{ playerId: 'con', hand: conNine, bet: 50 }]);
    expect(r.outcomes!.con).toBe('LOSE');
    expect(r.deltas.cai).toBe(50);
  });

  it('settles each con independently and nets zero-sum for the cái', () => {
    const r = settleCaoCai('cai', EIGHT, [
      { playerId: 'a', hand: NINE, bet: 100 }, // beats cái
      { playerId: 'b', hand: BU, bet: 40 }, // loses to cái
      { playerId: 'd', hand: BA_TIEN, bet: 10 }, // beats cái
    ]);
    expect(r.deltas.a).toBe(100);
    expect(r.deltas.b).toBe(-40);
    expect(r.deltas.d).toBe(10);
    expect(r.deltas.cai).toBe(-100 + 40 - 10); // -70
    const total = Object.values(r.deltas).reduce((s, v) => s + v, 0);
    expect(total).toBe(0);
  });

  it('applies ba tiên / cào multipliers only when bonuses are enabled', () => {
    const cfg = { baTienPayout: 3, caoPayout: 2 };
    const r = settleCaoCai(
      'cai',
      EIGHT,
      [
        { playerId: 'baTien', hand: BA_TIEN, bet: 100 }, // ×3
        { playerId: 'cao', hand: NINE, bet: 100 }, // ×2
      ],
      cfg,
    );
    expect(r.deltas.baTien).toBe(300);
    expect(r.deltas.cao).toBe(200);
    expect(r.deltas.cai).toBe(-500);
  });

  it('uses integer chips (floors fractional multipliers)', () => {
    const r = settleCaoCai('cai', EIGHT, [{ playerId: 'con', hand: NINE, bet: 33 }], {
      baTienPayout: 1,
      caoPayout: 1.5,
    });
    expect(r.deltas.con).toBe(Math.floor(33 * 1.5)); // 49
    expect(Number.isInteger(r.deltas.con)).toBe(true);
  });
});

describe('settlePot (Cào rùa)', () => {
  it('the single strongest hand takes the whole pot, zero-sum', () => {
    const r = settlePot(50, [
      { playerId: 'a', hand: NINE },
      { playerId: 'b', hand: EIGHT },
      { playerId: 'c', hand: BU },
    ]);
    expect(r.potWinner).toBe('a');
    expect(r.deltas.a).toBe(100); // (3-1) * 50
    expect(r.deltas.b).toBe(-50);
    expect(r.deltas.c).toBe(-50);
    expect(Object.values(r.deltas).reduce((s, v) => s + v, 0)).toBe(0);
  });

  it('ba tiên wins the pot over a cào', () => {
    const r = settlePot(20, [
      { playerId: 'a', hand: NINE },
      { playerId: 'b', hand: BA_TIEN },
    ]);
    expect(r.potWinner).toBe('b');
  });

  it('requires at least 2 players', () => {
    expect(() => settlePot(10, [{ playerId: 'a', hand: NINE }])).toThrow();
  });
});
