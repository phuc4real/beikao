import { isRedSuit, SUIT_SYMBOL, type Card } from '@/features/cao';

const SIZES = {
  sm: 'h-14 w-10 text-base',
  md: 'h-20 w-14 text-2xl',
  lg: 'h-28 w-20 text-4xl',
} as const;

export type CardSize = keyof typeof SIZES;

export function PlayingCard({
  card,
  faceDown = false,
  size = 'md',
}: {
  card?: Card;
  faceDown?: boolean;
  size?: keyof typeof SIZES;
}) {
  const dims = SIZES[size];
  if (faceDown || !card) {
    return (
      <div
        className={`${dims} flex items-center justify-center rounded-lg border border-white/20 bg-gradient-to-br from-indigo-800 to-indigo-950 shadow`}
        aria-label="Lá úp"
      >
        <span className="text-white/30">✦</span>
      </div>
    );
  }
  const red = isRedSuit(card.suit);
  return (
    <div
      className={`${dims} flex flex-col items-center justify-center rounded-lg border border-black/10 bg-white font-bold shadow ${
        red ? 'text-red-600' : 'text-gray-900'
      }`}
      aria-label={`${card.rank}${SUIT_SYMBOL[card.suit]}`}
    >
      <span className="leading-none">{card.rank}</span>
      <span className="leading-none">{SUIT_SYMBOL[card.suit]}</span>
    </div>
  );
}
