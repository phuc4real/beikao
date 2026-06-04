/* ============================================================
   BEIKAO — Lobby / room list screen
   Exposes: window.Lobby
   ============================================================ */
const { useState } = React;

const ROOMS = [
  { id: "R1", name: "Sảnh Đồng",   tier: "Đồng",  min: 1000,    icon: "bronze",  players: 7,  cap: 9,  hot: false },
  { id: "R2", name: "Sảnh Bạc",    tier: "Bạc",   min: 10000,   icon: "silver",  players: 12, cap: 16, hot: true  },
  { id: "R3", name: "Sảnh Vàng",   tier: "Vàng",  min: 50000,   icon: "gold",    players: 9,  cap: 12, hot: true  },
  { id: "R4", name: "Sảnh Ngọc",   tier: "Ngọc",  min: 200000,  icon: "jade",    players: 5,  cap: 8,  hot: false },
  { id: "R5", name: "Sảnh Kim Cương", tier: "Kim Cương", min: 1000000, icon: "diamond", players: 3, cap: 6, hot: false },
  { id: "R6", name: "Sảnh Tân Thủ", tier: "Tập chơi", min: 0,    icon: "free",    players: 21, cap: 99, hot: false },
];

function money(n) {
  if (n === 0) return "Miễn phí";
  if (n >= 1000000) return (n/1000000) + "M";
  if (n >= 1000) return (n/1000) + "K";
  return "" + n;
}

function TierIcon({ kind }) {
  const colors = {
    bronze: ["#c98a4b","#7a4e22"], silver: ["#e6e9ee","#9aa3ad"],
    gold: ["#f4e3a8","#c79a44"], jade: ["#6fd3a8","#1f6b4c"],
    diamond: ["#bfe9ff","#6aa8d6"], free: ["#f0d9b0","#b08a4a"],
  }[kind] || ["#f4e3a8","#c79a44"];
  return (
    <svg viewBox="0 0 48 48" width="46" height="46" style={{ flex: "0 0 auto" }}>
      <defs><linearGradient id={"tg"+kind} x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor={colors[0]}/><stop offset="100%" stopColor={colors[1]}/>
      </linearGradient></defs>
      <path d="M24 3l5.5 4h7l2 6.5 4.5 5-2 6.5 1 7-6 3-3.5 6-6-2.5L20 48l-3.5-6-6-3 1-7-2-6.5 4.5-5 2-6.5h7z"
        fill={`url(#tg${kind})`} stroke="rgba(0,0,0,.25)" strokeWidth="1"/>
      <circle cx="24" cy="22" r="9" fill="rgba(255,255,255,.25)" stroke="rgba(0,0,0,.2)"/>
      <text x="24" y="27" textAnchor="middle" fontSize="11" fontWeight="800" fill="#3a2606" fontFamily="serif">爻</text>
    </svg>
  );
}

function Lobby({ onJoin, balance }) {
  const [q, setQ] = useState("");
  const list = ROOMS.filter(r => r.name.toLowerCase().includes(q.toLowerCase()));
  return (
    <div className="bk-stage lobby">
      <div className="bk-motif motif-fret"></div>

      {/* Top bar */}
      <header className="lb-top">
        <div className="lb-brand">
          <BeikaoLogo />
        </div>
        <div className="lb-wallet panel">
          <div className="lb-coin"></div>
          <div>
            <div className="lb-wallet-label">Số dư</div>
            <div className="lb-wallet-amt gold-text">{balance.toLocaleString("vi-VN")}</div>
          </div>
          <button className="btn btn-gold lb-topup">+ Nạp</button>
        </div>
      </header>

      <div className="lb-body">
        <div className="lb-head">
          <div>
            <h1 className="lb-title">Chọn sảnh chơi</h1>
            <p className="lb-sub">Bài Cào · Ba Cây — ba lá định mệnh</p>
          </div>
          <div className="lb-search panel">
            <span className="lb-search-ic">⌕</span>
            <input value={q} onChange={e=>setQ(e.target.value)} placeholder="Tìm sảnh..." />
          </div>
        </div>

        <div className="lb-grid">
          {list.map((r, i) => (
            <button key={r.id} className="lb-room panel panel-gilt" onClick={()=>onJoin(r)}>
              {r.hot && <span className="lb-hot">HOT</span>}
              <div className="lb-room-top">
                <TierIcon kind={r.icon} />
                <div className="lb-room-name">
                  <div className="lb-room-title">{r.name}</div>
                  <div className="lb-room-tier">{r.tier}</div>
                </div>
              </div>
              <div className="lb-room-meta">
                <div className="lb-meta-item">
                  <span className="lb-meta-k">Cược tối thiểu</span>
                  <span className="lb-meta-v gold-text">{money(r.min)}</span>
                </div>
                <div className="lb-meta-item">
                  <span className="lb-meta-k">Người chơi</span>
                  <span className="lb-meta-v"><span className="lb-live"></span>{r.players}/{r.cap}</span>
                </div>
              </div>
              <div className="lb-bar"><div className="lb-bar-fill" style={{ width: `${Math.min(100, r.players/r.cap*100)}%` }}></div></div>
              <span className="lb-enter">Vào sảnh →</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function BeikaoLogo({ size = 1 }) {
  return (
    <div className="bk-logo" style={{ fontSize: `${size}em` }}>
      <div className="bk-logo-mark">
        <svg viewBox="0 0 44 44" width="100%" height="100%">
          <circle cx="22" cy="22" r="20" fill="none" stroke="var(--gold)" strokeWidth="1.5"/>
          <circle cx="22" cy="22" r="15" fill="none" stroke="var(--gold)" strokeWidth="1" opacity=".6"/>
          {Array.from({length:9}).map((_,i)=>(
            <path key={i} transform={`rotate(${i*40} 22 22)`} d="M22 8 L23.6 18 L22 21 L20.4 18 Z" fill="var(--gold)"/>
          ))}
          <circle cx="22" cy="22" r="3.4" fill="var(--gold)"/>
        </svg>
      </div>
      <div className="bk-logo-word">
        <span className="bk-logo-name gold-text">BEIKAO</span>
        <span className="bk-logo-tag">三 張 · BÀI CÀO</span>
      </div>
    </div>
  );
}

Object.assign(window, { Lobby, BeikaoLogo, money });
