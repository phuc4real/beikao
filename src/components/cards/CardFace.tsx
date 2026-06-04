import { isRedSuit, SUIT_SYMBOL, type Card } from '@/features/cao';

/**
 * Simplified card front: mirrored corner indices + one big centre readout
 * (rank over suit). Court cards (J/Q/K) wrap the centre in the gilt monogram
 * frame. Replaces the per-rank absolute pip grids of the original handoff —
 * far more legible at the 44px mobile size and one code path for every rank.
 * All sizing keys off the `--w` custom property.
 */
export function CardFace({ card }: { card: Card }) {
  const glyph = SUIT_SYMBOL[card.suit];
  const color = isRedSuit(card.suit) ? 'var(--suit-red)' : 'var(--suit-blk)';
  const isCourt = card.rank === 'J' || card.rank === 'Q' || card.rank === 'K';

  const corner = (
    <>
      <span className="cf-rank">{card.rank}</span>
      <span className="cf-suit">{glyph}</span>
    </>
  );
  const centre = (
    <>
      <div className="cf-centre-rank">{card.rank}</div>
      <div className="cf-centre-suit">{glyph}</div>
    </>
  );

  return (
    <div className="cardface" style={{ color }}>
      <div className="cf-corner">{corner}</div>
      <div className="cf-centre">{isCourt ? <div className="cf-court-frame">{centre}</div> : centre}</div>
      <div className="cf-corner cf-corner-br">{corner}</div>
    </div>
  );
}
