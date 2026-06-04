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

/** Full flip duration (both half-turns) — matches FLIP_HALF_MS in TableCard. */
export const FLIP_MS = 500;

/**
 * When card `i` (0..2) of a seat starts its reveal flip. Seats flip in seat
 * order, the cái LAST (its base is placed after every con) for suspense.
 * `seatFlipDelayMs(..., 2) + FLIP_MS` is therefore when that seat's hand is
 * fully visible — result readouts (points badge, win/lose dressing) must wait
 * until then or they spoil the reveal.
 */
export function seatFlipDelayMs(seatCount: number, seatIndex: number, isCai: boolean, i: number): number {
  return dealSpanMs(seatCount) + (isCai ? seatCount : seatIndex) * 220 + i * 80 + 200;
}

/**
 * When the full REVEAL choreography is over: deal flight + the staggered flips
 * (the cái flips last) + a drama beat. The result overlay appears now, and the
 * HUD balance settles now — so the number, its ±flash, and the result land
 * together instead of the balance jumping while cards are still face-down.
 */
export function revealSettleMs(playerCount: number): number {
  return dealSpanMs(playerCount) + playerCount * 220 + 1800;
}
