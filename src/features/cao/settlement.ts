import { compareHands, Hand } from './hand';

export type GameMode = 'CAO_CAI' | 'CAO_RUA';

export interface PayoutConfig {
  /** Multiplier when the winning hand is ba tiên. 1 = bonus off. */
  baTienPayout: number;
  /** Multiplier when the winning hand is score 9 ("cào", non-ba-tiên). 1 = off. */
  caoPayout: number;
}

export const DEFAULT_PAYOUT: PayoutConfig = { baTienPayout: 1, caoPayout: 1 };

/** Magnitude multiplier for a win, based on the winning hand's special status. */
function winMultiplier(winner: Hand, cfg: PayoutConfig): number {
  if (winner.baTien) return cfg.baTienPayout;
  if (winner.score === 9) return cfg.caoPayout;
  return 1;
}

export type ConOutcome = 'WIN' | 'LOSE';

export interface CaoCaiCon {
  playerId: string;
  hand: Hand;
  /** Stake the con bet against the cái (integer chips, already validated). */
  bet: number;
}

export interface SettlementResult {
  /** Net chip change per player (integer). Sums to zero across all players. */
  deltas: Record<string, number>;
  /** Cào cái only: each con's result vs the cái. */
  outcomes?: Record<string, ConOutcome>;
  /** Cào rùa only: the single pot winner. */
  potWinner?: string;
}

/**
 * Cào cái settlement: the cái's hand is compared against each con independently.
 * The cái wins ties (resolved by suit, so a true push is impossible). Net is
 * zero-sum: whatever the cons gain/lose, the cái loses/gains the opposite.
 */
export function settleCaoCai(
  caiId: string,
  caiHand: Hand,
  cons: readonly CaoCaiCon[],
  cfg: PayoutConfig = DEFAULT_PAYOUT,
): SettlementResult {
  const deltas: Record<string, number> = { [caiId]: 0 };
  const outcomes: Record<string, ConOutcome> = {};

  for (const con of cons) {
    const cmp = compareHands(con.hand, caiHand);
    let conDelta: number;
    if (cmp > 0) {
      conDelta = Math.floor(con.bet * winMultiplier(con.hand, cfg));
      outcomes[con.playerId] = 'WIN';
    } else {
      // cmp < 0 (cái wins); cmp === 0 is impossible with a single deck.
      conDelta = -Math.floor(con.bet * winMultiplier(caiHand, cfg));
      outcomes[con.playerId] = 'LOSE';
    }
    deltas[con.playerId] = conDelta;
    deltas[caiId]! -= conDelta;
  }

  return { deltas, outcomes };
}

/**
 * Cào rùa (pot) settlement: every player antes `ante`; the single strongest
 * hand takes the whole pot. Net is zero-sum. Bonuses do not apply in pot mode.
 */
export function settlePot(
  ante: number,
  hands: ReadonlyArray<{ playerId: string; hand: Hand }>,
): SettlementResult {
  if (hands.length < 2) {
    throw new Error('Pot mode needs at least 2 players');
  }
  let winner = hands[0]!;
  for (let i = 1; i < hands.length; i++) {
    if (compareHands(hands[i]!.hand, winner.hand) > 0) winner = hands[i]!;
  }

  const deltas: Record<string, number> = {};
  for (const { playerId } of hands) {
    deltas[playerId] = playerId === winner.playerId ? ante * (hands.length - 1) : -ante;
  }

  return { deltas, potWinner: winner.playerId };
}
