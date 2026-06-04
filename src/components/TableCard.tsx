import { useEffect, useState, type CSSProperties } from 'react';
import { PlayingCard, CARD_SIZE_CLASS, type CardSize } from './PlayingCard';
import type { Card } from '@/features/cao';

/**
 * A seat card that animates: it cascades in face-down when dealt ("chia bài"),
 * then flips to reveal its face at REVEAL ("lật bài").
 *
 * - `dealDelayMs` staggers the deal-in cascade across seats/cards.
 * - `flipDelayMs` staggers the reveal flip once `revealed` becomes true.
 * - `className` lets callers add win/lose dressing (`card-glow` / `card-dim`)
 *   and fan transforms without touching the flip internals.
 * Remount the component per round (via a round-keyed `key`) so the deal-in
 * cascade replays each new round.
 */
export function TableCard({
  card,
  revealed,
  size = 'sm',
  dealDelayMs = 0,
  flipDelayMs = 0,
  className = '',
  style,
}: {
  card?: Card;
  revealed: boolean;
  size?: CardSize;
  dealDelayMs?: number;
  flipDelayMs?: number;
  className?: string;
  style?: CSSProperties;
}) {
  const [flipped, setFlipped] = useState(false);

  useEffect(() => {
    if (!revealed) {
      setFlipped(false);
      return;
    }
    const t = setTimeout(() => setFlipped(true), flipDelayMs);
    return () => clearTimeout(t);
  }, [revealed, flipDelayMs]);

  return (
    <div
      className={`card3d cardbox deal-in relative ${CARD_SIZE_CLASS[size]} ${className}`}
      style={{ animationDelay: `${dealDelayMs}ms`, ...style }}
    >
      <div className={`flip-inner absolute inset-0 ${flipped ? 'flipped' : ''}`}>
        <div className="flip-face absolute inset-0">
          <PlayingCard faceDown size={size} />
        </div>
        <div className="flip-face flip-front absolute inset-0">
          <PlayingCard card={card} size={size} />
        </div>
      </div>
    </div>
  );
}
