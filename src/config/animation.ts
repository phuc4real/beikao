/**
 * Centralized animation / UX timing config (milliseconds) — the single source of
 * truth for the table "feel". Tune the game's pacing here.
 *
 * History: these were originally tuned long to *mask* the ~1s per-intent round
 * trip of the Supabase backend (chip flight, deal choreography, phase crossfades
 * all filled that second). On Cloudflare the round trip is ~tens of ms, so the
 * masking is no longer needed — the values below are snappy, keeping the deal and
 * flip cascades just long enough to read as "chia bài / lật bài", nothing more.
 *
 * JS reads `ANIM` directly. The handful of CSS durations that MUST stay in
 * lockstep with the JS choreography (deal flight, flip half-turn, balance flash,
 * phase crossfade) are published as `--anim-*` custom properties by
 * `applyAnimationVars()` (called once at startup) and referenced as `var(--anim-*)`
 * in the stylesheets — so each number lives in exactly one place.
 */
export const ANIM = {
  // ── deal ("chia bài") ────────────────────────────────────────────────
  /** Gap between two consecutive dealt cards (round-robin across seats). */
  dealStepMs: 45,
  /** Flight time of one card from the deck (felt centre) to its seat. CSS: `.deal-fly`. */
  dealFlightMs: 300,
  /** Drop-in-place entrance when there's no felt to fly from. CSS: `.deal-in`. */
  dealInMs: 240,

  // ── flip ("lật bài") ─────────────────────────────────────────────────
  /** Full reveal flip (both half-turns). */
  flipMs: 260,
  /** One half-turn (face-down → edge, then edge → face-up). CSS: `.flip-half`. = flipMs / 2. */
  flipHalfMs: 130,

  // ── reveal staggering (suspense; the cái flips last) ─────────────────
  /** Extra delay per seat before its hand flips. */
  seatFlipStaggerMs: 90,
  /** Extra delay per card within a hand. */
  cardFlipStaggerMs: 50,
  /** Drama beat before the first flip of the reveal. */
  flipLeadMs: 80,
  /** My-hand flip lead when I'm a con (not the cái). */
  conFlipLeadMs: 80,
  /** Pause after the last flip before the result overlay + HUD balance settle. */
  settleBeatMs: 500,
  /** First-flip lead for a history-replay hand. */
  replayLeadMs: 60,

  // ── chips ─────────────────────────────────────────────────────────────
  /** Chip-flight duration (bet button → my seat pot). */
  chipFlightMs: 380,
  /** Stagger between the flying chips. */
  chipStaggerMs: 50,

  // ── banners / flashes / misc ─────────────────────────────────────────
  /** HUD ±delta balance flash. CSS: `balanceFlash`. */
  balanceFlashMs: 1200,
  /** "Đã chốt cược" banner lifetime. */
  closedBannerMs: 900,
  /** Phase crossfade in. CSS: `phaseEnter`. */
  phaseEnterMs: 180,
  /** Phase crossfade out. CSS: `phaseLeave` (and the PhaseSwap cleanup timeout). */
  phaseLeaveMs: 150,
  /** "Đã sao chép" invite-copied confirmation. */
  inviteCopiedMs: 1500,
  /** Toast notice lifetime. */
  noticeMs: 3000,
  /** Chat popup-bubble lifetime when the chat drawer is closed. */
  chatPopupMs: 5000,
} as const;

/**
 * Publish the CSS-coupled durations onto `:root` as `--anim-*` custom properties.
 * Call once before the first render (see main.tsx). The stylesheets reference
 * these via `var(--anim-*, <fallback>)`, the fallbacks mirroring the values above.
 */
export function applyAnimationVars(root: HTMLElement = document.documentElement): void {
  const set = (name: string, ms: number) => root.style.setProperty(name, `${ms}ms`);
  set('--anim-deal-flight', ANIM.dealFlightMs);
  set('--anim-deal-in', ANIM.dealInMs);
  set('--anim-flip-half', ANIM.flipHalfMs);
  set('--anim-balance-flash', ANIM.balanceFlashMs);
  set('--anim-phase-enter', ANIM.phaseEnterMs);
  set('--anim-phase-leave', ANIM.phaseLeaveMs);
}
