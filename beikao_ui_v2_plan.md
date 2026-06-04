# Beikao UI v2 — "Lacquer & Gold" Refactor Plan

Source: `design_handoff_beikao/` (hifi prototype, README is the spec).
Target: the existing Vite + React + TS + Tailwind app. **This is a presentation-layer refactor only** — engine (`features/cao`), authority, protocol, store, and session code do not change.

---

## 0. Ground rules (read first)

### What we take from the handoff
- The complete **visual system**: Lacquer & Gold tokens, typography, panels/buttons, atmospheric backdrop, motifs, card faces/backs, felt table, animations, responsive rules.
- **Layout concepts**: lobby top-bar + room grid, elliptical felt with opponents on the top arc and "you" in a bottom bar, betting bar with chip buttons + countdown ring, result panel with ribbon.
- The **reduced-motion lesson** (README §Interactions): entrance states must default to the *visible* end-state; animations are additive only. Our existing `index.css` already follows this pattern (`deal-in` gated behind `prefers-reduced-motion: no-preference`) — keep it.

### What we explicitly DO NOT take (conflicts with this codebase)
| Handoff says | Reality in this repo | Decision |
|---|---|---|
| "Port `cards.jsx` logic verbatim" (deck, `Math.random` shuffle, `handPoints`, client-side dealing) | Engine is server-authoritative (`intent` Edge Function), seeded shuffle, fully tested (43 tests) | **Never port.** Use only the *visual* components of `cards.jsx`. The mock's deck/RNG/scoring dies at the door. |
| Card score: `10 = 0` | Engine: `10 = 10` (≡ 0 mod 10 — same result; engine is GDD-correct) | Keep engine. No UI impact. |
| Special hand "**Ba Tây**" | Engine/GDD: "**Ba tiên**" (J/Q/K auto-win tier) | Keep "Ba tiên" wording everywhere. |
| Ties "resolved to first in seat order" | Engine: suit rank ♦>♥>♣>♠ tie-break | Keep engine. No UI impact. |
| 15s client countdown, client auto-deals at 0 | Server owns time (`round.endsAt`, closed by `tick` cron) | Timer **ring** is driven by `endsAt` + `config.bettingSeconds`; UI never triggers dealing. |
| Winner = single pot winner; `phase: betting→dealing→reveal` local state machine | Two modes: Cào cái (per-con WIN/LOSE vs cái) and Cào rùa (pot winner); status comes from `RoomState.status` (`LOBBY/BETTING/REVEAL`) | Phases are *derived* from server state; "dealing" is a purely cosmetic transition when hands arrive at REVEAL. Result screen must support per-player outcome vs cái, not just pot winner. |
| Lobby = 6 hard-coded tiered halls | Home = create / join-by-code / live room browser (Supabase `room_directory`) | Reskin the real flows in the hall-card visual language. No fake halls. |
| Mock wallet `2.480.000` | Durable per-profile balance, integer chips | Bind real balance; format with `toLocaleString('vi-VN')`. |
| `tweaks-panel.jsx` | Prototype-only | Don't port the panel. Card back + chip style become local user prefs (localStorage); table layout becomes responsive/automatic. |

### Things the design doesn't cover (must be designed *in the same language*)
The real app has features the prototype lacks. They stay, restyled: **in-room waiting lobby** (ready states, share link, settings), **FairnessBadge**, **Chat**, **Reactions** (bar + floating), **HistoryPanel/replay**, **spectator mode banner**, **Leaderboard**, **RoomBrowser**, **SettingsModal**, **Toast**, reconnect/“Đang kết nối…” screens.

---

## 1. Phase plan

Each phase ends green: `npm run build && npm run lint && npm run test`. UI-only — no `build:functions` reruns needed.

### Phase A — Design-system foundation
**New files:** `src/styles/theme.css` (imported from `index.css`), Tailwind config extension.

