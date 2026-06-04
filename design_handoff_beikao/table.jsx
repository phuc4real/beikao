/* ============================================================
   BEIKAO — Game table screen (the centerpiece)
   Exposes: window.GameTable
   ============================================================ */
const { useState: useTblState, useEffect, useRef, useMemo } = React;

const NAMES = ["Bạn","Long","Hùng","Mai","Tâm","Phúc","Quân","Lan","Sơn","Bảo","Yến","Trí","Hải","Nga","Đức","Vy"];
const AVA_COLORS = ["#b3242b","#3f9d77","#c79a44","#8a4fb9","#3a7bd5","#d98a2b","#2bb3a3","#b94f8a"];

function Avatar({ name, idx, dealer }) {
  const c = AVA_COLORS[idx % AVA_COLORS.length];
  return (
    <div className="seat-ava" style={{ background: `linear-gradient(150deg, ${c}, ${c}99)` }}>
      <span>{name[0]}</span>
      {dealer && <span className="seat-dealer">Cái</span>}
    </div>
  );
}

/* distribute opponents along the upper arc; "you" lives in the bottom hand bar */
function seatPositions(n) {
  // n = number of opponents to place on the felt (excludes you)
  const pos = [];
  if (n <= 0) return pos;
  for (let i = 0; i < n; i++) {
    // span 180deg (left edge) -> 360/0 (right edge) across the top
    const deg = 180 + ((i + 0.5) / n) * 180;
    pos.push((deg * Math.PI) / 180);
  }
  return pos;
}

