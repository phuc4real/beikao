import { useCountdown } from '@/app/hooks';

/**
 * Betting countdown ring. Purely presentational: it renders the server's
 * deadline (`endsAt`) against the configured window — it never closes betting
 * itself (the server's `tick` does that).
 */
export function TimerRing({ endsAt, total }: { endsAt: number | null; total: number }) {
  const seconds = useCountdown(endsAt);
  const C = 2 * Math.PI * 19;
  const frac = endsAt == null ? 1 : Math.max(0, Math.min(1, seconds / Math.max(1, total)));
  return (
    <div className="bet-timer" role="timer" aria-label={endsAt == null ? 'Chờ đặt cược' : `${seconds} giây`}>
      <svg viewBox="0 0 44 44" width="44" height="44">
        <circle cx="22" cy="22" r="19" fill="none" stroke="rgba(217,178,94,.2)" strokeWidth="3" />
        {endsAt != null && (
          <circle
            cx="22"
            cy="22"
            r="19"
            fill="none"
            stroke={seconds <= 5 ? '#d8434a' : 'var(--gold)'}
            strokeWidth="3"
            strokeDasharray={`${C}`}
            strokeDashoffset={`${C * (1 - frac)}`}
            transform="rotate(-90 22 22)"
            strokeLinecap="round"
            style={{ transition: 'stroke-dashoffset 1s linear' }}
          />
        )}
      </svg>
      <span className="bet-timer-num">{endsAt == null ? '—' : seconds}</span>
    </div>
  );
}