1. **Tokens as CSS variables** — copy `:root` from `styles.css` verbatim (lacquer reds, gold leaf, pearl, jade, suit colors, gradients, shadows, `--gold-line`). Single source of truth; Tailwind reads them.
2. **Tailwind mapping** (`tailwind.config.js`): replace the obsolete `felt` green palette (the README's "no casino green" rule) with:
   - `colors`: `lacquer.{DEFAULT,deep,bright}`, `ox`, `ink`, `gold.{DEFAULT,light,mid,deep,shadow}`, `pearl.{DEFAULT,2}`, `cardface`, `jade.{DEFAULT,deep}`, `suit.{red,blk}` — all via `var(--…)`.
   - `fontFamily`: `ui`/`display` → `"Be Vietnam Pro"`, `logo` → `"Playfair Display"`.
   - `boxShadow`: `card`, `soft`; `borderRadius` conventions (buttons 12px, panels 16px, pills 20–30px).
   - `keyframes/animation`: `fadeUp`, `pop`, `glowPulse`, `shimmer`, `float`, `spin` (24s), `flipIn`.
3. **Fonts**: add `@fontsource/be-vietnam-pro` (400/600/700/800/900) + `@fontsource/playfair-display` (800) via npm — self-hosted beats a Google Fonts CDN link on GitHub Pages (no FOUT on slow networks, works offline, no third-party request). **Hard rule from the README:** all Vietnamese (diacritic-bearing) text renders in Be Vietnam Pro; Playfair is used *only* for the Latin "BEIKAO" wordmark.
4. **Atmospheric stage**: port `.bk-stage` (lacquer radial gradient + SVG-turbulence grain `::before` + vignette `::after`) and `.bk-motif` tiles (`motif-fret`, `motif-cloud` data-URI SVGs) into `theme.css`. Implement as a `<Stage motif="fret|cloud">` wrapper component (`src/components/Stage.tsx`) that all pages mount.
   - ⚠ The prototype sets `body { overflow: hidden }` and fixed-height screens. Our app scrolls (chat/history/leaderboard below the fold). Decision: **the stage is a fixed, full-viewport background layer (`position: fixed; inset: 0; z-index: -…`), content scrolls above it.** Don't import the prototype's overflow rules.
5. **Core primitives — rework `src/components/ui.tsx`** (keep the same exported API so call sites don't churn):
   - `Button` variants remapped: `primary` → `.btn-gold` look (gold gradient, inset highlights, `#3a2606` text), `ghost` → `.btn-ghost` (gold hairline), `secondary` → jade, `danger` stays red but lacquer-toned. Keep `loading`/`Spinner` behavior (server round trips are ~1s).
   - `Panel` → the gilt panel (`.panel` dark lacquer gradient + gold hairline border; optional `gilt` prop for the inset double border).
   - `Chip` (pill) → gold-line pill.
   - New: `GoldText` (gradient-clipped text), `GoldRule` (hairline + center ◆), `Coin` (the radial-gold ₫ disc, `small` variant).
6. **Money formatting**: add `src/utils/money.ts` — `formatChips(n)` = `n.toLocaleString('vi-VN')` and `moneyShort(n)` (0→"Miễn phí", ≥1e6→"{n}M", ≥1e3→"{n}K" from `lobby.jsx`). Replace bare `toLocaleString()` call sites.

**Acceptance:** app runs with the new backdrop/buttons/panels everywhere, old green palette gone, all checks green.

### Phase B — Card system
**Files:** rewrite `src/components/PlayingCard.tsx`; keep `src/components/TableCard.tsx` mechanics; new `src/components/cards/` (`CardFace.tsx`, `CardBack.tsx`, `cards.css` adapted).

1. **Port the visuals (not the logic)** of `cards.jsx`/`cards.css` to TSX, mapping to our engine types (`Card { rank, suit }` from `@/features/cao`, `SUIT_SYMBOL`, `isRedSuit`):
   - `CardFace`: corner rank+suit (mirrored bottom-right), `PIP_LAYOUT` absolute pip grid for A–10, framed monogram court for J/Q/K. Suit colors via `--suit-red`/`--suit-blk`.
   - `CardBack`: all three SVG designs — `drum` (default Đông Sơn star), `phoenix`, `lotus`.
   - Size via the `--w` CSS custom property (height `= --w × 1.4`, radius `= --w × 0.1`) instead of the current fixed Tailwind `h-/w-` map. Keep the `sm/md/lg` prop API on `PlayingCard` but implement as `--w` presets (≈60 / 78 / 86px; 44/64px under 720px).
2. **Flip mechanics**: keep our existing `TableCard` (deal-in + 3D `flip-inner` + `dealDelayMs`/`flipDelayMs` staggering + per-round remount keys + the cái-flips-last drama). It already does what the prototype's `Card` does, is reduced-motion-safe, and is wired into REVEAL timing. Only its *faces* change (CardBack design + new CardFace).
3. **Card back preference**: `drum | phoenix | lotus` read from a new local-prefs module (`src/utils/prefs.ts`, localStorage) — see Phase F.
4. **States**: port `.glow` (winner gold ring + halo), `.dim` (loser brightness .62), `glowPulse` loop.

**Acceptance:** a Storybook-less smoke check is fine — render all 52 faces + 3 backs on a scratch route or in the History replay; visual parity with prototype.

### Phase C — Home page ("Chọn sảnh chơi" skin on real flows)
**Files:** `src/pages/HomePage.tsx`, `src/components/RoomBrowser.tsx`, `src/components/Leaderboard.tsx`; new `src/components/BeikaoLogo.tsx`.

1. **Top bar**: `BeikaoLogo` (bronze-drum SVG mark + "BEIKAO" Playfair gold-gradient wordmark + "三 張 · BÀI CÀO" tagline) left; **wallet panel** right (Coin + "Số dư" + gold balance). Balance comes from the player's durable profile when signed in (anonymous auth uid → `profiles.balance`); if no profile yet, show the default starting balance or hide the amount. *(Small read-only fetch via existing `network/supabase` — no new server code. "+ Nạp" button from the design is out of scope: omit, don't stub a dead button.)*
2. **Hero**: "Chọn sảnh chơi" 36/900 + gold sub-line, `fadeUp` entrance.
3. **Tabs → real flows, hall-card visuals**:
   - Keep the three tabs (Tạo phòng / Vào mã / Tìm phòng) as gold-pill tabs.
   - **RoomBrowser** rows become the design's `.lb-room` gilt cards: tier crest SVG (derive tier from the room's `minBet` so the crest system is meaningful: Tập chơi/Đồng/Bạc/Vàng/Ngọc/Kim Cương thresholds), room name + mode, "Cược tối thiểu" via `moneyShort`, jade live-dot + `players/cap`, gold capacity bar, hover lift + "Vào sảnh →" reveal. "HOT" ribbon when near capacity (e.g. ≥75% full).
   - **Search** field (`.lb-search` style) filtering the browser list client-side.
   - Create/join forms restyled (lacquer inputs, gold focus ring); name field, public toggle, spectator toggle keep their logic.
