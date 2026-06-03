import { useEffect, useState } from 'react';
import { PlayingCard, type CardSize } from './PlayingCard';
import type { Card } from '@/features/cao';

const CONTAINER: Record<CardSize, string> = {
  sm: 'h-14 w-10',
  md: 'h-20 w-14',
  lg: 'h-28 w-20',
};

/**
 * A seat card that animates: it cascades in face-down when dealt ("chia bài"),
 * then flips to reveal its face at REVEAL ("lật bài").
 *
 * - `dealDelayMs` staggers the deal-in cascade across seats/cards.
 * - `flipDelayMs` staggers the reveal flip once `revealed` becomes true.
 * Remount the component per round (via a round-keyed `key`) so the deal-in
 * cascade replays each new round.
 */
export function TableCard({
  card,
  revealed,
  size = 'sm',
  dealDelayMs = 0,
  flipDelayMs = 0,
}: {
  card?: Card;
  revealed: boolean;
  size?: CardSize;
  dealDelayMs?: number;
  flipDelayMs?: number;
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
    <div className={`card3d deal-in relative ${CONTAINER[size]}`} style={{ animationDelay: `${dealDelayMs}ms` }}>
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
