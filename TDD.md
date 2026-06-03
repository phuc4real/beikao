# Technical Design Document — Multiplayer Bài Cào

> **Document type:** Technical Design Document (TDD) — *how the game is built*.
> For *what* the game is, see [GDD.md](./GDD.md). For the pitch, see [project_idea.md](./project_idea.md).
>
> **Game:** *Bài cào* (Vietnamese three-card game). Rules: https://vi.wikipedia.org/wiki/Bài_cào

---

## 1. Summary

A static React SPA, deployed on GitHub Pages, implementing a **host-authoritative** peer-to-peer **Bài cào** game over WebRTC (PeerJS). One player's browser is both the **authority** (owns deck, RNG, validation, payouts, state) and a **participant** — specifically the **cái (dealer)**, a real player everyone else bets against. Clients are render-only mirrors that send *intentions* and receive authoritative *snapshots*.

**Key constraints**
- No dedicated game backend. (Signaling broker + TURN relay are still required external services — see §4.)
- Deterministic, testable game engine (3-card scoring, special hands, suit tie-breaks).
- Strict separation of the host's *authority* role from its *cái/player* role so the dealer has no in-game information edge.

---

## 2. Technology Stack

| Layer | Choice | Rationale |
| --- | --- | --- |
| Language | TypeScript (strict) | Type safety across protocol & engine. |
| Framework | React 18 + Vite | Fast static build, GitHub Pages friendly. |
| Styling | Tailwind CSS | Rapid responsive UI. |
| State | Zustand | Minimal, no boilerplate, easy snapshot replace. |
| Transport | PeerJS (WebRTC DataChannel) | P2P with a thin signaling broker. |
| Persistence | IndexedDB (via `idb`) | Round history & reconnection session. |
| Crypto | Web Crypto API (`crypto.subtle`, `getRandomValues`) | Secure RNG + provably-fair hashing. |
| Validation | Zod | Runtime validation of all inbound messages. |
| i18n | lightweight (vi default, en) | Vietnamese-first UI. |
| Testing | Vitest + Testing Library + Playwright | Engine unit tests, component tests, E2E. |
| CI/CD | GitHub Actions → Pages | Build + test + deploy. |

---

## 3. High-Level Architecture

```text
            ┌────────────────────────────────────────────┐
            │              Browser (any peer)             │
            │                                             │
            │  React UI ── Zustand store ── IndexedDB     │
            │       │            ▲                        │
            │       ▼            │ snapshot               │
            │  NetworkLayer (PeerJS DataChannel)          │
            └───────────────┬─────────────────────────────┘
                            │
        signaling (broker) + ICE/TURN relay
                            │
        ┌───────────────────┴────────────────────┐
        │  HOST browser                           │
        │  ┌────────────────────────────────────┐ │
        │  │ Authority (single source of truth) │ │
        │  │  • CaoEngine (3-card scoring)      │ │
        │  │  • RoomManager / state machine     │ │
        │  │  • BetValidator / Settlement       │ │
        │  │  • RNG + provably-fair commit      │ │
        │  └────────────────────────────────────┘ │
        │  ┌────────────────────────────────────┐ │
        │  │ Participant: the CÁI (dealer hand) │ │
        │  │  • dealt from the same shuffled deck│ │
        │  │  • same client code path as peers  │ │
        │  └────────────────────────────────────┘ │
        └─────────────────────────────────────────┘
```

**Code separation rule:** the Authority module must never branch on "is this the host/cái." The cái's hand is dealt from the same shuffled deck as everyone else, and the host's UI sends the same intentions through the same `NetworkLayer` abstraction (loopback for the host). This guarantees the dealer has no information or rules advantage beyond the structural house edge of being the cái (which is part of the game).

### 3.1 Module map (`src/`)

```text
app/        store, router, providers, app bootstrap
features/
  room/     room creation, join, lobby, settings, state machine
  cao/      pure engine (deck, shuffle, deal, scoring, special hands, tie-break, settlement)
  player/   seats, balances, ready state, cái assignment
  betting/  bet entry UI, client-side mirror validation, timer
  chat/     chat feature
  history/  round history + IndexedDB store
network/
  peer/     PeerJS lifecycle, connection registry, loopback for host
  protocol/ message types, Zod schemas, envelope, versioning
  sync/     snapshot/delta, stateVersion, reconciliation, acks
components/  shared UI primitives
pages/       Home, Lobby, Game
utils/       crypto, money (integer), id, rng, i18n
```

