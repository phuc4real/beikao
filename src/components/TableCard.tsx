import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from 'react';
import { PlayingCard, CARD_SIZE_CLASS, type CardSize } from './PlayingCard';
import type { Card } from '@/features/cao';

/**
 * A seat card that animates: it cascades in face-down when dealt ("chia bài"),
 * then flips to reveal its face at REVEAL ("lật bài").
 *
 * - `flyIn` makes the deal-in a flight from the deck (the felt centre) to the
 *   card's resting spot, instead of the default drop-in-place.
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
  flyIn = false,
  dealDelayMs = 0,
  flipDelayMs = 0,
  className = '',
  style,
}: {
  card?: Card;
  revealed: boolean;
  size?: CardSize;
  flyIn?: boolean;
  dealDelayMs?: number;
  flipDelayMs?: number;
  className?: string;
  style?: CSSProperties;
}) {
  const boxRef = useRef<HTMLDivElement>(null);
  const [flipped, setFlipped] = useState(false);

  useEffect(() => {
    if (!revealed) {
      setFlipped(false);
      return;
    }
    const t = setTimeout(() => setFlipped(true), flipDelayMs);
    return () => clearTimeout(t);
  }, [revealed, flipDelayMs]);

  // Fly-in cards launch from the felt centre (the "deck"): measure this card's
  // offset back to it before first paint so the deal-fly keyframes know where
  // to start. (The from-state only scales/rotates around the centre, so the
  // measured centre is already the resting centre.)
  useLayoutEffect(() => {
    if (!flyIn) return;
    const el = boxRef.current;
    const felt = document.querySelector('.felt-inner');
    if (!el || !felt) return; // no felt on screen → degrade to a pop-in-place
    const f = felt.getBoundingClientRect();
    const r = el.getBoundingClientRect();
    el.style.setProperty('--deal-dx', `${f.left + f.width / 2 - (r.left + r.width / 2)}px`);
    el.style.setProperty('--deal-dy', `${f.top + f.height / 2 - (r.top + r.height / 2)}px`);
  }, [flyIn]);

  return (
    <div
      ref={boxRef}
      className={`card3d cardbox ${flyIn ? 'deal-fly' : 'deal-in'} relative ${CARD_SIZE_CLASS[size]} ${className}`}
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
