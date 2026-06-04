import { isRedSuit, SUIT_SYMBOL, type Card, type Rank } from '@/features/cao';

/**
 * Hifi card front (ported from the design handoff's cards.jsx — visuals only):
 * mirrored corner indices, absolute pip layouts for A–10, framed monogram
 * courts for J/Q/K. All sizing keys off the `--w` custom property.
 */

/** [column 0|1|2, row 1..4] per pip; rows > 2.5 render upside-down. */
const PIP_LAYOUT: Partial<Record<Rank, [number, number][]>> = {
  A: [[1, 2.5]],
  '2': [[1, 1], [1, 4]],
  '3': [[1, 1], [1, 2.5], [1, 4]],
  '4': [[0, 1], [2, 1], [0, 4], [2, 4]],
  '5': [[0, 1], [2, 1], [1, 2.5], [0, 4], [2, 4]],
  '6': [[0, 1], [2, 1], [0, 2.5], [2, 2.5], [0, 4], [2, 4]],
  '7': [[0, 1], [2, 1], [1, 1.75], [0, 2.5], [2, 2.5], [0, 4], [2, 4]],
  '8': [[0, 1], [2, 1], [1, 1.75], [0, 2.5], [2, 2.5], [1, 3.25], [0, 4], [2, 4]],
  '9': [[0, 1], [2, 1], [0, 2.1], [2, 2.1], [1, 2.5], [0, 2.9], [2, 2.9], [0, 4], [2, 4]],
  '10': [[0, 1], [2, 1], [1, 1.5], [0, 2.1], [2, 2.1], [0, 2.9], [2, 2.9], [1, 3.5], [0, 4], [2, 4]],
};

const PIP_COLS = [18, 50, 82] as const;

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

  return (
    <div className="cardface">
      <div className="cf-corner" style={{ color }}>
        {corner}
      </div>

      {isCourt ? (
        <div className="cf-court" style={{ color }}>
          <div className="cf-court-frame">
            <div className="cf-court-letter">{card.rank}</div>
            <div className="cf-court-suit">{glyph}</div>
          </div>
        </div>
      ) : (
        <div className="cf-pips">
          {(PIP_LAYOUT[card.rank] ?? []).map(([col, row], i) => {
            const flip = row > 2.5;
            return (
              <span
                key={i}
                className="cf-pip"
                style={{
                  color,
                  left: `${PIP_COLS[col] ?? 50}%`,
                  top: `${(row / 5) * 100}%`,
                  transform: `translate(-50%,-50%)${flip ? ' rotate(180deg)' : ''}`,
                }}
              >
                {glyph}
              </span>
            );
          })}
        </div>
      )}

      <div className="cf-corner cf-corner-br" style={{ color }}>
        {corner}
      </div>
    </div>
  );
}