---

## 4. Networking

### 4.1 The "no backend" caveat (must plan for)
WebRTC needs out-of-band signaling and often a relay:

| Need | Why | Plan |
| --- | --- | --- |
| **Signaling broker** | Peers must exchange SDP/ICE to connect. PeerJS provides this. | Public PeerJS cloud for MVP; self-host `peerjs-server` (Render/Fly free tier) for reliability/control. |
| **STUN** | Discover public IP for NAT. | Free Google STUN servers. |
| **TURN** | Symmetric NAT / mobile / corporate networks can't P2P without relay. | **Required for production.** Self-host `coturn`, or a paid TURN (Metered/Twilio). Budget a small cost; this is the one real expense. |

```typescript
const peer = new Peer(id, {
  // host: 'your-peerjs-server.example.com',  // self-hosted broker
  config: {
    iceServers: [
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'turn:turn.example.com:3478', username: '…', credential: '…' },
    ],
  },
});
```

### 4.2 Topology
**Star** — every client opens exactly one DataChannel to the host (cái). The host fans out snapshots. Host upstream bandwidth scales linearly with player count; comfortable at ≤16 (snapshots are small JSON, and the host can batch/broadcast a single delta to all peers rather than N tailored messages).

### 4.3 Channel configuration
Game-critical messages use an **ordered + reliable** DataChannel (default). Sequence numbers are a backstop, not the primary ordering mechanism.

### 4.4 Connection registry (host)
```typescript
interface Connection {
  peerId: string;
  conn: DataConnection;
  playerId: string;        // stable identity (survives reconnect)
  lastInboundSeq: number;  // for idempotency
  lastAckedVersion: number;
}
```

---

## 5. Protocol

### 5.1 Envelope
```typescript
interface Envelope<T = unknown> {
  v: 1;            // protocol version (reject/upgrade on mismatch)
  type: MessageType;
  seq: number;     // sender's monotonic counter
  ts: number;      // sender clock (advisory only — never trusted for timing)
  payload: T;
}
```

### 5.2 Message catalog

**Client → Host**
| Type | Payload | Notes |
| --- | --- | --- |
| `PLAYER_JOIN` | `{ name, sessionId? }` | sessionId for reconnection. |
| `SET_READY` | `{ ready }` | |
| `PLACE_BET` | `{ amount }` | con's stake against the cái (single bet — no bet *type* in Bài cào). |
| `CLEAR_BET` | `{}` | |
| `SEED_COMMIT` | `{ hash }` | provably-fair (Phase 2). |
| `SEED_REVEAL` | `{ seed }` | provably-fair (Phase 2). |
| `CHAT` | `{ text }` | rate-limited. |
| `ACK` | `{ version }` | acks last applied snapshot. |
| `REQUEST_SNAPSHOT` | `{}` | recovery / gap fill. |

> **Note vs. Baccarat:** there is **no `betType`** — a con simply stakes an amount against the cái (Cào cái) or antes into the pot (Cào rùa). The bet is a single number.

**Host → Clients**
| Type | Payload | Notes |
| --- | --- | --- |
| `SNAPSHOT` | full `RoomState` | join/reconnect/migration/gap. |
| `STATE_DELTA` | partial state + `version` | normal play. |
| `BETTING_OPEN` | `{ endsAt, deckCommitment? }` | starts countdown. |
| `BETTING_CLOSED` | `{}` | |
| `ROUND_RESULT` | `RoundResult` | every hand, scores, special hands, tie-break reasons, settlements. |
| `PLAYER_JOINED` / `PLAYER_LEFT` | `{ player }` / `{ playerId }` | |
| `ERROR` | `{ code, reason }` | targeted to one client. |
| `HOST_MIGRATION` | `{ newHostId, newCaiId }` | Phase 2. |
| `KICKED` / `ROOM_CLOSED` | `{ reason }` | |

### 5.3 Message handling rules
- **Validation:** every inbound message parsed with a Zod schema; failures dropped + optional `ERROR`.
- **Idempotency:** host ignores `seq ≤ lastInboundSeq` per peer.
- **Authority:** clients never apply their own bet to authoritative state; they show optimistic UI and reconcile on the next snapshot/delta.
- **Rate limiting:** per-peer token bucket on `CHAT` and `PLACE_BET`.
- **Versioning:** mismatched `v` → host sends `ERROR{code: VERSION_MISMATCH}`; client prompts reload.