function GameTable({ room, onResult, onLeave, tweaks }) {
  const seatCount = tweaks.seats;
  const back = tweaks.cardBack;
  const layout = tweaks.layout;

  const [phase, setPhase] = useState("idle"); // idle -> betting -> dealing -> reveal
  const [bet, setBet] = useState(room.min || 1000);
  const [players, setPlayers] = useState([]);
  const [dealt, setDealt] = useState(false);
  const [revealed, setRevealed] = useState(false);
  const [timer, setTimer] = useState(15);
  const [potChips, setPotChips] = useState([]);

  // build players
  useEffect(() => {
    const list = [];
    for (let i = 0; i < seatCount; i++) {
      list.push({
        id: i, name: NAMES[i % NAMES.length] + (i >= NAMES.length ? i : ""),
        you: i === 0, dealer: i === 1 % seatCount,
        cards: [], stake: 0, status: "wait",
      });
    }
    setPlayers(list);
    setPhase("betting");
    setDealt(false); setRevealed(false);
  }, [seatCount, room.id]);

  // betting countdown
  useEffect(() => {
    if (phase !== "betting") return;
    setTimer(15);
    const iv = setInterval(() => setTimer(t => {
      if (t <= 1) { clearInterval(iv); startDeal(); return 0; }
      return t - 1;
    }), 1000);
    return () => clearInterval(iv);
  }, [phase]);

  function placeBet(amount) {
    setBet(amount);
  }

  function startDeal() {
    setPhase("dealing");
    const deck = makeDeck();
    let k = 0;
    const withCards = players.map((p) => ({
      ...p,
      cards: [deck[k++], deck[k++], deck[k++]],
      stake: p.you ? bet : Math.round((room.min||1000) * (1 + Math.floor(Math.random()*5))),
      status: "in",
    }));
    setPlayers(withCards);
    setPotChips(withCards.map((p,i)=>({ id:i, c: AVA_COLORS[i%AVA_COLORS.length] })));
    // animate deal then auto reveal
    setTimeout(() => setDealt(true), 120);
    setTimeout(() => setPhase("reveal"), 2200);
  }

  function reveal() {
    setRevealed(true);
    // determine winner
    const scored = players.map(p => ({ ...p, pts: handPoints(p.cards) }));
    const max = Math.max(...scored.map(s => s.pts));
    const winners = scored.filter(s => s.pts === max);
    const winner = winners[0];
    setPlayers(scored.map(s => ({ ...s, win: s.pts === max })));
    const pot = scored.reduce((a,s)=>a+s.stake, 0);
    setTimeout(() => {
      onResult({
        you: scored.find(s=>s.you),
        winner, pts: max, pot,
        youWon: winner.you,
        allPlayers: scored,
      });
    }, 2600);
  }

  useEffect(() => { if (phase === "reveal" && !revealed) { const t=setTimeout(reveal, 600); return ()=>clearTimeout(t);} }, [phase]);

  const opponents = useMemo(() => players.filter(p => !p.you), [players]);
  const angles = useMemo(() => seatPositions(opponents.length), [opponents.length]);
  const you = players.find(p => p.you);

  return (
    <div className={`bk-stage table-screen layout-${layout}`}>
      <div className="bk-motif motif-cloud"></div>

      {/* HUD top */}
      <div className="tbl-hud">
        <button className="btn btn-ghost tbl-leave" onClick={onLeave}>← Rời bàn</button>
        <div className="tbl-room-name panel">
          <span className="gold-text">{room.name}</span>
          <span className="tbl-room-min">Cược tối thiểu {room.min ? room.min.toLocaleString("vi-VN") : "Free"}</span>
        </div>
        <div className="tbl-balance panel">
          <span className="lb-coin small"></span>
          <span className="gold-text">{(2480000).toLocaleString("vi-VN")}</span>
        </div>
      </div>

      {/* The felt table */}
      <div className="felt-wrap">
        <div className="felt">
          <div className="felt-rim"></div>
          <div className="felt-inner">
            <div className="felt-emblem">
              <BeikaoEmblem />
            </div>
            {/* pot */}
            {phase !== "betting" && (
              <div className="pot">
                <div className="pot-chips">
                  {potChips.slice(0,7).map((c,i)=>(
                    <span key={c.id} className="pchip" style={{ background:c.c, bottom:`${i*4}px`, zIndex:i }}></span>
                  ))}
                </div>
                <div className="pot-amt gold-text">{players.reduce((a,p)=>a+(p.stake||0),0).toLocaleString("vi-VN")}</div>
              </div>
            )}
            {phase === "dealing" && <div className="deal-status">Đang chia bài...</div>}
          </div>

          {/* seats (opponents only; you are the bottom hand bar) */}
          {opponents.map((p, i) => {
            const ang = angles[i];
            const rx = 46, ry = 38;
            const x = 50 + rx * Math.cos(ang);
            const y = 53 + ry * Math.sin(ang);
            return (
              <Seat key={p.id} p={p} x={x} y={y} dealt={dealt} revealed={revealed} back={back}
                    isYou={false} delay={i*0.12} />
            );
          })}
        </div>
      </div>

      {/* Bottom: your hand + betting controls */}
      <div className="tbl-bottom">
        {phase === "betting" ? (
          <BettingBar room={room} bet={bet} onBet={placeBet} timer={timer} onDeal={startDeal} style={tweaks.chipStyle} />
        ) : (
          <YourHandBar you={you} revealed={revealed} phase={phase} />
        )}
      </div>
    </div>
  );
}

function Seat({ p, x, y, dealt, revealed, back, isYou, delay }) {
  const pts = revealed && p.cards.length ? handPoints(p.cards) : null;
  const isCao = pts === 9;
  return (
    <div className={`seat ${isYou ? "seat-you" : ""} ${p.win ? "seat-win" : ""} ${revealed && !p.win ? "seat-lose":""}`}
         style={{ left: `${x}%`, top: `${y}%` }}>
      <div className="seat-cards">
        {p.cards.map((c, ci) => (
          <Card key={c.id} card={c} faceDown={!(revealed || isYou)} back={back}
                className={`seat-card ${dealt ? "dealt" : "pre"} ${p.win && revealed ? "glow" : ""} ${revealed && !p.win ? "dim":""}`}
                style={{ transitionDelay: `${ci*0.08}s`, marginLeft: ci? "-46px":0, transform: dealt? `rotate(${(ci-1)*8}deg)` : "translateY(-220px) rotate(0)" , zIndex: ci }} />
        ))}
      </div>
      <div className="seat-info">
        <Avatar name={p.name} idx={p.id} dealer={p.dealer} />
        <div className="seat-meta">
          <div className="seat-name">{p.you ? "Bạn" : p.name}</div>
          {p.stake > 0 && <div className="seat-stake">⛃ {p.stake.toLocaleString("vi-VN")}</div>}
        </div>
      </div>
      {pts !== null && (
        <div className={`seat-pts ${isCao ? "cao" : ""} ${p.win ? "win" : ""}`}>
          {isCao ? "CÀO CHÍN" : `${pts} điểm`}
        </div>
      )}
    </div>
  );
}

