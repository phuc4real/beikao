/* ============================================================
   BEIKAO — Card system (faces + backs) and deck logic
   Exposes: window.Card, window.makeDeck, window.handPoints,
            window.SUITS, window.CardBack
   ============================================================ */

const SUITS = {
  S: { glyph: "♠", name: "spades",   color: "var(--suit-blk)" },
  H: { glyph: "♥", name: "hearts",   color: "var(--suit-red)" },
  D: { glyph: "♦", name: "diamonds", color: "var(--suit-red)" },
  C: { glyph: "♣", name: "clubs",    color: "var(--suit-blk)" },
};
const RANKS = ["A","2","3","4","5","6","7","8","9","10","J","Q","K"];

function rankValue(r) {
  if (r === "A") return 1;
  if (r === "10" || r === "J" || r === "Q" || r === "K") return r === "10" ? 0 : 0; // 10/face = 0 in bài cào
  return parseInt(r, 10);
}
// In Bài Cào: A=1, 2-9 face value, 10/J/Q/K = 0. Sum mod 10.
function cardScore(r) {
  if (r === "A") return 1;
  if (["10","J","Q","K"].includes(r)) return 0;
  return parseInt(r, 10);
}
function handPoints(cards) {
  const sum = cards.reduce((a, c) => a + cardScore(c.r), 0);
  return sum % 10;
}

function makeDeck() {
  const deck = [];
  for (const s of Object.keys(SUITS)) for (const r of RANKS) deck.push({ s, r, id: r + s });
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  return deck;
}

/* --- pip layouts for number cards --- */
const PIP_LAYOUT = {
  "A": [[1,2.5]],
  "2": [[1,1],[1,4]],
  "3": [[1,1],[1,2.5],[1,4]],
  "4": [[0,1],[2,1],[0,4],[2,4]],
  "5": [[0,1],[2,1],[1,2.5],[0,4],[2,4]],
  "6": [[0,1],[2,1],[0,2.5],[2,2.5],[0,4],[2,4]],
  "7": [[0,1],[2,1],[1,1.75],[0,2.5],[2,2.5],[0,4],[2,4]],
  "8": [[0,1],[2,1],[1,1.75],[0,2.5],[2,2.5],[1,3.25],[0,4],[2,4]],
  "9": [[0,1],[2,1],[0,2.1],[2,2.1],[1,2.5],[0,2.9],[2,2.9],[0,4],[2,4]],
  "10":[[0,1],[2,1],[1,1.5],[0,2.1],[2,2.1],[0,2.9],[2,2.9],[1,3.5],[0,4],[2,4]],
};

function CardFace({ s, r }) {
  const suit = SUITS[s];
  const isFace = ["J","Q","K"].includes(r);
  const color = suit.color;
  const cornerGlyph = (
    <div className="cf-corner" style={{ color }}>
      <span className="cf-rank">{r}</span>
      <span className="cf-suit">{suit.glyph}</span>
    </div>
  );

  let center;
  if (isFace) {
    center = (
      <div className="cf-court" style={{ color }}>
        <div className="cf-court-frame">
          <div className="cf-court-letter">{r}</div>
          <div className="cf-court-suit">{suit.glyph}</div>
        </div>
      </div>
    );
  } else {
    const pips = PIP_LAYOUT[r] || [];
    center = (
      <div className="cf-pips">
        {pips.map(([col, row], i) => {
          const flip = row > 2.5;
          return (
            <span
              key={i}
              className="cf-pip"
              style={{
                color,
                left: `${[18, 50, 82][col]}%`,
                top: `${(row / 5) * 100}%`,
                transform: `translate(-50%,-50%) ${flip ? "rotate(180deg)" : ""}`,
              }}
            >{suit.glyph}</span>
          );
        })}
      </div>
    );
  }

  return (
    <div className="cardface">
      {cornerGlyph}
      {center}
      <div className="cf-corner cf-corner-br" style={{ color }}>
        <span className="cf-rank">{r}</span>
        <span className="cf-suit">{suit.glyph}</span>
      </div>
    </div>
  );
}