---

## 6. Game Engine (`features/cao`)

Pure, deterministic, **no I/O, no React, no network** — fully unit-testable.

```typescript
type Suit = 'D' | 'H' | 'C' | 'S';   // ♦ rô > ♥ cơ > ♣ chuồn > ♠ bích
type Rank = 'A'|'2'|'3'|'4'|'5'|'6'|'7'|'8'|'9'|'10'|'J'|'Q'|'K';
interface Card { rank: Rank; suit: Suit; }

const SUIT_RANK: Record<Suit, number> = { D: 4, H: 3, C: 2, S: 1 }; // higher = stronger
const RANK_ORDER: Record<Rank, number> = { /* A=1 … K=13, for top-card comparison */ };

function cardPoints(c: Card): number;   // A=1, 2–10 face, J/Q/K=10
function handScore(cards: Card[]): number;   // (sum of cardPoints) % 10  → 0..9 ("bù"=0, "cào"=9)

function isBaTien(cards: Card[]): boolean;   // all three are J/Q/K  → auto-win

function createDeck(): Card[];           // 52 cards
function shuffle(deck: Card[], seed: Uint8Array): Card[];  // deterministic Fisher–Yates from seeded CSPRNG

interface Hand {
  playerId: string;
  cards: [Card, Card, Card];
  score: number;          // 0..9
  baTien: boolean;
}

// Total cards needed = 3 * playerCount; one 52-card deck supports up to 17 players.
function deal(deck: Card[], playerIds: string[]): { hands: Hand[]; usedCards: number };
```

### 6.1 Hand ranking & comparison (the critical logic)

A hand's strength, highest to lowest:
1. **Ba tiên** (three face cards) — beats every non-ba-tiên hand.
2. Otherwise, **higher `score`** wins (9 best … 0/"bù" worst).
3. **Tie-break on equal rank:** compare the **highest card** of each hand. "Highest" is decided by **suit rank first** per Vietnamese rules (♦>♥>♣>♠) — the **A♦ is the single strongest card**. (Rank value is used only to *pick each hand's top card*; the suit ordering is the decider, since with one deck two players can't share the exact same card.)

```typescript
// returns >0 if a beats b, <0 if b beats a, 0 only if truly identical (impossible single-deck)
function compareHands(a: Hand, b: Hand): number {
  if (a.baTien !== b.baTien) return a.baTien ? 1 : -1;
  if (!a.baTien && a.score !== b.score) return a.score - b.score;
  // tie-break: each hand's strongest card by (suit, then rank); compare those
  return cardStrength(topCard(a)) - cardStrength(topCard(b));
}
// cardStrength prioritizes suit per VN rules; e.g. strength = SUIT_RANK[suit]*100 + RANK_ORDER[rank]
```

> **Note vs. Baccarat:** there are **no drawing rules / third-card tableau**. A hand is exactly 3 dealt cards. The hard part here is the **ba tiên** special case and the **suit-rank tie-break**, not card-drawing.

### 6.2 Settlement
Money is **integer chip units** everywhere — no floats.

**Cào cái (dealer mode, default):** the cái's hand is compared against each con independently.
```text
for each con:
  cmp = compareHands(con.hand, cai.hand)
  if cmp > 0:   con wins  → cai pays con: +bet  (× baTien/cào bonus if enabled)
  else:         cai wins  → cai takes con's bet: −bet
                (cmp == 0 impossible single-deck; suit rule always decides)
net cai delta = Σ over cons of the opposite of each con's delta
```

**Cào rùa (pot mode):** every player antes equally; the single hand with the highest `compareHands` rank takes the whole pot. (Ties broken by suit per above, so exactly one winner.)

**Bonuses (configurable, off by default):** if `baTienPayout`/`caoPayout` set, a winning con with ba tiên / score 9 is paid `bet * multiplier` (rounding defined once, `floor`).

### 6.3 Deck capacity
3 cards per player × 16 players = 48 cards ≤ 52 → a single deck suffices (the rules allow up to 17 = 51 cards). Validate `3 * playerCount <= 52` before dealing. Reshuffle a fresh deck every round (each round is independent; no persistent shoe needed, unlike Baccarat).

