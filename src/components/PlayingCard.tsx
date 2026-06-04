import { SUIT_SYMBOL, type Card } from '@/features/cao';
import { CardFace } from './cards/CardFace';
import { CardBack } from './cards/CardBack';
import { usePrefs } from '@/utils/prefs';
import './cards/cards.css';

/** Responsive width presets (see cards.css — they shrink below 720px). */
export const CARD_SIZE_CLASS = {
  sm: 'cw-sm',
  md: 'cw-md',
  lg: 'cw-lg',
} as const;

export type CardSize = keyof typeof CARD_SIZE_CLASS;

/**
 * One static card (front or back) in the "Lacquer & Gold" deck. Sizing keys
 * off the `--w` custom property; when rendered inside TableCard the size
 * class lives on the flip container, so `size` here just needs to match.
 */
export function PlayingCard({
  card,
  faceDown = false,
  size = 'md',
}: {
  card?: Card;
  faceDown?: boolean;
  size?: CardSize;
}) {
  const back = usePrefs((s) => s.cardBack);

  if (faceDown || !card) {
    return (
      <div className={`${CARD_SIZE_CLASS[size]} cardbox relative`} aria-label="Lá úp">
        <div className="card-back-face">
          <CardBack design={back} />
        </div>
      </div>
    );
  }

  return (
    <div
      className={`${CARD_SIZE_CLASS[size]} cardbox relative`}
      aria-label={`${card.rank}${SUIT_SYMBOL[card.suit]}`}
    >
      <div className="card-front">
        <CardFace card={card} />
      </div>
    </div>
  );
}
