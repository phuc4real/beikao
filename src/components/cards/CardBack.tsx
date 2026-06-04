import type { CardBackDesign } from '@/utils/prefs';

/**
 * The three lacquer-and-gold card backs from the design handoff:
 * drum (Đông Sơn bronze-drum star, default), phoenix, lotus.
 * Pure inline SVG — no image assets.
 */
export function CardBack({ design = 'drum' }: { design?: CardBackDesign }) {
  if (design === 'phoenix') {
    return (
      <div className="cardback">
        <svg viewBox="0 0 100 140" preserveAspectRatio="xMidYMid slice" width="100%" height="100%">
          <defs>
            <radialGradient id="cbp" cx="50%" cy="42%" r="62%">
              <stop offset="0%" stopColor="#8a141d" />
              <stop offset="100%" stopColor="#4a0a10" />
            </radialGradient>
          </defs>
          <rect width="100" height="140" fill="url(#cbp)" />
          <g fill="none" stroke="#d9b25e" strokeWidth="1" opacity=".85">
            <circle cx="50" cy="70" r="40" />
            <circle cx="50" cy="70" r="33" strokeDasharray="2 3" />
          </g>
          <g fill="#d9b25e" opacity=".92">
            <path d="M50 40 C40 52 42 70 50 80 C58 70 60 52 50 40 Z" />
            <path d="M50 80 C44 96 40 104 36 112 C46 106 48 96 50 88 C52 96 54 106 64 112 C60 104 56 96 50 80 Z" />
            <circle cx="50" cy="36" r="4" />
          </g>
        </svg>
      </div>
    );
  }

  if (design === 'lotus') {
    return (
      <div className="cardback">
        <svg viewBox="0 0 100 140" preserveAspectRatio="xMidYMid slice" width="100%" height="100%">
          <defs>
            <linearGradient id="cbl" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#7a1019" />
              <stop offset="100%" stopColor="#3e070d" />
            </linearGradient>
          </defs>
          <rect width="100" height="140" fill="url(#cbl)" />
          <g fill="none" stroke="#d9b25e" strokeWidth="1" opacity=".8">
            {Array.from({ length: 8 }).map((_, i) => (
              <ellipse key={i} cx="50" cy="70" rx="10" ry="34" transform={`rotate(${i * 45} 50 70)`} />
            ))}
            <circle cx="50" cy="70" r="7" fill="#d9b25e" />
          </g>
        </svg>
      </div>
    );
  }

  // default: Đông Sơn bronze-drum star
  return (
    <div className="cardback">
      <svg viewBox="0 0 100 140" preserveAspectRatio="xMidYMid slice" width="100%" height="100%">
        <defs>
          <radialGradient id="cbd" cx="50%" cy="50%" r="60%">
            <stop offset="0%" stopColor="#8a141d" />
            <stop offset="70%" stopColor="#5a0c13" />
            <stop offset="100%" stopColor="#3e070d" />
          </radialGradient>
        </defs>
        <rect width="100" height="140" fill="url(#cbd)" />
        <g fill="none" stroke="#d9b25e" strokeWidth="1">
          <circle cx="50" cy="70" r="42" opacity=".5" />
          <circle cx="50" cy="70" r="36" opacity=".8" />
          <circle cx="50" cy="70" r="22" opacity=".8" />
          <circle cx="50" cy="70" r="13" opacity=".6" />
        </g>
        <g fill="#d9b25e">
          {Array.from({ length: 12 }).map((_, i) => (
            <path key={i} transform={`rotate(${i * 30} 50 70)`} d="M50 50 L52.5 66 L50 70 L47.5 66 Z" />
          ))}
          <circle cx="50" cy="70" r="4" />
        </g>
        <g fill="none" stroke="#d9b25e" strokeWidth="1.4" opacity=".7" strokeLinecap="round">
          {Array.from({ length: 16 }).map((_, i) => {
            const a = (i * 22.5 * Math.PI) / 180;
            return <path key={i} d={`M${50 + 38 * Math.cos(a)} ${70 + 38 * Math.sin(a)} a3 3 0 0 1 4 2`} />;
          })}
        </g>
      </svg>
    </div>
  );
}
