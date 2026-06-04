# Handoff: Beikao — Bài Cào (Ba Cây) Card Game

## Overview
Beikao is a web-based, responsive UI for the Vietnamese 3-card game **Bài Cào / Ba Cây**.
The package covers three core experiences:
1. **Lobby** — browse and join tiered game halls.
2. **Game table** — the live round: betting, dealing, reveal, scoring.
3. **Result** — win/lose summary and replay.

Aesthetic direction: **"Lacquer & Gold"** — Vietnamese sơn mài (lacquer) oxblood reds, gold-leaf
accents, mother-of-pearl creams, jade for positive outcomes, and Đông Sơn bronze-drum / cloud-spiral
motifs. No casino green.

## About the Design Files
The files in this bundle are **design references authored in HTML/CSS/React-via-Babel** — runnable
prototypes that demonstrate the intended look, motion, and behavior. They are **not** production code
to ship as-is (they transpile JSX in-browser with Babel and inline React from a CDN).

The task is to **recreate these designs in the target codebase's environment** (e.g. a real React/Vite
app, Vue, React Native, etc.) using that project's established patterns, build pipeline, component
library, and state management. If no environment exists yet, pick the most appropriate framework
(React + TypeScript + Vite is a sound default for this) and implement the designs there.

## Fidelity
**High-fidelity (hifi).** Final colors, typography, spacing, motion, and interactions are all specified
below and present in the prototype. Recreate the UI to match, swapping the in-browser scaffolding for
the codebase's real tooling. Game logic (deck, scoring) is real and can be ported directly.

---

## Game Rules (port directly — see `cards.jsx`)
- Deck: standard 52 cards, Fisher–Yates shuffle.
- Card score: **A = 1**, **2–9 = face value**, **10 / J / Q / K = 0**.
- Hand = 3 cards. **Points = (sum of card scores) mod 10.** Range 0–9.
- **9 points = "Cào Chín"** (best). 8 = "Cào Tám". Otherwise "{n} điểm" / "{n} Nút".
- Optional special hand recognized in code: three face cards (J/Q/K) = "Ba Tây".
- Winner = highest points; ties resolved to first in seat order in this mock (real game uses suit rank —
  implement per house rules).

Reference implementation:
```js
function cardScore(r) {
  if (r === "A") return 1;
  if (["10","J","Q","K"].includes(r)) return 0;
  return parseInt(r, 10);
}
function handPoints(cards) {
  return cards.reduce((a, c) => a + cardScore(c.r), 0) % 10;
}
```

---

## Design Tokens
All defined in `styles.css` under `:root`. Exact values:

### Color — Lacquer reds
| Token | Hex |
|---|---|
| `--lacquer` | `#6b0f17` |
| `--lacquer-deep` | `#4a0a10` |
| `--lacquer-bright` | `#8a141d` |
| `--ox` | `#2a0608` |
| `--ink` | `#170406` |
| `--ink-true` | `#0c0204` |

### Color — Gold leaf
| Token | Hex |
|---|---|
| `--gold` | `#d9b25e` |
| `--gold-light` | `#f4e3a8` |
| `--gold-mid` | `#c79a44` |
| `--gold-deep` | `#8a6420` |
| `--gold-shadow` | `#5b3f12` |

### Color — Pearl / card / accents
| Token | Hex |
|---|---|
| `--pearl` | `#f6efe0` |
| `--pearl-2` | `#ece0c8` |
| `--card` | `#faf6ec` |
| `--card-edge` | `#e6d9bc` |
| `--jade` | `#3f9d77` |
| `--jade-deep` | `#1f6b4c` |
| `--suit-red` | `#b3242b` |
| `--suit-blk` | `#221a17` |

### Gradients
- `--grad-gold`: `linear-gradient(160deg, #f4e3a8 0%, #d9b25e 38%, #c79a44 60%, #8a6420 100%)`
- `--grad-gold-soft`: `linear-gradient(160deg, #fbf0c8 0%, #d9b25e 55%, #c79a44 100%)`
- `--grad-lacquer`: `radial-gradient(120% 100% at 50% 0%, #8a141d 0%, #6b0f17 30%, #4a0a10 72%, #2a0608 100%)`

