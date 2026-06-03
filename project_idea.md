# Multiplayer Bài Cào Game (GitHub Pages + WebRTC)

> **Game:** *Bài cào* (also *Cào* / "three-card") — a fast Vietnamese gambling card game.
> Rules: https://vi.wikipedia.org/wiki/Bài_cào
> See also: [GDD.md](./GDD.md) (game design) · [TDD.md](./TDD.md) (technical design).

## Overview

A lightweight multiplayer **Bài cào** game that can be deployed entirely on GitHub Pages without managing a dedicated backend server.

Each player is dealt **3 cards**, scores the **last digit** of their card total (the best score, 9, is called **"cào"**), and the highest hand wins. It's pure chance, fast, and social.

The application uses WebRTC (PeerJS) for peer-to-peer communication and follows a **host-authoritative** architecture. One player creates a room and acts as the game authority. Naturally, that host is also the **cái (dealer)** — a real player everyone else bets against — so "the host plays too" is built into the rules of the game.

> **Important caveat — "no backend" is not literally true.** PeerJS still requires a **signaling/broker server** to exchange connection metadata (SDP/ICE), and many real-world networks (symmetric NAT, mobile carriers, corporate firewalls) require a **TURN relay server** to connect. See [Networking Reality Check](#networking-reality-check).

---

# Goals

## Functional Requirements

* Create room
* Join room using room code
* Support 2–16 players (the host plays as the **cái**); traditional Bài cào allows up to 17
* Bài cào game logic: 3-card deal, last-digit scoring, special hands, suit tie-breaks
* Real-time betting with a betting timer
* Dealer (**Cào cái**) and pot (**Cào rùa**) modes
* Chat system
* Ready / unready state
* Round history
* Reconnection support
* Graceful handling of host disconnect (room close, or host migration in Phase 2)

## Non-Functional Requirements

* Deployable on GitHub Pages (static SPA)
* No *dedicated game* backend (signaling + TURN are still external services)
* Near-zero hosting cost
* Mobile-friendly, Vietnamese-first responsive UI
* Easy to maintain
* Deterministic, verifiable round outcomes (provably fair)

---

# What is Bài Cào?

A banked, no-decision card game (no draws/discards — you just bet, then cards are dealt):

* **Deck:** standard 52 cards. **3 cards** per player. One dealer (**cái**) deals to everyone.
* **Card values:** A = 1, 2–10 face value, **J/Q/K = 10**.
* **Score (nút):** the **last digit** of the 3-card sum (`sum mod 10`). **9 = "cào"** (best), **0 = "bù"** (bust, worst).
* **Special hand:** **"ba tiên" / "ba cào"** = three face cards (J/Q/K) — **auto-win**, beats any score.
* **Tie-break:** equal scores are decided by **suit rank ♦ > ♥ > ♣ > ♠**; the **A♦** is the strongest card.
* **Variants:** **Cào cái** (bet against the dealer), **Cào rùa** (equal ante, highest hand takes the pot), **Cào thách** (private head-to-head challenges).

---

# Architecture

```text
                    GitHub Pages (static SPA)
                         │
                         ▼
                 React + Vite SPA
                         │
         ┌───────────────┼───────────────┐
         │               │               │
         ▼               ▼               ▼
      PeerJS         Zustand          IndexedDB
    (WebRTC)      State Store        Local Cache
         │
         ▼
   External signaling (PeerJS broker) + TURN relay
         │
         ▼
              Host Player = CÁI (Dealer)
            (Room Authority + Participant)
                         │
        ┌───────────┬───────────┬───────────┐
        ▼           ▼           ▼           ▼
      Con B       Con C       Con D       Con E
```

The host runs **two logical roles in one process**:

1. **Authority** — owns the deck, RNG, bet validation, settlement, and state broadcast.
2. **Participant (cái)** — has a seat, a balance, and is dealt a 3-card hand that every *con* (player) compares against.

These roles must be kept strictly separated in code so the cái's hand is dealt from the same shuffled deck as everyone else and the authority logic never treats the host's own seat specially.

---

# Technology Stack

| Layer            | Technology     |
| ---------------- | -------------- |
| Frontend         | React + Vite   |
| Styling          | Tailwind CSS   |
| State Management | Zustand        |
| Multiplayer      | PeerJS         |
| Persistence      | IndexedDB      |
| Deployment       | GitHub Pages   |
| CI/CD            | GitHub Actions |
| Crypto (fairness)| Web Crypto API |

---

# Room Lifecycle

## Create Room

1. Host opens the game and enters a display name → becomes the **cái**.
2. Generate a room code (collision-checked).
3. Start PeerJS host connection; register host as the dealer seat.
4. Display invitation code and a shareable join link (`?room=BAC-8249`).

## Join Room

1. Player enters room code (or opens the share link).
2. Connect to host (cái) via PeerJS.
3. Host validates: room exists, not full, state allows joining, name unique.
4. Receive current authoritative snapshot.
5. Enter lobby as a **con**.

## Room States

```text
LOBBY → BETTING → DEALING → REVEAL → SETTLE → (LOBBY | BETTING)
                                                    │
                                                    ▼
                                                 CLOSED
```

---

# Networking Reality Check

| Concern | Reality | Mitigation |
| --- | --- | --- |
| Signaling | PeerJS needs a broker to negotiate connections. | Public PeerJS cloud for MVP; self-host `peerjs-server` for reliability. |
| NAT traversal | STUN alone fails on symmetric NAT (common on mobile). | Configure a **TURN server** (self-hosted coturn or paid). |
| Topology | Star: every con connects only to the cái/host. | Host bandwidth scales with player count; fine for ≤16. |
| Host = single point of failure | If the cái drops, the room dies. | Room close (MVP) or host migration (Phase 2). |
| Message reliability | WebRTC data channels can be ordered/reliable. | Use **ordered + reliable**; sequence numbers as backup. |

---

# Game Engine (summary)

```text
CaoEngine
├── createDeck()                 // 52 cards
├── shuffle(seed)                // deterministic from combined seed
├── deal(playerIds)              // 3 cards each (3 * n ≤ 52)
├── handScore(cards)             // sum mod 10  → 0..9 (bù..cào)
├── isBaTien(cards)              // three J/Q/K → auto-win
├── compareHands(a, b)           // ba tiên > score > suit tie-break
└── settle(bets, hands, mode)    // Cào cái per-con, or Cào rùa pot
```

Unlike Baccarat, there are **no card-drawing rules** — a hand is exactly 3 dealt cards. The tricky logic is the **ba tiên** special case and the **suit-rank tie-break** (♦>♥>♣>♠, A♦ supreme).

Example result:

```json
{
  "winnerVsCai": { "con-1": "WIN", "con-2": "LOSE" },
  "hands": {
    "cai":   { "cards": ["KD","QH","9S"], "score": 9 },
    "con-1": { "cards": ["JD","QC","KH"], "baTien": true },
    "con-2": { "cards": ["5C","5H","7D"], "score": 7 }
  }
}
```

---

# Fairness & Anti-Cheat

Because the host is the **cái** (deals *and* plays), naive host authority lets the dealer cheat. Two layers address this.

## Layer 1 — Strict authority/cái separation (always on)

* The cái's 3 cards are dealt from the **same shuffled deck** as everyone else — no self-dealing advantage.
* Con bets go through the **same validation and settlement path**; authority code never branches on `isHost`/`isCai`.
* Hidden hands are never sent to clients before the reveal step (the cái can't peek during betting).
* Never trust client-reported results — clients send *intentions* ("bet 100"), the host computes outcomes.

## Layer 2 — Provably fair shuffle (commit–reveal, Phase 2)

1. **Commit:** before betting, the host shuffles deterministically from a secret `hostSeed` and broadcasts only `SHA-256(hostSeed)`.
2. **Contribute:** each player submits a seed hash during betting, revealed after it closes.
3. **Reveal:** `finalSeed = hash(hostSeed ‖ all playerSeeds)` — no single party controls the deal.
4. **Verify:** every client recomputes the shuffle (including the cái's hand) and confirms it matches the commitment. Mismatch ⇒ flag the host.

Use `crypto.getRandomValues` (RNG) and `crypto.subtle.digest` (hashing). Avoid `Math.random()`.

> **MVP trade-off:** for casual play among friends, Layer 1 + a stated trust model is enough; ship Layer 2 later.

---

# Reconnection

Store locally: Player ID, Session ID, Room ID, Player Name, last state version.

* On disconnect the host holds the seat + balance for a grace period (e.g. 60s).
* A bet placed before betting closed **still settles** if the player drops (no escaping a loss).
* If the **cái** drops → room closes (MVP) or migrates (Phase 2).

---

# User Interface

## Home

```text
        BÀI CÀO
   [ Tạo phòng / Create Room ]
   [ Vào phòng / Join Room  ]
```

## Lobby

```text
Phòng: BAC-8249        Cái: Alex
 ★ Alex     $1000  ✓   (cái — plays too)
   Bình     $1000  ✓
   Châu     $1000  …
 [ Sẵn sàng ]   [ Chia bài ] (cái, ≥1 con ready)
```

## Game

```text
Ván 12               Đặt cược: 0:08
 CÁI (Alex)   [🂠][🂠][🂠]
 Bình  [🂠][🂠][🂠]  $100
 Bạn   [🂠][🂠][🂠]  $50
 Đặt cược: [- 50 +]  [ Xác nhận ]  [ Xoá ]
```

---

# Future Enhancements

## Phase 2

* Provably-fair verification (commit–reveal)
* **Cào thách** (private head-to-head challenges)
* **Rotating cái** (dealer passes around the table)
* Bonus multipliers for **ba tiên** / **cào**
* Spectator mode, emoji reactions, replay
* Host migration

## Phase 3 — dedicated backend

* ASP.NET Core + SignalR + PostgreSQL + Redis
* Server-side RNG (removes host-cheating entirely)
* Tournaments, global leaderboard, authentication, persistent accounts

---

# Recommended MVP

## Version 1.0

* React + Vite, Tailwind CSS, Zustand
* PeerJS over WebRTC (public broker + a TURN server configured)
* Host-authoritative architecture with **strict authority/cái separation** (host plays as dealer)
* 2–16 players including the host/cái
* Full Bài cào rules: 3-card deal, last-digit scoring, ba tiên auto-win, suit tie-break, integer-money settlement
* Cào cái + Cào rùa modes
* Betting timer, bet validation, balance management
* Chat, round history
* Reconnection with seat grace period
* Graceful room termination on host loss
* Vietnamese-first (vi/en) UI
* GitHub Pages deployment

**Defer to later:** provably-fair commit–reveal, rotating cái, Cào thách, host migration, spectator, replay.

Goal: Build a fully playable multiplayer Bài cào game — where the host is the cái and plays too — with near-zero infrastructure cost, while learning WebRTC, state synchronization, real-time multiplayer architecture, and fair P2P game design.
