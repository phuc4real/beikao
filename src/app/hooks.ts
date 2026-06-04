import { useEffect, useState } from 'react';

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
