/** Faint bronze-drum emblem at the centre of the felt. */
export function BeikaoEmblem() {
  return (
    <svg viewBox="0 0 220 220" width="100%" height="100%" opacity="0.9" aria-hidden>
      <g fill="none" stroke="var(--gold)" strokeWidth="1.2" opacity=".5">
        <circle cx="110" cy="110" r="100" />
        <circle cx="110" cy="110" r="86" strokeDasharray="2 5" />
      </g>
      {Array.from({ length: 24 }).map((_, i) => (
        <path
          key={i}
          transform={`rotate(${i * 15} 110 110)`}
          d="M110 24 L112 44 L110 50 L108 44 Z"
          fill="var(--gold)"
          opacity=".45"
        />
      ))}
      <text
        x="110"
        y="128"
        textAnchor="middle"
        fontFamily="serif"
        fontSize="64"
        fontWeight="700"
        fill="none"
        stroke="var(--gold)"
        strokeWidth="1"
        opacity=".55"
      >
        爻
      </text>
    </svg>
  );
}
