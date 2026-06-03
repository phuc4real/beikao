# Game Design Document — Multiplayer Bài Cào (Three-Card)

> **Document type:** Game Design Document (GDD) — *what* the game is and *how it plays*.
> For *how it's built*, see [TDD.md](./TDD.md). For the high-level pitch, see [project_idea.md](./project_idea.md).
>
> **Game:** *Bài cào* (also *Cào*, *3 cây* / "three-card") — a fast Vietnamese gambling card game.
> Rules source: https://vi.wikipedia.org/wiki/Bài_cào
>
> ⚠️ **Note:** `TDD.md` and `project_idea.md` still describe *Baccarat* (the project's earlier direction). The game has changed to **Bài cào**; those documents need the same pivot — the Baccarat engine (Player/Banker hands, drawing tableau) does **not** apply here.

---

## 1. High Concept

A lightweight, browser-based **multiplayer Bài Cào** game playable directly from a static site (GitHub Pages). One player hosts a room and acts as the **cái (dealer)** — a real player everyone else bets against. Each round, every player is dealt **3 cards**, scores the **last digit** of their card total, and the higher score wins. Rounds are fast (seconds), social, and require no skill. No accounts, no install, near-zero infrastructure.

**Pillars**
1. **Instant & frictionless** — open a link, share a code, play in seconds.
2. **Social** — chat, shared table, reactions; built for friends.
3. **Fair** — outcomes are authoritative and (optionally) cryptographically verifiable, even though a player is the dealer.
4. **Faithful** — real Bài cào rules: 3 cards, last-digit scoring, special hands, suit-rank tie-breaks.

---

## 2. Target Audience & Platform

| Aspect | Detail |
| --- | --- |
| Audience | Vietnamese-card-game players & friend groups wanting a quick social gambling game; people learning Bài cào. |
| Skill floor | Zero — pure chance; you place a bet, cards are dealt, high score wins. |
| Platform | Modern desktop & mobile browsers (Chrome, Edge, Firefox, Safari). |
| Localization | Vietnamese-first UI with English option; uses native terms (cái, con, cào, bù, ba tiên). |
| Orientation | Portrait-first (mobile), responsive up to desktop. |
| Session length | 5–20 minutes; many quick rounds. |
| Monetization | None. Virtual chips only. No real-money gambling. |

> **Compliance note:** This is a *play-money* social game. There is no purchase, cash-out, or real-currency wagering. Bài cào is traditionally a gambling game, so the UI must clearly present chips as **virtual/for fun** and avoid implying real winnings.

---

## 3. Core Gameplay Loop

```text
Lobby ──► Ready up ──► Betting window ──► Deal 3 cards ──► Reveal & compare ──► Payout ──► (next round / lobby)
```

1. **Lobby** — players join, see each other, set ready. The **cái (dealer)** is the host. Host starts the round when ≥1 other player is ready (a cái needs at least one *con*/player to bet against).
2. **Betting window** — a countdown (default 15s). Each *con* (non-dealer player) places a bet against the cái. Bets can be changed/cleared until the window closes. (In pot mode, everyone antes equally — see §8.)
3. **Deal** — the dealer deals **3 cards** to every player including themselves. Hidden until reveal.
4. **Reveal & compare** — all hands flip simultaneously. Each player's score is computed (last digit of the 3-card sum), special hands identified, ties broken by suit rank.
5. **Payout** — chips settled (dealer vs. each con, or pot to the highest hand); result added to round history.
6. **Loop** — a new betting window opens, or the room returns to lobby if the host pauses. The cái role may rotate (configurable — see §6).

**Round duration target:** ~20–35 seconds (betting + deal + reveal hold).

---

## 4. Rules of Bài Cào

A **banked, no-decision** game: players only bet; there are no draws or discards. A hand is just 3 dealt cards.

### 4.1 Deck & deal
- Standard **52-card** deck.
- Each player receives exactly **3 cards**.
- One dealer (the **cái**) distributes cards to all players.
- Traditional Bài cào supports **2–17 players**; this implementation supports **2–16** (host/cái + up to 15 cons), configurable — see TDD.

### 4.2 Card values
| Card | Value |
| --- | --- |
| Ace (A) | 1 |
| 2–10 | face value |
| J, Q, K | 10 each |

### 4.3 Scoring — last digit ("nút")
A hand's score = **the last digit of the sum of its 3 cards** (i.e. `sum mod 10`).

- Highest possible score is **9**, the best hand, called **"cào"** (or *nút 9*) — this gives the game its name.
- A score of **0** is called **"bù"** (bust) — the worst hand. Examples: 10, 20, or 30 total → 0.

Examples:
| Cards | Sum | Score |
| --- | --- | --- |
| 9 + 9 + 9 | 27 | **7** |
| K + Q + 9 | 10+10+9 = 29 | **9 (cào)** |
| 5 + 5 + K (10) | 20 | **0 (bù)** |
| A + 3 + 5 | 9 | **9 (cào)** |

### 4.4 Special hand — "ba cào" / "ba tiên"
A hand of **three face cards (J/Q/K)** is called **"ba cào"** or **"ba tiên"**. It **wins automatically**, beating any numeric score (it does not need point calculation). This is the highest hand in the game.

> House-rule extensions (configurable, off by default): some tables award bonus multipliers for ba tiên or for *cào* (nút 9). See §5.

### 4.5 Determining the winner
1. **Ba tiên** beats everything. (If multiple players hold ba tiên — rare — break by highest card / suit, see below.)
2. Otherwise the **higher score (nút)** wins. 9 (cào) is best, 0 (bù) is worst.
3. **Tie on score → break by suit rank.** Compare the players' highest-ranking card by suit hierarchy:

   **♦ Diamond (rô) > ♥ Heart (cơ) > ♣ Club (chuồn/tép) > ♠ Spade (bích)**

   The **Ace of Diamonds (A♦)** is the single strongest card in the deck.

### 4.6 Win/lose vs. the cái (dealer)
In the default **Cào cái (dealer)** mode the dealer compares against each con individually:
- **Con's hand beats dealer's** → dealer pays the con (1:1 by default).
- **Dealer's hand beats or ties the con** → dealer takes the con's bet. (Ties are resolved by suit rank in 4.5; only a true exact-equal — same nút *and* same top suit, impossible with one deck — would push, so practically the suit rule always decides.)
- Each con is settled separately; the dealer can win against some and lose against others in the same round.

---

## 5. Economy & Progression

| Element | Default | Notes |
| --- | --- | --- |
| Starting balance | 1,000 chips | Set per room by host. |
| Min bet | 10 chips | Configurable. |
| Max bet | 500 chips | Configurable; protects the cái from a single all-in swing. |
| Dealer bankroll guard | optional | Cap total exposure so the cái can cover all cons' bets in a round. |
| Win payout (standard) | 1 : 1 | Con beats cái, or highest hand takes the pot. |
| Ba tiên bonus | ✕ off (configurable, e.g. 3 : 1) | House rule. |
| Cào (nút 9) bonus | ✕ off (configurable, e.g. 2 : 1) | House rule. |
| Rebuy | optional | Bankrupt player tops back up to starting balance, or spectates. |
| Persistence | per-session | Balances reset when the room closes (no global account in MVP). |

Money is tracked in **integer chip units** (no floats). No real progression/leveling in the MVP — the fun is the social per-session chip swing. (Accounts & leaderboards are a Phase-3 backend feature.)

---

## 6. Players & Roles

| Role | Bets? | Authority? | Notes |
| --- | --- | --- | --- |
| **Cái (dealer / host)** | ✅ Plays a hand | ✅ Yes | The host. Deals, holds the bank, and **plays a real 3-card hand** that every con compares against. Counts toward the table cap. |
| **Con (player)** | ✅ Yes | ❌ No | Standard participant; bets against the cái. |
| **Spectator** (Phase 2) | ❌ No | ❌ No | Watches a full/in-progress room. |

**Host = cái — design intent:** the host is a participant first and an authority second. Bài cào *has* a natural dealer role, so "host plays too" fits the game cleanly: the host is the cái. Authority is invisible during play — the cái has no information edge and their hand is dealt and scored by the same rules and (optionally) the same provably-fair deck as everyone else. Authority only matters operationally (owns the deck, starts rounds, configures the room).

**Cái rotation (configurable):**
- **Fixed cái** (default MVP) — the host stays cái every round.
- **Rotating cái** (Phase 2) — the cái seat passes around the table each round (the *authority* still runs on the host's machine; only the in-game *dealer hand/bank* role rotates). Common in Cào cái play so the house edge is shared.

**Host-only controls:** start round, pause to lobby, kick player, room settings (mode, bet limits, timer, bonuses, cái rotation), close room.

---

## 7. Fairness (player-facing design)

Since a *player* is the cái and controls the deck, the game must feel fair and not exploitable.

- **No client ever declares a result.** You bet an intention; the table deals and resolves.
- **The cái's hand is dealt from the same deck/shuffle as everyone else** — the dealer can't deal themselves a better hand.
- **Provably-fair badge (Phase 2):** before betting opens, the host publishes a sealed hash of the shuffled deck; after the round, the seed (mixed with every player's own random seed) is revealed so anyone can verify the deck — and the cái's own hand — were not altered after seeing bets. A ✓ badge appears on verified rounds.
- **MVP trust model:** if provably-fair is off, the UI clearly states "Casual mode — the cái runs the deck." This sets expectations for friend-group play.

See [TDD.md → Fairness](./TDD.md#7-fairness--anti-cheat) for the cryptographic detail.

---

## 8. Game Modes (variants)

Based on the three traditional Bài cào variants:

| Mode | VN name | Status | Description |
| --- | --- | --- | --- |
| **Dealer** | **Cào cái** | MVP (default) | Host is the cái; each con bets individually against the cái and is settled separately. Maps directly to host-authoritative play. |
| **Pot / all-in** | **Cào rùa** | MVP | Everyone antes an equal amount; the single highest hand takes the whole pot. No dealer advantage. |
| **Challenge** | **Cào thách** | Phase 2 | Players may privately wager head-to-head against each other in addition to the table. |
| **Casual (trust)** | — | MVP | Provably-fair disabled; fastest. |
| **Verified (provably fair)** | — | Phase 2 | Commit–reveal shuffle with per-round verification. |
| **Spectator** | — | Phase 2 | Watch-only seats. |

---

## 9. User Interface & Flow

### 9.1 Screens
```text
Home ──► (Create | Join) ──► Lobby ──► Game Table ──► (Results overlay) ──► Lobby/Game
```

### 9.2 Home
```text
        BÀI CÀO

   [ Tạo phòng / Create Room ]
   [ Vào phòng / Join Room  ]
   (nhập tên / enter name)
```

### 9.3 Lobby
```text
Phòng: BAC-8249           Cái: Alex
Người chơi (3/8)
 ★ Alex     $1000  ✓ sẵn sàng   (cái — plays too)
   Bình     $1000  ✓ sẵn sàng
   Châu     $1000  … chưa

 [ Sẵn sàng / Ready ]    [ Cài đặt / Settings ]  (cái)
 [ Chia bài / Start Round ]  (cái, ≥1 con ready)
 Chat: ____________________  [Gửi]
```

### 9.4 Game table
```text
Ván 12                    Đặt cược còn: 0:08

           CÁI (Alex)
           [🂠][🂠][🂠]   ← úp / hidden until reveal

  Bình  [🂠][🂠][🂠]   cược $100
  Bạn   [🂠][🂠][🂠]   cược $50
  Châu  [🂠][🂠][🂠]   cược $80

 Số dư: $940
 Đặt cược: [- 50 +]   [ Xác nhận ]   [ Xoá ]
 Lịch sử: 9 0 7 3 9 ...    Chat ▸
```

### 9.5 Results overlay
```text
                KẾT QUẢ — Ván 12
  CÁI (Alex)   [K♦][Q♥][9♠]  = 9 (cào)

  Bình  [5♣][5♥][7♦] = 7   ✗ thua  −$100
  Bạn   [A♦][J♠][8♥] = 9   ⚖ hoà-nút → so chất: A♦ thắng  +$50
  Châu  [J♦][Q♣][K♥] = ba tiên 🏆  +$80   (special hand beats cào!)

  Số dư của bạn: $990        Ván sau trong 0:04
```

Shows every hand flipping simultaneously, each player's score (or special hand), the tie-break reason when relevant, and each player's net chip change vs. the cái.

---

## 10. Audio / Visual / Feel

| Element | Direction |
| --- | --- |
| Visual style | Clean, modern "felt table" minimalism; Vietnamese-card-game warmth; high-contrast for mobile. |
| Card animations | Deal slide-in (face-down) + **simultaneous flip** on reveal (no per-client peeking — the cái can't see hands early). |
| Chips | Stacked chip visuals snapping to each player's bet zone. |
| Special hands | Distinct highlight + label for **cào (9)**, **ba tiên**, and **bù (0)**. |
| Suit tie-break | Animated callout showing the deciding card and its suit rank when a tie is broken. |
| Sound (optional) | Card deal, chip clink, win/lose sting, countdown tick, special-hand fanfare. Mutable. |
| Haptics (mobile) | Light tap on bet confirm / win. |
| Feedback timing | Result held ~4s before next betting window. |

Accessibility: color-blind-safe outcome indicators (icons + text + suit symbols, not color alone), scalable text, keyboard-navigable bet controls. Suit symbols (♦♥♣♠) shown explicitly since they decide ties.

---

## 11. Edge Cases (player-experience view)

> Full technical handling is in the TDD; this section covers what the *player sees*.

| Situation | Player experience |
| --- | --- |
| Room full | "Phòng đã đầy / Room is full" + offer to spectate (Phase 2). |
| Join mid-round | Seated immediately, "You'll join the next round." |
| Disconnect mid-round | Reconnect within grace period and resume; bets placed before the window closed still resolve. |
| **Cái (host) leaves** | "Cái đã rời phòng — phòng đóng / Host left — room closed" (MVP), or seamless host migration + new cái (Phase 2). |
| Out of chips | Rebuy prompt (if enabled) or move to spectate. |
| Bet over balance / limits | Inline error, bet not accepted. |
| **Tie on score** | Resolved by suit rank (♦>♥>♣>♠); UI shows the deciding card. |
| **Ba tiên dealt** | Auto-win highlighted; beats even a cào (9). |
| Nobody bets | Round can be skipped or dealt with no payouts (per config). |
| Network can't connect | Clear "couldn't connect (network restrictions)" message, not a frozen screen. |

---

## 12. Success Metrics (non-binding)

- A room can be created and a second player joined in **< 30 seconds**.
- A full round completes in **< 35 seconds**.
- Bài cào rules are **100% correct** (scoring, special hands, suit tie-breaks) — verified by unit tests.
- Playable on a mid-range phone over mobile data (requires TURN — see TDD).

---

## 13. Scope Summary

| Feature | MVP | Phase 2 | Phase 3 |
| --- | --- | --- | --- |
| Create/Join, 2–16 players, host is cái & plays | ✅ | | |
| Full Bài cào rules (3 cards, last-digit, ba tiên, suit tie-break) | ✅ | | |
| Cào cái + Cào rùa modes | ✅ | | |
| Betting timer, limits, chat, history | ✅ | | |
| Reconnection (grace period) | ✅ | | |
| Graceful host-leave (room close) | ✅ | | |
| Provably-fair verification | | ✅ | |
| Cào thách (private challenges), rotating cái | | ✅ | |
| Spectator, reactions, replay | | ✅ | |
| Host migration | | ✅ | |
| Bonus multipliers (ba tiên / cào) | | ✅ | |
| Accounts, leaderboard, tournaments | | | ✅ |

---

## 14. Out of Scope (explicitly)

- Real-money gambling / payments.
- Other Vietnamese card games (Tiến lên, Phỏm, etc.) — separate products.
- Cross-room matchmaking / global lobby.
- Mobile native apps (web only).

---

## 15. Glossary (Vietnamese terms)

| Term | Meaning |
| --- | --- |
| **Bài cào** | The game; a 3-card last-digit game. |
| **Cái** | The dealer / banker (the host in this app). |
| **Con** | A non-dealer player betting against the cái. |
| **Nút** | A hand's point score (last digit of the sum). |
| **Cào** | The best score, **9** (also the game's namesake). |
| **Bù** | A score of **0** — bust, the worst hand. |
| **Ba tiên / ba cào** | Three face cards (J/Q/K) — auto-win, beats any score. |
| **Cào cái** | Dealer-mode variant (default). |
| **Cào rùa** | Equal-ante pot variant; highest hand takes the pot. |
| **Cào thách** | Challenge variant with private head-to-head wagers. |
| **Rô / Cơ / Chuồn (Tép) / Bích** | Diamond ♦ / Heart ♥ / Club ♣ / Spade ♠ — suit rank, high to low. |