---

## 7. Fairness & Anti-Cheat

The host is the **cái** (plays *and* controls the deck) → two defensive layers.

### 7.1 Layer 1 — Authority/participant separation (MVP, always on)
- The cái's 3 cards are dealt from the **same shuffled deck** as everyone else, in a fixed seat order — the dealer cannot deal itself better cards.
- Con bets traverse the identical validate→settle path as the cái's accounting (loopback connection).
- No authority/engine code branches on `isHost` / `isCai`.
- Clients send intentions only; results are computed solely by the engine.

### 7.2 Layer 2 — Provably-fair commit–reveal (Phase 2)
Goal: the cái cannot alter the deck (or its own hand) after seeing bets, and **no single party** controls the deal.

```text
1. COMMIT  (before betting opens)
   hostSeed = getRandomValues(32 bytes)
   deck = shuffle(createDeck(), deriveKey(hostSeed))   # locked, hidden
   broadcast deckCommitment = SHA-256(hostSeed)

2. CONTRIBUTE (during betting)
   each client sends SEED_COMMIT { SHA-256(playerSeed) }

3. REVEAL (after betting closes)
   clients reveal playerSeed; host reveals hostSeed
   finalSeed = SHA-256(hostSeed ‖ sorted(playerSeeds))
   actual deck = shuffle(createDeck(), finalSeed)
   deal in fixed seat order (cái's hand included, no special position)

4. VERIFY (every client, independently)
   • SHA-256(hostSeed) == deckCommitment ?
   • recompute shuffle(finalSeed) == dealt cards (including the cái's) ?
   mismatch ⇒ show "fairness violation" warning, flag host
```

- Use HKDF/SHA-256 over the seed to feed a reproducible CSPRNG stream for Fisher–Yates.
- Deck committed *before* bets so the cái can't reshuffle after seeing the table; player-seed mixing means even a malicious cái can't precompute a favorable deal.

### 7.3 Server-side trust (Phase 3)
Moving RNG to a real backend (SignalR + server RNG) eliminates the host-cheating class entirely.

---

## 8. State Management & Synchronization

### 8.1 Authoritative state (host)
```typescript
interface RoomState {
  id: string;
  hostId: string;
  caiId: string;                 // current dealer (host in MVP; rotates in Phase 2)
  mode: 'CAO_CAI' | 'CAO_RUA';
  status: RoomStatus;            // state machine below
  players: Player[];
  seatOrder: string[];           // deal order; cái's deal position is fixed & public
  config: RoomConfig;
  currentRound?: Round;
  history: RoundResult[];        // capped (e.g. last 50)
  version: number;               // ++ on every mutation
}

interface Player {
  id: string; name: string; balance: number;   // integer chips
  ready: boolean; isCai: boolean; connected: boolean; lastSeenSeq: number;
}

interface RoomConfig {
  maxPlayers: number;            // 2–16 (≤17 supported by deck)
  startingBalance: number; minBet: number; maxBet: number;
  bettingSeconds: number;
  baTienPayout: number;          // multiplier, 1 = off
  caoPayout: number;             // multiplier, 1 = off
  caiRotation: 'FIXED' | 'ROTATE';
  allowRebuy: boolean;
}
```

### 8.2 State machine
```text
LOBBY ──start──► BETTING ──timer──► DEALING ──► REVEAL ──► SETTLE
   ▲                                                          │
   └──────────── next round (maybe rotate cái) / pause ◄──────┘
(any) ──host leaves──► CLOSED   |   (any) ──migration──► LOBBY/BETTING
```

### 8.3 Sync strategy
- **Full `SNAPSHOT`** on: join, reconnect, host migration, detected version gap. (Snapshots sent during BETTING/LOBBY must **not** include hidden hands — only public info.)
- **`STATE_DELTA`** during play (changed slices only).
- Client tracks `version`; on gap → `REQUEST_SNAPSHOT`.
- Hands are revealed to clients only at the `REVEAL`/`ROUND_RESULT` step — never earlier (prevents anyone, including the cái, from seeing hands during betting).

