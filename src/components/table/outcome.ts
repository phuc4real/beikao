import type { PlayerView, RoundView } from '@/features/room/types';

/** 'win' | 'lose' | null dressing for a player once the round result is in. */
export function seatOutcome(p: PlayerView, round: RoundView): 'win' | 'lose' | null {
  const result = round.result;
  if (!result) return null;
  if (result.outcomes) {
    // Cào cái: cons carry an explicit outcome; the cái wins/loses by net delta.
    if (p.isCai) {
      const d = result.deltas[p.id] ?? 0;
      return d > 0 ? 'win' : d < 0 ? 'lose' : null;
    }
    const o = result.outcomes[p.id];
    return o === 'WIN' ? 'win' : o === 'LOSE' ? 'lose' : null;
  }
  // Cào rùa: single pot winner; every other revealed hand lost its ante.
  if (result.potWinner === p.id) return 'win';
  return round.hands?.[p.id] ? 'lose' : null;
}
