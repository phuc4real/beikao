import { useEffect, useState } from 'react';
import type { SeatLayout } from '@/components/table/seatGeometry';

/** Subscribe to a CSS media query, SSR-safe. Returns false until mounted. */
function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(false);
  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return;
    const mql = window.matchMedia(query);
    const onChange = () => setMatches(mql.matches);
    onChange();
    mql.addEventListener('change', onChange);
    return () => mql.removeEventListener('change', onChange);
  }, [query]);
  return matches;
}

/**
 * Picks the felt/seat layout for the current viewport (see SeatLayout). Portrait
 * phones (≤720px wide) get the `tall` capsule felt; everything else stays `wide`.
 * `shortLandscape` flags squat landscape viewports (phones held sideways) where
 * height is the scarce axis. Presentation-only — never touches game state.
 */
export function useLayoutMode(): { layout: SeatLayout; shortLandscape: boolean } {
  const tallPortrait = useMediaQuery('(orientation: portrait) and (max-width: 720px)');
  const shortLandscape = useMediaQuery('(orientation: landscape) and (max-height: 520px)');
  return { layout: tallPortrait ? 'tall' : 'wide', shortLandscape };
}

/**
 * Seconds remaining until `endsAt` (host-clock epoch ms), ticking every 250ms.
 * Returns 0 when expired or when `endsAt` is null. Clients render this against
 * their own clock; the host remains the authority on when betting actually ends.
 */
/**
 * False until `delayMs` after mount (or after `resetKey` changes), then true.
 * Used to hold result readouts (points badge, win/loss, hand label) until the
 * card-flip choreography has actually shown the cards — otherwise the UI
 * spoils the reveal the moment the REVEAL state lands.
 */
export function useDelayedTrue(delayMs: number, resetKey: unknown): boolean {
  const [done, setDone] = useState(false);
  useEffect(() => {
    setDone(false);
    const t = setTimeout(() => setDone(true), delayMs);
    return () => clearTimeout(t);
  }, [delayMs, resetKey]);
  return done;
}

export function useCountdown(endsAt: number | null): number {
  const [, force] = useState(0);
  useEffect(() => {
    if (endsAt == null) return;
    const id = setInterval(() => force((n) => n + 1), 250);
    return () => clearInterval(id);
  }, [endsAt]);
  if (endsAt == null) return 0;
  return Math.max(0, Math.ceil((endsAt - Date.now()) / 1000));
}
