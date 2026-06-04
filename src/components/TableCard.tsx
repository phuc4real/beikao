import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from 'react';
import { PlayingCard, CARD_SIZE_CLASS, type CardSize } from './PlayingCard';
import type { Card } from '@/features/cao';

/** Half of the flip (ms): face-down → edge-on, then edge-on → face-up.
    Must match the `.flip-half` transition in index.css. */
const FLIP_HALF_MS = 250;

/**
 * A seat card that animates: it cascades in face-down when dealt ("chia bài"),
 * then flips to reveal its face at REVEAL ("lật bài").
 *
 * The flip is a midpoint face-swap: the card turns edge-on (rotateY 90°), the
 * single rendered face swaps from back to front, then it turns back to flat.
 * Only ONE face is ever in the DOM — deliberately NOT the classic coplanar
 * two-face `preserve-3d` + `backface-visibility` flip, which mis-renders
 * (mirrored or wrong face) on some GPU / display-scaling combos.
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
  const [stage, setStage] = useState<'down' | 'edge' | 'up'>('down');

  useEffect(() => {
    if (!revealed) {
      setStage('down');
      return;
    }
    const t1 = setTimeout(() => setStage('edge'), flipDelayMs);
    const t2 = setTimeout(() => setStage('up'), flipDelayMs + FLIP_HALF_MS);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
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
      <div className={`flip-half absolute inset-0 ${stage === 'edge' ? 'edge' : ''}`}>
        <PlayingCard card={card} faceDown={stage !== 'up'} size={size} />
      </div>
    </div>
  );
}