### Typography
- **Body & UI** (`--ui`) and **Display headings** (`--display`): **"Be Vietnam Pro"** (Google Fonts), weights 400–900.
  - IMPORTANT: Vietnamese text uses heavy weights (700–900) for display. Be Vietnam Pro is used for ALL
    Vietnamese text because it renders stacked Vietnamese diacritics (e.g. ồ, ể, ặ) correctly. Do **not**
    substitute a Latin-only display serif for Vietnamese strings.
- **Logo wordmark only** (`--logo`): **"Playfair Display"** weights 700–900 — used solely for the Latin
  "BEIKAO" wordmark (no diacritics there).
- Type sizes (px): hero title 36 / weight 900 / letter-spacing −0.02em; section title 20–21 / 700;
  body 13–14; labels/caps 10–11 uppercase letter-spacing 0.06–0.1em; big point readouts 22–26 / 900.

### Radius
- Buttons: 12px · panels: 16px · cards: `width * 0.1` · pills/tags: 20–30px · chips: 50% (circle).

### Shadow
- `--sh-card`: `0 18px 40px -12px rgba(0,0,0,.6), 0 3px 8px rgba(0,0,0,.4)`
- `--sh-soft`: `0 10px 30px -8px rgba(0,0,0,.5)`
- `--gold-line`: `rgba(217,178,94,.5)` (hairline gold borders)

### Atmospheric backdrop (`.bk-stage`)
- Background: `--grad-lacquer`.
- `::before` fractal-noise grain (SVG turbulence), opacity .045, `mix-blend-mode: overlay`.
- `::after` radial vignette darkening edges.
- `.bk-motif` repeating SVG pattern layer at opacity .05 (key-fret `motif-fret`, cloud-spiral `motif-cloud`).

---

## Screens / Views

### 1. Lobby (`lobby.jsx`, styles in `screens.css`)
**Purpose:** Pick a hall and join a table.

**Layout:** Vertical flex. Top bar (logo left, wallet right) over a 1px gold-line divider. Body scrolls;
a head row (title + search) then a responsive room grid (`repeat(auto-fill, minmax(290px, 1fr))`, 18px gap).

**Components:**
- **Logo** (`BeikaoLogo`): SVG bronze-drum mark (concentric circles + 9 radial rays + center dot, gold
  stroke/fill) + wordmark "BEIKAO" (Playfair, 28px/800, gold gradient text) over tagline "三 張 · BÀI CÀO"
  (10px, gold, letter-spacing .28em).
- **Wallet** (`.lb-wallet` panel): gold coin disc (radial gold gradient, "₫" glyph), label "Số dư",
  amount in gold-gradient text (`2.480.000`, vi-VN grouping), and a `+ Nạp` gold button.
- **Title block:** "Chọn sảnh chơi" (36/900) + sub "Bài Cào · Ba Cây — ba lá định mệnh" (14, gold).
- **Search** (`.lb-search` panel): "⌕" icon + text input, placeholder "Tìm sảnh...". Filters rooms by name.
- **Room card** (`.lb-room`, gilt panel, button): tier crest SVG (8-point star, per-tier gradient),
  name (20/700) + tier label (12, gold), min-bet (label "Cược tối thiểu" + value money-formatted),
  player count (jade live dot + `players/cap`), capacity progress bar (gold fill), and a `Vào sảnh →`
  hint revealed on hover. `HOT` ribbon (orange→red gradient) top-right when `hot`.
  Hover: translateY(−4px), gold border, elevated shadow.

**Data (`ROOMS`):** 6 halls — Sảnh Đồng (Đồng, min 1.000), Sảnh Bạc (Bạc, 10.000, HOT), Sảnh Vàng
(Vàng, 50.000, HOT), Sảnh Ngọc (Ngọc, 200.000), Sảnh Kim Cương (Kim Cương, 1.000.000), Sảnh Tân Thủ
(Tập chơi, free). Each has `players`/`cap`. `money()` formats: 0→"Miễn phí", ≥1e6→"{n}M", ≥1e3→"{n}K".

### 2. Game Table (`table.jsx`, styles in `screens.css`)
**Purpose:** Play one round.

**Layout:** Vertical flex — HUD bar (top), felt (center, flex:1), bottom bar.
- **HUD:** `← Rời bàn` ghost button (left), room-name panel (center: name in gold + min-bet caption),
  balance panel (right: coin + gold amount).
- **Felt** (`.felt`, ellipse `border-radius: 50%/40%`, aspect 16/10.5, max 900px): gold rim ring
  (`.felt-rim::before` gold gradient border), inner radial lacquer field with inset gold ring and dashed
  ring, faint bronze-drum emblem (`BeikaoEmblem`) centered. Pot stack + amount appear once dealing starts;
  "Đang chia bài..." status shows during dealing.