4. **Leaderboard** restyled as a gilt panel (gold rank numerals, jade positive deltas).

**Acceptance:** all three flows still work against Supabase; browser updates live; responsive grid `minmax(290px,1fr)`.

### Phase D — Room lobby (waiting room)
**Files:** `src/components/Lobby.tsx`, `SettingsModal.tsx`, `Chat.tsx`.

The prototype has no waiting room — design it from the same kit:
1. Header: room code as a gold-mono badge, mode + player count caption, ghost buttons (Cài đặt / Sao chép link), spectator banner restyled (gold-line pill, not indigo).
2. Player list → seat-info pills from the table design (`.seat-info`: round avatar with initial + per-player color from `AVA_COLORS`, gold "Cái" badge, name, balance chip, jade ✓ ready state, red "mất kết nối").
3. **Extract `Avatar.tsx`** (initial + deterministic color by seat index + optional Cái badge) — reused by Lobby, table seats, Chat, and Reactions.
4. CTA row: "Sẵn sàng" jade ↔ ghost toggle, "Chia bài" gold, "Rời phòng" danger.
5. `SettingsModal` + `Chat` reskin (gilt panel, gold rules, lacquer inputs). Chat messages get the mini Avatar.

### Phase E — Game table (the centerpiece)
**Files:** `src/components/GameTable.tsx` (substantial rewrite of layout, zero logic change), new `src/components/table/` (`Felt.tsx`, `Seat.tsx`, `BettingBar.tsx`, `MyHandBar.tsx`, `Pot.tsx`, `BeikaoEmblem.tsx`, `seatGeometry.ts`); `screens.css` table rules adapted into `theme.css`.

1. **Layout**: vertical flex — HUD bar / felt (flex:1) / bottom bar. Chat, HistoryPanel, FairnessBadge, ReactionBar move into compact, toggleable side/bottom drawers so the felt owns the viewport (the current stacked-list page disappears).
2. **HUD**: `← Rời bàn` ghost (wired to existing `leave`), center room panel (room code/name gold + "Ván {n}" + min-bet caption), right balance panel (Coin + gold `me.balance`). FairnessBadge docks here as a compact icon-pill (expands on tap).
3. **Felt**: elliptical `.felt` (gold rim, lacquer radial inner, inset + dashed gold rings, faint `BeikaoEmblem`), `aspect 16/10.5`, `min(900px, 92%)`.
4. **Seats**: port `seatPositions(n)` — *opponents only* on the top arc (`x = 50 + 46cosθ`, `y = 53 + 38sinθ`); **I am the bottom bar, not a felt seat**. Spectator view: all players are "opponents" on the arc. Each `Seat` = card fan (3 × `--w:60px`, −46px overlap, ±8° fan, via existing `TableCard` so deal/flip staggering and cái-last drama carry over) + info pill (Avatar/Cái badge/name/stake) + points badge after reveal.
   - Points badge from real `RevealedHand`: `baTien` → gold "BA TIÊN" pill (glowPulse), `score 9` → "CÀO CHÍN" gold pill (glowPulse), `score 0` → "BÙ", else "{n} điểm". Update `handLabel.ts` to these display strings (single label source, also used by History).
   - Win/lose dressing from `round.result`: Cào cái → each con's `outcomes[id]` (winners glow, losers dim, **the cái glows only if it beat the majority — simpler rule: cái glows when its net delta > 0**); Cào rùa → `potWinner` glows. Non-participants stay dimmed at 50%.
