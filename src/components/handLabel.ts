import type { RevealedHand } from '@/features/room/types';

/** Vietnamese label for a revealed hand: ba tiên / cào (9) / bù (0) / score. */
export function handLabel(h: RevealedHand): string {
  if (h.baTien) return 'Ba tiên 🏆';
  if (h.score === 9) return '9 · cào';
  if (h.score === 0) return '0 · bù';
  return String(h.score);
}
