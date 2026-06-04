/**
 * Distribute n opponents along the upper arc of the elliptical felt
 * (the local player lives in the bottom hand bar, never on the felt).
 * Returns angles in radians; 180° (left edge) → 360° (right edge).
 */
export function seatAngles(n: number): number[] {
  if (n <= 0) return [];
  return Array.from({ length: n }, (_, i) => ((180 + ((i + 0.5) / n) * 180) * Math.PI) / 180);
}

/** Percent coordinates on the felt for a seat angle. */
export function seatXY(angle: number): { x: number; y: number } {
  return { x: 50 + 46 * Math.cos(angle), y: 53 + 38 * Math.sin(angle) };
}

/* ── Deal choreography ─────────────────────────────────────────────────
   After betting closes, cards fly from the deck (felt centre) to every
   desk round-robin, card by card — like a real deal. */

/** Gap between two consecutive dealt cards. */
export const DEAL_STEP_MS = 90;
/** Flight time of one card (must match `.deal-fly` in index.css). */
export const DEAL_FLIGHT_MS = 550;
/** When the whole deal (3 cards × n seats) has landed — flips wait this out. */
export function dealSpanMs(playerCount: number): number {
  return 3 * playerCount * DEAL_STEP_MS + DEAL_FLIGHT_MS;
}
