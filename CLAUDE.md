# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Current state

The MVP is **implemented and green** — Vite + React + TS SPA with a fully-tested game engine, host-authoritative PeerJS networking, and the Home/Lobby/Game UI. `npm run build`, `npm run lint`, and `npm run test` (36 tests) all pass.

Design specs (keep consistent with each other and with the code):
- **`project_idea.md`** — pitch / overview / game primer.
- **`GDD.md`** — Game Design Document: gameplay source of truth (rules, economy, modes, UI, scope).
- **`TDD.md`** — Technical Design Document: implementation source of truth (architecture, protocol, engine API, fairness, phasing).
- **`README.md`** — quick start + scripts.

## Commands

```bash
npm run dev        # Vite dev server at /beikao/
npm run build      # tsc -b && vite build → dist/
npm run test       # vitest run (single run)
npm run typecheck  # tsc -b, no emit
npm run lint       # eslint
npx vitest run src/features/cao/hand.test.ts   # a single test file
```

## Code map

- **`src/features/cao/`** — the pure, deterministic, I/O-free **game engine** (cards, deck/shuffle, hand evaluation, `compareHands`, settlement). Start here; it's the most-tested and highest-risk code. Has co-located `*.test.ts`.
- **`src/features/room/`** — `authority.ts` (the host's `GameAuthority`: state machine + intention validation, the only place that mutates authoritative state) and `types.ts` (`RoomState` and friends).
- **`src/network/protocol/messages.ts`** — Zod schemas for client→host intentions + typed host→client messages. All inbound messages are validated here.
- **`src/app/session/`** — `hostSession.ts` / `clientSession.ts` wrap PeerJS. The host wires the authority to connections and to its own UI via **loopback**.
- **`src/app/store/store.ts`** — Zustand store; the bridge between React and the active session. UI never touches sessions directly.
- **`src/components/`, `src/pages/`** — UI. `RoomPage` renders `Lobby` or `GameTable` off `room.status`.

## What the project is

A multiplayer **Bài cào** game (Vietnamese 3-card gambling card game) — **not Baccarat** (an earlier discarded direction). It is a static React SPA deployed to GitHub Pages, using **host-authoritative peer-to-peer** networking over WebRTC (PeerJS). One player's browser is the authority; there is no dedicated game backend (though a signaling broker and a TURN relay are still required external services).

## Domain rules that are easy to get wrong

These are the highest-risk logic and the source of most subtle bugs. Implement exactly:

- **Score ("nút")** = last digit of the 3-card sum (`sum % 10`). Card points: A=1, 2–10 face value, **J/Q/K = 10**. Score **9 = "cào"** (best), **0 = "bù"** (worst).
- **"Ba tiên"** (a hand of three face cards J/Q/K) is an **automatic win that beats any numeric score** — handle it as a separate tier before comparing scores.
- **Tie-break on equal score is by SUIT rank, not card rank**: **♦ > ♥ > ♣ > ♠** (Diamond > Heart > Club > Spade), with **A♦ the single strongest card**. Compare each hand's strongest card, where suit dominates rank. With one deck two hands can never share a card, so suit ordering always produces exactly one winner (no true pushes).
- **Money is integer chip units everywhere** — never floats. Define rounding once (`floor`) for any bonus multipliers.
- **Deck capacity**: one 52-card deck. Validate `3 * playerCount <= 52` before dealing (supports the 2–16 player range; rules allow up to 17).

## Architecture invariants

The hardest part of this project is not the card logic — it's keeping the host honest while the host also plays. Preserve these:

- **The host IS the cái (dealer)** — a real participant who is dealt a hand everyone bets against, *and* the game authority. These are two roles in one process and must stay separate in code.
- **Authority/engine code must never branch on `isHost` / `isCai`.** The cái's hand is dealt from the same shuffled deck in the same seat order as everyone else; the host's bets/accounting go through the same validation/settlement path (via a loopback connection). The dealer must have no information or rules advantage beyond the structural house edge of being the cái.
- **Clients send intentions, never results.** A client says "bet 100"; the host computes the outcome. Never trust a client-reported win/score/balance.
- **Hidden hands are never sent to clients before the reveal step** — otherwise the cái (or a sniffing client) could see hands during betting.
- **The host owns time.** The betting deadline (`endsAt`) is host-controlled; client timestamps are advisory only and never used for timing.
- **Host = single point of failure.** MVP closes the room gracefully on host loss; host migration is a Phase-2 feature that voids+refunds any in-flight round.

## Networking reality (do not skip)

"No backend" does not mean "no servers." WebRTC requires a **signaling broker** (PeerJS cloud or self-hosted `peerjs-server`) and, for symmetric-NAT/mobile networks, a **TURN relay** (self-hosted coturn or a paid provider) — this is the one real cost item. Game messages use an **ordered + reliable** DataChannel; per-peer sequence numbers provide idempotency. Topology is a **star**: every con connects only to the host, which broadcasts one shared snapshot/delta to all peers.

## Toolchain & conventions

Stack in use: **React 18 + Vite + TypeScript (strict, incl. `noUncheckedIndexedAccess`)**, Tailwind, **Zustand**, **PeerJS**, **Zod** (validates all inbound messages), **Web Crypto** (`getRandomValues` for the shuffle seed — never `Math.random`). Tests: **Vitest** with co-located `*.test.ts`. The `@/` alias maps to `src/`. GitHub Pages: Vite `base` is `/beikao/` (override with `BASE_PATH`) and routing is **hash-mode**, so refreshes/deep-links work without a `404.html`.

When extending gameplay, change the engine + its tests first, then the authority, then the protocol/UI — and keep the GDD/TDD in sync.

## Phase 2 (built)

- **Provably-fair** (`features/room/fairness.ts`): host commits `SHA-256(hostSeed)` before betting (kept private until REVEAL); cons auto-send entropy seeds (`PLAYER_SEED`); final shuffle seed = `combineSeeds(hostSeed, conSeeds)` (`utils/crypto.ts`). Clients re-derive and verify the deck — `FairnessBadge`. The cái never contributes a seed (it knows the host seed). Round start (`beginRound`) is therefore **async** (awaits the digest) — guarded by a `starting` flag; tests must poll for `status === 'BETTING'`.
- **Reconnect after reload** (`utils/storage.ts`): session persisted in localStorage; `RoomPage` calls `tryReconnect()` on mount. Clients rejoin their seat; a host reload can't restore authority → goes home. Player name is remembered.
- **Room settings + bonuses**: `UPDATE_CONFIG` intention (host, LOBBY only); `SettingsModal`. Bonus multipliers flow through the engine's settlement.
- **Reactions + replay**: `REACTION` intention → `FloatingReactions`; `history` stores full `RoundView`s (cards + fairness) so `History`/replay can re-show and re-verify any past round.

## Not yet built (per TDD phasing)

Host migration, spectator mode, rotating cái, full vi/en i18n (UI is Vietnamese), and IndexedDB (session uses localStorage; history is in-memory/snapshot-restored). Cào rùa settlement works but its betting UI is minimal (Cào cái is the fully-driven mode).