- **Seats:** Opponents only are placed on the felt; **the local player ("Bạn") is represented by the
  bottom bar, not a felt seat.** Opponents are distributed along the **top arc** of the ellipse:
  `seatPositions(k)` spreads `k` opponents across a span of `min(330°, 120 + 18k)` centered on the top
  (270°). Position: `x = 50 + 46*cos(θ)`, `y = 53 + 38*sin(θ)` (percent of felt).
  Each `Seat`: card fan (3 cards, `--w:60px`, overlapped −46px, fanned ±8°), info pill (round avatar with
  initial + per-player color; gold "Cái" badge if dealer; name + stake), and a points badge after reveal
  (gold "CÀO CHÍN" pill with glow when 9, else "{n} điểm").
- **Bottom bar** (`.tbl-bottom`): during **betting** shows `BettingBar`; after deal shows `YourHandBar`.

**Round state machine (`phase`):** `betting → dealing → reveal` (then navigates to Result).
- `betting`: 15s countdown ring (`.bet-timer`); auto-deals at 0 or on `Đặt cược`.
- `dealing`: cards animate from above (`translateY(-220px)` → fanned), staggered; pot fills.
- `reveal`: all hands flip up, points computed, winner seat glows, losers dimmed; after ~2.6s → Result.

**BettingBar:** countdown ring + number, chip buttons for `[min, min×5, ×10, ×25, ×50]` (label "{n}K"),
current bet readout (gold), `Đặt cược` gold button. Selected chip lifts + gold ring.

**YourHandBar:** your 3 cards face-up (`--w:86px`, fanned), and a readout panel — "Bài của bạn" +
points ("{n} điểm", or gold "CÀO CHÍN!" with glow).

### 3. Result (`result.jsx`, styles in `screens.css`)
**Purpose:** Show outcome and replay.

**Layout:** Centered gilt panel (max 440px) with a ribbon overlapping the top edge.
- **Ribbon:** "THẮNG LỚN" (gold gradient) on win / "THUA CUỘC" (gray gradient) on lose.
- **Title:** "Chúc mừng!" (gold) / "May mắn lần sau".
- **Hand:** your 3 cards (`--w:78px`), glowing on win / dimmed on lose.
- **Points line** ("{n} điểm" or "CÀO CHÍN — 9 điểm" with glow).
- Gold rule with center "◆".
- **Stats:** Người thắng ("{name} · {pts} điểm"), Tổng cược (pot, gold), and "Bạn nhận"/"Bạn mất"
  (big jade `+amount` / red `−amount`).
- **Actions:** "Về sảnh" (ghost) and "Chơi tiếp →" (gold).
- On win, slow-rotating conic light rays behind the card (`.result-rays`, 24s spin).

---

## Card System (`cards.jsx` + `cards.css`)
- **`Card`**: 3D flip container (perspective 900px; `.is-down` rotates inner 180°, 0.55s
  cubic-bezier(.2,.7,.2,1)). Front = white card face; back = patterned back. `--w` controls size; height
  = `--w * 1.4`; radius = `--w * 0.1`.
- **`CardFace`**: corner rank+suit (top-left, and rotated 180° bottom-right). Number cards use absolute
  pip layouts (`PIP_LAYOUT`) per rank; face cards (J/Q/K) render a framed monogram (large letter + suit).
  Suit colors: hearts/diamonds `--suit-red`, spades/clubs `--suit-blk`.
- **`CardBack`** — 3 designs (SVG, lacquer field + gold ink + inset gold border):
  - `drum` (default): Đông Sơn bronze-drum star — concentric rings, 12-ray star, radiating spirals.
  - `phoenix`: stylized phoenix on concentric rings.
  - `lotus`: 8-petal lotus rosette.

---

## Interactions & Behavior
- **Lobby → Table:** click a room card → `join(room)` → table mounts in `betting`.
- **Betting:** 15s ring countdown; selecting a chip sets the bet; `Đặt cược` (or timeout) → `startDeal()`.
- **Deal animation:** cards fly in from `translateY(-220px)` to fanned position, staggered 0.08s/card per
  hand, 0.12s/seat; transition 0.5s cubic-bezier(.2,.8,.25,1). Pot chips stack; amount = sum of stakes.