### 8.4 Client store (Zustand) shape
```typescript
interface ClientStore {
  me: { playerId: string; sessionId: string };
  room: RoomState | null;          // mirror (hidden hands omitted until reveal)
  optimisticBet?: number;          // pending local stake, reconciled on delta
  connection: 'connecting' | 'open' | 'reconnecting' | 'closed';
  // actions emit intentions: placeBet(amount), setReady(), sendChat()...
}
```

---

## 9. Reconnection

### 9.1 Stored locally (IndexedDB / localStorage)
```text
playerId   (stable identity)
sessionId  (auth token for the seat)
roomId
name
lastVersion
```

### 9.2 Flow
```text
reconnect → PLAYER_JOIN{ sessionId } → host matches reserved seat → SNAPSHOT → resume
```

### 9.3 Rules
- On disconnect the host marks `player.connected = false`, **holds the seat + balance** for a grace window (default 60s).
- A bet placed before `BETTING_CLOSED` **still settles** if the player drops (no escaping a loss).
- Grace expiry → release seat; balance forfeited per `config.allowRebuy`.
- If the **cái** disconnects → host loss handling (§10).

---

## 10. Host / Cái Disconnect & Migration

### 10.1 MVP — graceful termination
Host drop → remaining clients detect the closed DataConnection → "Cái rời phòng — phòng đóng / Host left — room closed" → return Home. History persisted locally.

### 10.2 Phase 2 — host migration
```text
detect host loss
  → deterministic election (lowest connected peerId, or next seatOrder)
  → elected peer promotes its latest mirror to authoritative; becomes new host
  → assign new caiId (next in rotation, or the new host)
  → re-establish mesh: peers reconnect to new hostId
  → broadcast HOST_MIGRATION + full SNAPSHOT
  → any in-flight round is VOIDED + REFUNDED (hidden deck can't survive migration)
  → resume from LOBBY
```

---

## 11. Persistence (IndexedDB)

| Store | Contents | Purpose |
| --- | --- | --- |
| `session` | playerId, sessionId, roomId, name | reconnection |
| `history` | per-room round results (capped) | history panel, replay (Phase 2) |
| `settings` | UI prefs (sound, theme, language) | UX |

Graceful degradation: if IndexedDB is unavailable (private mode / quota), fall back to in-memory; the game still runs, history just isn't persisted.

---

## 12. Security & Validation Checklist

