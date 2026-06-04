import type { RevealedHand } from '@/features/room/types';

/**
 * Vietnamese display label for a revealed hand, in the design's wording —
 * but keeping the engine/GDD term "ba tiên" (NOT the handoff's "Ba Tây").
 */
export function handLabel(h: RevealedHand): string {
  if (h.baTien) return 'BA TIÊN';
  if (h.score === 9) return 'CÀO CHÍN';
  if (h.score === 0) return 'BÙ';
  return `${h.score} điểm`;
}

/** True for the hands that get the gold "best hand" treatment. */
export function isCaoHand(h: RevealedHand): boolean {
  return h.baTien || h.score === 9;
}