/* --- Card backs: 3 designs --- */
function CardBack({ design = "drum" }) {
  if (design === "phoenix") {
    return (
      <div className="cardback cb-phoenix">
        <svg viewBox="0 0 100 140" preserveAspectRatio="xMidYMid slice" width="100%" height="100%">
          <defs>
            <radialGradient id="cbp" cx="50%" cy="42%" r="62%">
              <stop offset="0%" stopColor="#8a141d"/><stop offset="100%" stopColor="#4a0a10"/>
            </radialGradient>
          </defs>
          <rect width="100" height="140" fill="url(#cbp)"/>
          <g fill="none" stroke="#d9b25e" strokeWidth="1" opacity=".85">
            <circle cx="50" cy="70" r="40"/>
            <circle cx="50" cy="70" r="33" strokeDasharray="2 3"/>
          </g>
          <g fill="#d9b25e" opacity=".92">
            <path d="M50 40 C40 52 42 70 50 80 C58 70 60 52 50 40 Z"/>
            <path d="M50 80 C44 96 40 104 36 112 C46 106 48 96 50 88 C52 96 54 106 64 112 C60 104 56 96 50 80 Z"/>
            <circle cx="50" cy="36" r="4"/>
          </g>
        </svg>
      </div>
    );
  }
  if (design === "lotus") {
    return (
      <div className="cardback cb-lotus">
        <svg viewBox="0 0 100 140" preserveAspectRatio="xMidYMid slice" width="100%" height="100%">
          <defs>
            <linearGradient id="cbl" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#7a1019"/><stop offset="100%" stopColor="#3e070d"/>
            </linearGradient>
          </defs>
          <rect width="100" height="140" fill="url(#cbl)"/>
          <g fill="none" stroke="#d9b25e" strokeWidth="1" opacity=".8">
            {Array.from({length:8}).map((_,i)=>(
              <ellipse key={i} cx="50" cy="70" rx="10" ry="34" transform={`rotate(${i*45} 50 70)`}/>
            ))}
            <circle cx="50" cy="70" r="7" fill="#d9b25e"/>
          </g>
        </svg>
      </div>
    );
  }
  // default: Đông Sơn bronze drum star
  return (
    <div className="cardback cb-drum">
      <svg viewBox="0 0 100 140" preserveAspectRatio="xMidYMid slice" width="100%" height="100%">
        <defs>
          <radialGradient id="cbd" cx="50%" cy="50%" r="60%">
            <stop offset="0%" stopColor="#8a141d"/><stop offset="70%" stopColor="#5a0c13"/><stop offset="100%" stopColor="#3e070d"/>
          </radialGradient>
        </defs>
        <rect width="100" height="140" fill="url(#cbd)"/>
        <g fill="none" stroke="#d9b25e" strokeWidth="1">
          <circle cx="50" cy="70" r="42" opacity=".5"/>
          <circle cx="50" cy="70" r="36" opacity=".8"/>
          <circle cx="50" cy="70" r="22" opacity=".8"/>
          <circle cx="50" cy="70" r="13" opacity=".6"/>
        </g>
        <g fill="#d9b25e">
          {Array.from({length:12}).map((_,i)=>(
            <path key={i} transform={`rotate(${i*30} 50 70)`} d="M50 50 L52.5 66 L50 70 L47.5 66 Z"/>
          ))}
          <circle cx="50" cy="70" r="4"/>
        </g>
        <g fill="none" stroke="#d9b25e" strokeWidth="1.4" opacity=".7" strokeLinecap="round">
          {Array.from({length:16}).map((_,i)=>{
            const a=(i*22.5)*Math.PI/180;
            return <path key={i} d={`M${50+38*Math.cos(a)} ${70+38*Math.sin(a)} a3 3 0 0 1 4 2`}/>;
          })}
        </g>
      </svg>
    </div>
  );
}

/* --- The flippable Card component (conditional render — robust, no backface dependency) --- */
function Card({ card, faceDown = false, back = "drum", className = "", style = {} }) {
  const [flipping, setFlipping] = React.useState(false);
  const prev = React.useRef(faceDown);
  React.useEffect(() => {
    if (prev.current !== faceDown) {
      setFlipping(true);
      const t = setTimeout(() => setFlipping(false), 440);
      prev.current = faceDown;
      return () => clearTimeout(t);
    }
  }, [faceDown]);

  return (
    <div className={`card ${faceDown ? "is-down" : "is-up"} ${flipping ? "flipping" : ""} ${className}`} style={style}>
      <div className="card-face-wrap">
        {faceDown ? (
          <div className="card-back-face"><CardBack design={back} /></div>
        ) : (
          <div className="card-front">{card ? <CardFace s={card.s} r={card.r} /> : null}</div>
        )}
      </div>
    </div>
  );
}

Object.assign(window, { Card, CardFace, CardBack, makeDeck, handPoints, cardScore, SUITS, RANKS });