5. **Pot**: center chip stack + gold amount = sum of `round.bets` (Cào rùa) / total stakes (Cào cái display). Appears once betting has bets.
6. **Betting bar** (`BettingBar`, BETTING + participant + not cái):
   - **Countdown ring** driven by the server deadline: `fraction = remaining(endsAt) / config.bettingSeconds` (reuse `useCountdown`); "Chờ đặt cược…" state when `endsAt == null`. The ring **never** triggers dealing.
   - **Chip buttons**: `[minBet, ×5, ×10, ×25, ×50]` clamped to `min(maxBet, me.balance)`, dedup after clamping; selected chip lifts + gold ring; chip style class from prefs (`classic|gold|jade`). Keep a fine-tune stepper (− / + / Tối đa) as a small secondary row — the current UX allows arbitrary amounts and rebetting ("Đổi cược"/"Xoá"), which the chips alone can't express.
   - "Đặt cược" gold button → existing `placeBet` (with `loading`); current-bet readout panel.
   - Cái during betting sees a status panel + (host) the "Chốt cược & lật bài" gold button in the bar.
7. **MyHandBar** (after betting closes): 3 big cards (`--w:86px`, fanned) via `TableCard` (keeps flip timing incl. cái-last), readout panel "Bài của bạn" + label, then the personal outcome line (+/− delta in jade/red).
8. **"Đang chia bài…" cosmetic phase**: when status flips BETTING→REVEAL, hands arrive at once. Sequence purely client-side: deal-in cascade (existing `dealDelayMs`) with the gold status text, then flips (existing `flipDelayMs`). No new state machine — derive from `status` + animation timings.
9. **Reveal-end controls**: host's "Ván tiếp"/"Về sảnh" restyled in the bottom bar after the result is shown. Reactions: `FloatingReactions` overlays the felt; `ReactionBar` docks beside the bottom bar.

**Acceptance:** every intention still flows through the store exactly as before; 2-, 6-, and 16-player arcs look right; spectator + non-participant + cái variants all render; no engine/authority/protocol diffs in `git diff`.

### Phase F — Result overlay
**Files:** new `src/components/ResultOverlay.tsx`.

The real app has no route change at result time (host drives "Ván tiếp") — so the design's Result *screen* becomes a **dismissible overlay** on the table, shown once `round.result` lands (after the flip choreography, ~2.5s delay), z-ordered above the felt:
1. Gilt panel `min(440px, 92%)`, ribbon "THẮNG LỚN"/"THUA CUỘC" (cái and Cào rùa non-winners get "lose" styling; zero-delta → neutral wording), title, your 3 cards (`--w:78px`, glow/dim), points line (with BA TIÊN/CÀO CHÍN variants), gold rule ◆.
2. Stats rows adapted to both modes: Cào cái → "Kết quả: Thắng/Thua vs cái", your bet, "Bạn nhận/Bạn mất" big jade/red delta; Cào rùa → "Người thắng {name} · {label}", "Tổng cược" pot, delta.
3. Win-only slow conic `result-rays` behind the panel.
4. Actions: "Đóng" ghost (back to table view — overlay is informational; non-hosts wait for the cái), and for the host: "Chơi tiếp →" gold (`nextRound`) + "Về sảnh" ghost (`backToLobby`). Spectators get close-only.
5. Auto-dismiss when the next round starts (status returns to BETTING).

