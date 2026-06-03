import { createDeck, dealFromDeck, shuffle } from '@/features/cao';
import { combineSeeds, hexToBytes, sha256Hex } from '@/utils/crypto';
import type { RoundView } from './types';

export type FairnessStatus =
  | { state: 'pending' } // committed but not yet revealed (during betting)
  | { state: 'verifying' }
  | { state: 'ok' }
  | { state: 'failed'; reason: string };

/**
 * Independently verify a revealed round:
 *  1. SHA-256(revealed host seed) must equal the commitment published before betting.
 *  2. Re-deriving the shuffle from (host seed + player seeds) must reproduce
 *     exactly the cards every player was dealt.
 * If both hold, the cái could not have altered the deck after seeing bets, and
 * no single party controlled the shuffle.
 */
export async function verifyRound(round: RoundView): Promise<FairnessStatus> {
  const { deckCommitment, hostSeedRevealed, playerSeeds, dealOrder, hands } = round;
  if (!deckCommitment) return { state: 'pending' };
  if (!hostSeedRevealed || !dealOrder || !hands) return { state: 'pending' };

  try {
    const hostSeed = hexToBytes(hostSeedRevealed);
    const commit = await sha256Hex(hostSeed);
    if (commit !== deckCommitment) return { state: 'failed', reason: 'Cam kết bộ bài không khớp' };

    const finalSeed = combineSeeds(hostSeed, Object.values(playerSeeds ?? {}));
    const deck = shuffle(createDeck(), finalSeed);
    const expected = dealFromDeck(deck, dealOrder).hands;

    for (const dh of expected) {
      const actual = hands[dh.playerId];
      if (!actual) return { state: 'failed', reason: 'Thiếu bài người chơi' };
      for (let i = 0; i < dh.hand.cards.length; i++) {
        const a = actual.cards[i];
        const e = dh.hand.cards[i]!;
        if (!a || a.rank !== e.rank || a.suit !== e.suit) {
          return { state: 'failed', reason: 'Bài không khớp với seed' };
        }
      }
    }
    return { state: 'ok' };
  } catch {
    return { state: 'failed', reason: 'Lỗi xác minh' };
  }
}
