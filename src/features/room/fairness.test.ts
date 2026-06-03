import { describe, expect, it } from 'vitest';
import { createDeck, dealFromDeck, shuffle } from '@/features/cao';
import { bytesToHex, combineSeeds, randomSeedHex, sha256Hex } from '@/utils/crypto';
import { randomSeed } from '@/utils/crypto';
import { verifyRound } from './fairness';
import type { RevealedHand, RoundView } from './types';

/** Build a revealed round the same way the authority does. */
async function buildRound(): Promise<RoundView> {
  const hostSeed = randomSeed(32);
  const deckCommitment = await sha256Hex(hostSeed);
  const dealOrder = ['cai', 'a', 'b'];
  const playerSeeds = { a: randomSeedHex(), b: randomSeedHex() };

  const finalSeed = combineSeeds(hostSeed, Object.values(playerSeeds));
  const deck = shuffle(createDeck(), finalSeed);
  const dealt = dealFromDeck(deck, dealOrder).hands;

  const hands: Record<string, RevealedHand> = {};
  for (const d of dealt) {
    hands[d.playerId] = { cards: d.hand.cards, score: d.hand.score, baTien: d.hand.baTien };
  }

  return {
    roundNumber: 1,
    bets: { a: 50, b: 50 },
    endsAt: null,
    hands,
    dealOrder,
    deckCommitment,
    hostSeedRevealed: bytesToHex(hostSeed),
    playerSeeds,
  };
}

describe('verifyRound', () => {
  it('verifies an honest round', async () => {
    const round = await buildRound();
    expect(await verifyRound(round)).toEqual({ state: 'ok' });
  });

  it('is pending before the host seed is revealed', async () => {
    const round = await buildRound();
    const betting: RoundView = { ...round, hostSeedRevealed: undefined, hands: undefined };
    expect(await verifyRound(betting)).toEqual({ state: 'pending' });
  });

  it('fails if the host seed does not match the commitment', async () => {
    const round = await buildRound();
    const tampered: RoundView = { ...round, deckCommitment: 'deadbeef' };
    const result = await verifyRound(tampered);
    expect(result.state).toBe('failed');
  });

  it('fails if a dealt card was swapped (deck altered)', async () => {
    const round = await buildRound();
    const swapped = structuredClone(round);
    // Corrupt one of player a's cards so it no longer matches the seed.
    swapped.hands!.a!.cards[0] = { rank: 'A', suit: 'D' };
    const result = await verifyRound(swapped);
    // Either the corrupted card already differed, or A♦ collides — assert failure
    // unless by astronomical chance it was already A♦ (then the round is still valid).
    if (round.hands!.a!.cards[0]!.rank === 'A' && round.hands!.a!.cards[0]!.suit === 'D') {
      expect(result.state).toBe('ok');
    } else {
      expect(result.state).toBe('failed');
    }
  });
});