- [ ] All inbound messages Zod-validated against schema + current state.
- [ ] Bet bounds enforced server-side: `minBet ≤ amount ≤ maxBet`, `amount ≤ balance`, only during `BETTING`, and only from `con` players (the cái doesn't bet against itself).
- [ ] No `isHost`/`isCai` branch in authority/engine code.
- [ ] Hidden hands never sent to clients before `REVEAL`.
- [ ] CSPRNG (`getRandomValues`) for all randomness; never `Math.random`.
- [ ] Integer money only; explicit rounding for bonus multipliers.
- [ ] Per-peer rate limiting (chat, bets).
- [ ] Chat sanitized/escaped on render (XSS); length-capped.
- [ ] Sequence-number idempotency; reject replays.
- [ ] Names: non-empty, length-capped, deduped, sanitized.
- [ ] Client timestamps never used for the betting deadline (host owns `endsAt`).
- [ ] `3 * playerCount <= 52` validated before dealing.

---

## 13. Edge-Case Handling Matrix

| Category | Case | Handling |
| --- | --- | --- |
| Room | code collision | regenerate; unknown code = "room not found". |
| Room | full | reject join, offer spectate (P2). |
| Room | join mid-round | seat now, bet next `BETTING`. |
| Player | duplicate name | append `#2`. |
| Player | empty/oversized name | reject/clamp. |
| Cái-as-player | host counted in cap | occupies a seat. |
| Cái-as-player | cái bankrupt | still authority; if can't cover bets, cap exposure or block start. |
| Cái-as-player | no cons ready | block start (a cái needs ≥1 con). |
| Betting | over balance / limits | `ERROR{BET_REJECTED}`. |
| Betting | bet after close | reject. |
| Betting | nobody bets | skip or deal with no settlement (per config). |
| Engine | ba tiên | auto-win, beats any score. |
| Engine | score tie | break by suit rank (♦>♥>♣>♠); A♦ strongest. |
| Engine | bù (0) | lowest score, handled by normal comparison. |
| Engine | too many players | reject start if `3*n > 52`. |
| Network | host/cái drops | terminate (MVP) / migrate (P2). |
| Network | con drops | grace period; pre-close bets settle. |
| Network | replay/dup/out-of-order | seq + idempotency. |
| Network | malicious "I won" | ignored; host computes. |
| Network | TURN fails | explicit connect-error UI. |
| Network | clock skew | host-owned countdown. |
| Storage | IndexedDB unavailable | in-memory fallback. |
| Storage | stale session | validate; discard if rejected. |

---

## 14. Testing Strategy

| Level | Tool | Coverage |
| --- | --- | --- |
| Unit | Vitest | **Engine: scoring** (last-digit, J/Q/K=10, A=1, bù=0, cào=9), **ba tiên** detection & precedence, **suit-rank tie-break** (every suit pairing, A♦ supremacy), `compareHands` total ordering. Money/bonus rounding. Shuffle determinism. Deck-capacity guard. |
| Unit | Vitest | Settlement: Cào cái per-con settlement, Cào rùa single-winner pot, bonus multipliers. |
| Unit | Vitest | Protocol schema validation, idempotency, rate limiter. |
| Component | Testing Library | Bet entry (single amount), timer, lobby ready flow, reveal animation. |
| Integration | Vitest + mock PeerJS | Join/snapshot/delta reconciliation, reconnection, hidden-hand non-disclosure before reveal. |
| E2E | Playwright (multi-context) | Cái + cons full round; cái-also-plays; disconnect/reconnect; host-leave; tie-break display. |
| Fairness | Vitest | Commit–reveal verify (Phase 2): tampered deck or altered cái hand must fail verification. |

The engine must reach **100% branch coverage** of `compareHands` (ba tiên, score, suit tie-break) — this is the highest-risk logic.

---

## 15. Build & Deployment

### 15.1 GitHub Pages (project site)
- Vite `base` set to the repo path (e.g. `/beikao/`).
- React Router in **hash mode** (or a `404.html` SPA fallback) so deep links / refresh work on Pages.
- Share links use a query param: `https://<user>.github.io/beikao/?room=BAC-8249`.

### 15.2 GitHub Actions
```text
on push to main:
  install → typecheck → lint → vitest → build → deploy to gh-pages
```

### 15.3 Configuration / secrets
- TURN credentials must not be committed. Inject at build via Actions secrets into a runtime config, or use short-lived TURN credentials from a tiny credential endpoint (a serverless function) if security matters.
- A self-hosted PeerJS broker URL (if used) is a non-secret build-time env.

---

## 16. Performance & Limits

| Concern | Target / approach |
| --- | --- |
| Players | ≤ 16 (config cap; deck supports ≤17). |
| Host bandwidth | Snapshots are small JSON; broadcast one delta to all peers during play. Fine at 16 peers. |
| Message size | Send only public info during betting; reveal hands at result. |
| Reconnect window | 60s default. |
| History cap | last 50 rounds in memory/IndexedDB. |
| Animation budget | result hold ~4s; betting 15s default. |

---

## 17. Phasing (technical)

| Phase | Deliverables |
| --- | --- |
| **MVP** | CaoEngine (scoring + ba tiên + suit tie-break) + tests, Cào cái & Cào rùa settlement, PeerJS star transport + TURN, host-authoritative state machine, host-as-cái with strict separation, betting/timer/limits, chat, history, reconnection, graceful host-leave, vi/en UI, Pages deploy. |
| **Phase 2** | Provably-fair commit–reveal + verify UI, Cào thách (private challenges), rotating cái, bonus multipliers, spectator, reactions, replay, host migration. |
| **Phase 3** | ASP.NET Core + SignalR backend, PostgreSQL/Redis, accounts, leaderboard, tournaments, server RNG. |

---

## 18. Open Technical Decisions

1. **Provably-fair in MVP or Phase 2?** Affects how much commit–reveal plumbing is built up front. (GDD leans Phase 2; trust model for MVP.)
2. **Cái rotation in MVP or Phase 2?** Fixed cái is simpler; rotation needs careful authority-vs-cái separation.
3. **Self-host PeerJS broker vs. public cloud?** Reliability vs. setup cost.
4. **TURN provider** — self-hosted coturn vs. paid. The one real cost item.
5. **Router mode** — hash vs. `404.html` fallback on Pages.
6. **Table cap** — keep 8, or raise toward the 17-player rule limit (bandwidth/UI trade-off).