function BettingBar({ room, bet, onBet, timer, onDeal, style }) {
  const base = room.min || 1000;
  const chips = [base, base*5, base*10, base*25, base*50];
  return (
    <div className="bet-bar panel panel-gilt">
      <div className="bet-timer">
        <svg viewBox="0 0 44 44" width="44" height="44">
          <circle cx="22" cy="22" r="19" fill="none" stroke="rgba(217,178,94,.2)" strokeWidth="3"/>
          <circle cx="22" cy="22" r="19" fill="none" stroke="var(--gold)" strokeWidth="3"
            strokeDasharray={`${2*Math.PI*19}`} strokeDashoffset={`${2*Math.PI*19*(1-timer/15)}`}
            transform="rotate(-90 22 22)" strokeLinecap="round" style={{ transition:"stroke-dashoffset 1s linear" }}/>
        </svg>
        <span className="bet-timer-num">{timer}</span>
      </div>
      <div className="bet-chips">
        {chips.map(c => (
          <button key={c} className={`chip-btn ${style} ${bet===c?"sel":""}`} onClick={()=>onBet(c)}>
            <span className="chip-face">{c>=1000? (c/1000)+"K": c}</span>
          </button>
        ))}
      </div>
      <div className="bet-current">
        <span className="bet-current-k">Tiền cược</span>
        <span className="bet-current-v gold-text">{bet.toLocaleString("vi-VN")}</span>
      </div>
      <button className="btn btn-gold bet-go" onClick={onDeal}>Đặt cược</button>
    </div>
  );
}

function YourHandBar({ you, revealed, phase }) {
  const pts = you && you.cards.length ? handPoints(you.cards) : null;
  return (
    <div className="hand-bar">
      <div className="hand-cards">
        {you && you.cards.map((c,i)=>(
          <Card key={c.id} card={c} faceDown={false} className="hand-card glow-soft"
            style={{ marginLeft: i? "-28px":0, transform:`rotate(${(i-1)*6}deg) translateY(${Math.abs(i-1)*4}px)`, zIndex:i }} />
        ))}
      </div>
      <div className="hand-readout panel">
        <div className="hand-readout-k">Bài của bạn</div>
        <div className={`hand-readout-v ${pts===9?"cao":""}`}>
          {pts===null ? "—" : pts===9 ? <span className="gold-text">CÀO CHÍN!</span> : <span className="gold-text">{pts} điểm</span>}
        </div>
      </div>
    </div>
  );
}

function BeikaoEmblem() {
  return (
    <svg viewBox="0 0 220 220" width="100%" height="100%" opacity="0.9">
      <g fill="none" stroke="var(--gold)" strokeWidth="1.2" opacity=".5">
        <circle cx="110" cy="110" r="100"/>
        <circle cx="110" cy="110" r="86" strokeDasharray="2 5"/>
      </g>
      {Array.from({length:24}).map((_,i)=>(
        <path key={i} transform={`rotate(${i*15} 110 110)`} d="M110 24 L112 44 L110 50 L108 44 Z" fill="var(--gold)" opacity=".45"/>
      ))}
      <text x="110" y="128" textAnchor="middle" fontFamily="serif" fontSize="64" fontWeight="700" fill="none" stroke="var(--gold)" strokeWidth="1" opacity=".55">爻</text>
    </svg>
  );
}

Object.assign(window, { GameTable });