- **Reveal:** ~0.6s after dealing completes, hands flip up; points badges `pop` in; winner seat/cards get
  gold glow (`glowPulse` 1.4s loop), losers `dim` (brightness .62). After ~2.6s → `onResult` → Result.
- **Result:** "Chơi tiếp →" remounts a fresh table (new `key`) back to betting; "Về sảnh" → Lobby.
- **Hover states:** room cards lift + gold border; buttons brighten; chips lift/scale.
- **Reduced motion / non-animated contexts:** entrance states must default to the **visible** end-state
  (do not leave elements at `opacity:0` waiting on an animation that may not tick). Animations should be
  additive only. (This was a real bug fixed in the prototype — keep it in mind when porting.)

## Animations (keyframes in `styles.css`)
- `fadeUp` (14px rise + fade, .5s), `pop` (scale .6→1.08→1, .4s), `glowPulse` (gold drop-shadow pulse,
  ~1.4s loop, for winners/Cào Chín), `shimmer`, `float`, `spin` (result rays, 24s linear).

## State Management
Top-level (`app.jsx`):
- `screen`: `"lobby" | "table" | "result"`.
- `room`: selected room object.
- `result`: `{ you, winner, pts, pot, youWon, allPlayers }`.
- `balance`: player wallet (mock constant `2480000`).
- `tableKey`: increment to force a fresh round on "Chơi tiếp".

Table-local (`table.jsx`):
- `phase`, `bet`, `players[]` (each `{id,name,you,dealer,cards,stake,status,pts?,win?}`), `dealt`,
  `revealed`, `timer`, `potChips[]`. Derived: `opponents`, `angles`, `you`.

Data needs in a real app: room list + live counts, authenticated wallet/balance, server-authoritative
deal + RNG, per-round results. The mock generates everything client-side.

## Configurable options (exposed as "Tweaks" in the prototype — make these props/settings)
- **Table layout:** `round | arc | compact` (`.layout-*` adjust felt aspect/size).
- **Seat count:** 2–16 (1 local + N−1 opponents arced on top; arc span scales with count).
- **Card back:** `drum | phoenix | lotus`.
- **Chip style:** `classic` (dashed-ring casino chip) | `gold` (coin) | `jade` (token).

## Responsive behavior
- ≤720px: hero title 28px; felt widens to 96%; seat cards `--w:44px`; avatars shrink; betting bar wraps;
  your-hand cards `--w:64px`; reduced lobby padding. Layout is fluid; the felt is sized in % with max-width.

## Assets
All artwork is **inline SVG drawn in code** — no external image files:
- Beikao logo mark + table emblem (bronze-drum star).
- Tier crests (8-point stars, per-tier gradients).
- Card faces (rank/suit/pip/court) and three card backs.
- Background grain (SVG turbulence) and motif tiles (key-fret, cloud-spiral) as data-URI SVGs in CSS.
Fonts via Google Fonts: **Be Vietnam Pro** (all text) and **Playfair Display** (logo wordmark only).
Currency formatting uses `toLocaleString("vi-VN")`.

## Files (in this bundle)
- `Beikao.html` — entry; loads fonts, CSS, and the Babel/React scripts.
- `styles.css` — tokens, backdrop, buttons, panels, keyframes.
- `cards.css` — card flip + face/back styling.
- `screens.css` — lobby, table, result, motif backgrounds, responsive rules.
- `cards.jsx` — deck, scoring, `Card`/`CardFace`/`CardBack`.
- `lobby.jsx` — `Lobby`, `BeikaoLogo`, room data, `money()`.
- `table.jsx` — `GameTable`, `Seat`, `BettingBar`, `YourHandBar`, `BeikaoEmblem`, seat geometry.
- `result.jsx` — `ResultScreen`.
- `app.jsx` — router + tweak wiring (`TWEAK_DEFAULTS`).
- `tweaks-panel.jsx` — prototype-only control panel (NOT needed in production; the values it edits should
  become real settings/props).

## Notes for the implementer
- Port `cards.jsx` logic verbatim — it's correct Bài Cào scoring.
- Tie-breaking in the mock is simplistic; implement real house tie rules (suit/“mậu binh”-style) server-side.
- Keep Vietnamese text in **Be Vietnam Pro**; never route diacritic-bearing strings through a Latin-only
  display face.
- Replace client-side deal/RNG with a server-authoritative dealer for any real-money or multiplayer use.