### Phase G — Polish, prefs, responsive, a11y
1. **Prefs** (`src/utils/prefs.ts` + a small "Giao diện" section in `SettingsModal` or a popover): `cardBack: drum|phoenix|lotus`, `chipStyle: classic|gold|jade`. localStorage, client-only, no protocol impact. (Design's `layout round|arc|compact` is dropped — responsive handles it; revisit only if the felt feels cramped ≥12 players.)
2. **Responsive** (≤720px, from `screens.css`): hero 28px, felt 96%, seat cards `--w:44px`, smaller avatars, wrapping betting bar, hand cards `--w:64px`, tighter paddings. Verify 16 opponents on a 360px viewport (info pills may need name truncation).
3. **Reduced motion sweep**: every new entrance animation must leave the element visible without it; `glowPulse`/`spin`/`float` additive only.
4. **A11y**: keep existing `aria-label`s on cards (`Lá úp`, rank+suit); ribbon/outcome text not conveyed by color alone (already textual); chip buttons get `aria-pressed`; countdown ring has the numeric text fallback (design already does).
5. **Toast** restyle; `RoomPage` connect/fatal screens get the stage + gilt panel treatment.
6. **Docs sync** (CLAUDE.md requirement): update **GDD.md** UI section and **README.md** screenshots/description to the Lacquer & Gold UI; note the prefs. TDD untouched (no architectural change).

---

## 2. File map (target state)

```
src/
  styles/theme.css                ← tokens, stage, motifs, felt, seats, cards CSS (ported)
  index.css                       ← Tailwind directives + existing animation rules (kept) + imports theme.css
  utils/money.ts                  ← formatChips / moneyShort (vi-VN)
  utils/prefs.ts                  ← cardBack + chipStyle (localStorage)
  components/
    ui.tsx                        ← reworked primitives (same exports + GoldText/GoldRule/Coin)
    Stage.tsx                     ← bk-stage backdrop + motif
    BeikaoLogo.tsx                ← drum mark + wordmark
    Avatar.tsx                    ← initial + color + Cái badge (shared)
    PlayingCard.tsx               ← rewritten: CardFace/CardBack, --w sizing
    cards/{CardFace,CardBack}.tsx
    TableCard.tsx                 ← kept (flip/deal mechanics), new faces
    table/{Felt,Seat,BettingBar,MyHandBar,Pot,BeikaoEmblem}.tsx + seatGeometry.ts
    ResultOverlay.tsx             ← new
    GameTable.tsx                 ← re-layout, logic untouched
    Lobby.tsx, HomePage…          ← reskins
  components/handLabel.ts         ← display strings: BA TIÊN / CÀO CHÍN / BÙ / {n} điểm
tailwind.config.js                ← token mapping, fonts, keyframes (felt-green palette removed)
```

Untouched: `features/cao/**`, `features/room/**` (incl. tests), `network/**`, `app/session/**`, `app/store/**`, `supabase/**`.

## 3. Risks & gotchas

- **The mock's logic is a honeypot.** Anything in `table.jsx` that deals, scores, times, or decides winners must be re-derived from `RoomState`. Code review checklist item: *no `Math.random`, no client deck, no client-decided outcomes.*
- **Server timing vs choreography**: REVEAL arrives as one snapshot; all "dealing" drama is client cosmetic. Keep delays short enough that a reconnecting client (hands already present) isn't stuck watching stale animation — on mount with `result` already present, skip straight to the end state (the remount-key pattern in `TableCard` already mostly handles this; verify).
- **`overflow: hidden` body** from the prototype would break chat/history scrolling — stage must be a fixed background layer instead.
- **Vietnamese diacritics**: never let "BEIKAO"-style Playfair leak into Vietnamese strings (ồ/ể/ặ render wrong in Latin-only faces).
- **16-player arc density**: prototype maxes at 15 opponents on one arc; at small widths pills will collide — plan for name truncation + smaller `--w`, test early in Phase E, not at the end.
- **jsdom tests**: none of the touched components have DOM tests today; if any are added, remember the `crypto.subtle` node-environment gotcha doesn't apply to pure UI tests, but `matchMedia` (reduced motion) may need a jsdom stub.
- **Tailwind purge**: dynamic class names (e.g. ``chip-btn ${style}``) must be full literal strings or safelisted.

## 4. Sequencing & verification

A → B → C/D (parallelizable) → E → F → G. Each phase: `npm run build && npm run lint && npm run test` (43 tests must stay green — they don't touch UI, so any failure means logic leaked into the refactor). Manual pass per phase against the prototype (`design_handoff_beikao/Beikao.html` opens standalone in a browser for side-by-side). Final: full two-browser multiplayer smoke (create → browse-join → bet → reveal → result overlay → next round → leave), plus spectator and reload-reconnect paths, at 1280px and 360px.
