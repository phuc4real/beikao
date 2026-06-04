# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Current state

The MVP **plus Phase 2** is implemented and green. The backend has migrated **from Supabase to Cloudflare** — one **Worker** serves the SPA (Static Assets) **and** the API/WS same-origin, a per-room **Durable Object** (`RoomDO`) holds the `GameAuthority` + the WebSocket set + the betting-deadline alarm, and **D1** holds durable balances + the room directory. Both the earlier P2P/PeerJS layer and the Supabase backend have been **removed**. The app is a Vite + React + TS SPA with a fully-tested game engine, a single Cloudflare-backed `Session` (`CloudflareSession`), and the Home/Room UI (the waiting lobby and the game share **one table screen** — see Code map). `npm run build`, `npm run lint`, `npm run test` (54 tests), and `npm run cf:typecheck` all pass. Deploys go through **Cloudflare Workers Builds** (connected repo, production branch `release/worker`) — there is no GitHub Actions workflow. Backend setup/deploy: **`cloudflare/README.md`**; the design rationale: `cloudflare_migration_plan.md`.

**UI v2 ("Lacquer & Gold") is implemented** from the `design_handoff_beikao/` handoff per `beikao_ui_v2_plan.md` — a presentation-only refactor (engine/authority/protocol untouched): design tokens in `src/styles/theme.css` (mirrored in `tailwind.config.js`), Be Vietnam Pro / Playfair Display via `@fontsource`, card faces + three card backs (`src/components/cards/` — faces are simplified: corner indices + big centre rank/suit, courts framed; no pip grids; the `TableCard` flip is a **midpoint face-swap** — turn edge-on, swap the single rendered face, turn back — deliberately not a coplanar two-face `preserve-3d`/`backface-visibility` flip, which mis-renders on some GPU/display-scaling combos), elliptical felt table with arc seating (`src/components/table/`), result overlay, and client-only cosmetic prefs (`src/utils/prefs.ts`, localStorage). Vietnamese text must always render in Be Vietnam Pro (Playfair is for the Latin "BEIKAO" wordmark only); money displays use `vi-VN` grouping via `src/utils/money.ts`.

**Post-v2 table UX (all presentation-only):** the waiting **lobby is merged into `GameTable`** (`Lobby.tsx` deleted; `RoomPage` always renders the table, which branches on `room.status` — felt-centre room-code banner, seat ready-badges, invite pill, host-only ⚙ settings drawer toggle in LOBBY). Animation layer: chips fly to **my seat pot** on "Đặt cược" (`table/chipFlight.ts` — the shared centre `Pot` renders only in Cào rùa; in Cào cái each bettor's stake shows as a per-seat `BetPot` (`table/Seat.tsx`), with the local player's pinned to the felt's bottom edge), dealt cards fly from the felt centre card-by-card then flip (`TableCard flyIn` + `DEAL_STEP_MS`/`dealSpanMs` in `table/seatGeometry.ts` — `ResultOverlay` waits these out), additive quick-bet chips, chat popup bubbles + unread badge when the drawer is closed (`useChatPopups.ts`), HUD balance ±delta flash (**held during REVEAL** via `useDisplayedBalance` in `GameTable.tsx`: the HUD shows `balance − result.deltas[me]` until `revealSettleMs` — the same instant `ResultOverlay` appears — so the number, the flash, and the result land together and the flash always equals the round's delta; likewise the seat point-badges, win/lose card dressing, and the `MyHandBar` readout are held until each hand's last card has flipped — `useDelayedTrue` in `app/hooks.ts` + `seatFlipDelayMs`/`FLIP_MS` in `seatGeometry.ts` — so nothing spoils a hand that is still face-down). **Every animation/UX timing lives in one config — `src/config/animation.ts` (`ANIM`)** — which also publishes the CSS-coupled durations (deal flight, flip half-turn, balance flash, phase crossfade) as `--anim-*` custom properties via `applyAnimationVars()` in `main.tsx`, so the stylesheet stays in lockstep with the JS; **tune game pacing there, not in scattered literals/CSS.** These timings were originally long to mask Supabase's ~1s round trip; on Cloudflare the round trip is ~tens of ms, so they're now snappy.

> **History:** the project was host-authoritative P2P (WebRTC/PeerJS), then a Supabase backend (Postgres/Realtime/Edge Functions), now Cloudflare. The earlier backends are **gone from the code** — their build logs live in git history, `TDD.md §19` (Supabase) / `§20` (Cloudflare), and `cloudflare_migration_plan.md`. If you find a stale reference to Supabase/PeerJS in a comment, it's historical.

Design specs (keep consistent with each other and with the code):
- **`project_idea.md`** — pitch / overview / game primer.
- **`GDD.md`** — Game Design Document: gameplay source of truth (rules, economy, modes, UI, scope).
- **`TDD.md`** — Technical Design Document: implementation source of truth (architecture, protocol, engine API, fairness, phasing).
- **`README.md`** — quick start + scripts.

## Commands

```bash
npm run dev          # Vite + HMR; proxies /api (+ WS) → a Worker for UI iteration
npm run build        # tsc -b && vite build → dist/ (the SPA the Worker serves)
npm run test         # vitest run (single run)
npm run typecheck    # tsc -b, no emit
npm run lint         # eslint
npm run cf:dev       # Worker + Durable Objects + local D1, serving dist/ (the real backend)
npm run cf:typecheck # typecheck the Worker (cloudflare/) — separate from tsc -b
npm run cf:deploy    # wrangler deploy (usually done by Workers Builds, not by hand)
npx vitest run src/features/cao/hand.test.ts   # a single test file

# Local full-stack loop: run cf:dev (backend on :8788) AND dev (UI w/ HMR) together —
#   Vite proxies /api to WORKER_ORIGIN (default http://127.0.0.1:8788). The SPA is
#   same-origin (derives API/WS from window.location), so the proxy is how you point
#   it anywhere. Aim it at the live Worker instead:
#   WORKER_ORIGIN=https://beikao.<subdomain>.workers.dev npm run dev
# First time / after a D1 schema change: npx wrangler d1 migrations apply beikao --local
```

## Code map

- **`src/features/cao/`** — the pure, deterministic, I/O-free **game engine** (cards, deck/shuffle, hand evaluation, `compareHands`, settlement). Start here; it's the most-tested and highest-risk code. Has co-located `*.test.ts`.
- **`src/features/room/`** — `authority.ts` (`GameAuthority`: state machine + intention validation, the only place that mutates authoritative state — runs **server-side inside the `RoomDO`** (`cloudflare/src/roomDO.ts`), hydrated from DO storage) and `types.ts` (`RoomState` and friends).
- **`src/network/protocol/messages.ts`** — Zod schemas for client→server intentions + typed server→client messages. The same `intentionSchema` validates inbound messages in the `RoomDO`.
- **`src/network/cf/`** — `protocol.ts` (the WebSocket frame types shared by client + DO), `apiClient.ts` (same-origin fetch + the signed-token store), `auth.ts` (signed-token identity: `ensureIdentity`/`peekIdentity`), `rooms.ts` (discovery via `GET /api/rooms` + the `/api/lobby` change socket), `profile.ts` (durable wallet for the Home "Số dư" panel — `fetchWallet` + `claimTopup`/`claimDailyGift`). **Wallet top-up & daily gift** (`src/components/WalletPanel.tsx`): "Nạp chip" opens a rickroll modal and credits +2000; the daily gift credits +1000 once per VN-time day, claim-only. Both are Worker endpoints keyed to the **verified token uid** (`cloudflare/src/d1.ts`) — the client never writes a balance, preserving "clients send intentions, never results". Caveat: a top-up while seated in a live room is overwritten at that room's next settle, which is why the wallet taps live on the Home page only.
- **`src/app/session/`** — `types.ts` (the `Session` interface) and `cloudflareSession.ts` (the only implementation: one WebSocket to the `RoomDO`, intentions out / `STATE` in). The legacy PeerJS and Supabase sessions were removed.
- **`cloudflare/`** — the Worker + Durable Objects (`worker.ts` router, `roomDO.ts`, `lobbyDO.ts`, `auth.ts` token mint/verify, `d1.ts`, `stats.ts`, `migrations/`). The engine/authority/protocol are imported from `src/` **verbatim** (no bundle step — esbuild resolves `@/` via the root-tsconfig `paths`). See `cloudflare/README.md`.
- **`src/app/store/store.ts`** — Zustand store; the bridge between React and the active session. UI never touches the session directly.
- **`src/components/`, `src/pages/`** — UI. `RoomPage` always renders `GameTable`, which is the single screen for every `room.status`: in `LOBBY` (`room.round == null`) it renders the waiting state (felt banner, ready controls) and in `BETTING`/`REVEAL` the round UI — there is no separate `Lobby` component.

## What the project is

A multiplayer **Bài cào** game (Vietnamese 3-card gambling card game) — **not Baccarat** (an earlier discarded direction). It is a React SPA served by a **Cloudflare Worker** that also runs the server-authoritative backend: clients open a **WebSocket** to the room's **Durable Object**, which runs the `GameAuthority` and pushes state back; cross-room data lives in **D1**. The room creator is the **cái (dealer)** — a real participant, not the authority. (It originally used host-authoritative P2P over WebRTC/PeerJS, then a Supabase backend; both were removed.)

## Domain rules that are easy to get wrong

These are the highest-risk logic and the source of most subtle bugs. Implement exactly:

- **Score ("nút")** = last digit of the 3-card sum (`sum % 10`). Card points: A=1, 2–10 face value, **J/Q/K = 10**. Score **9 = "cào"** (best), **0 = "bù"** (worst).
- **"Ba tiên"** (a hand of three face cards J/Q/K) is an **automatic win that beats any numeric score** — handle it as a separate tier before comparing scores.
- **Tie-break on equal score is by SUIT rank, not card rank**: **♦ > ♥ > ♣ > ♠** (Diamond > Heart > Club > Spade), with **A♦ the single strongest card**. Compare each hand's strongest card, where suit dominates rank. With one deck two hands can never share a card, so suit ordering always produces exactly one winner (no true pushes).
- **Money is integer chip units everywhere** — never floats. Define rounding once (`floor`) for any bonus multipliers.
- **Deck capacity**: one 52-card deck. Validate `3 * playerCount <= 52` before dealing (supports the 2–16 player range; rules allow up to 17).

## Architecture invariants

The authority runs on the **server** — inside the room's **Durable Object** (`RoomDO`), which holds the warm `GameAuthority` in-isolate and persists `{state, secrets}` to DO storage on every commit. Preserve these:

- **The cái (dealer) is a real participant, not the authority.** The server holds the deck/RNG, so the dealer has no information or rules advantage beyond the structural house edge of being the cái.
- **Authority/engine code must never branch on `isHost` / `isCai`.** Every hand is dealt from the same shuffled deck in the same seat order; everyone's bets/accounting go through the same validation/settlement path.
- **Clients send intentions, never results.** A client says "bet 100"; the server computes the outcome. Never trust a client-reported win/score/balance. Wallet credits are keyed to the **verified token uid**, never a client-claimed id.
- **Hidden hands are never sent to clients before the reveal step** — the authority keeps them out of `RoomState` until REVEAL, and the deck seed lives in the DO's **private storage** (never broadcast, no table to expose).
- **The server owns time.** The betting deadline (`endsAt`) is server-controlled and closed by a **DO Alarm** set to `round.endsAt`; client timestamps are advisory only. (There is no longer a client `CLOSE_BETTING` failsafe — the alarm owns the deadline.)
- **No single point of failure.** State is durable in DO storage, so any client (incl. the cái) can drop and rejoin freely; an evicted DO rehydrates losslessly.

## Backend reality (do not skip)

All multiplayer is **one Cloudflare Worker** — no WebRTC/TURN, no signaling broker, no separate API origin. The browser opens a **WebSocket** to `/api/room/:code`, which the Worker routes to that room's **Durable Object**; the DO runs the authority and pushes `STATE` frames back. Cross-room durable data (profiles/balances + the room directory) is in **D1**. The Worker also serves the built SPA as **Static Assets** (same-origin, so no CORS and no `VITE_*` URL). The DO/Worker reuse the app's engine + authority **verbatim** by importing `src/` (no bundle step). Identity is a **Worker-minted signed token** (HMAC over `{uid}`, `AUTH_SIGNING_KEY` secret). Full setup/deploy in **`cloudflare/README.md`**; bindings in `wrangler.toml`.

## Toolchain & conventions

Stack in use: **React 18 + Vite + TypeScript (strict, incl. `noUncheckedIndexedAccess`)**, Tailwind, **Zustand**, **Cloudflare Workers + Durable Objects + D1** (via `wrangler`; `@cloudflare/workers-types`), **Zod** (validates all inbound messages, client- and server-side), **Web Crypto** (`getRandomValues` for the shuffle seed — never `Math.random`). Tests: **Vitest** with co-located `*.test.ts`. The `@/` alias maps to `src/` (the root `tsconfig.json` `paths` exist so esbuild resolves it when wrangler bundles the Worker). Vite `base` is `/` (the Worker serves at the domain root); routing is **hash-mode** (history mode is an optional follow-up now that the Worker can SPA-fallback).

When extending gameplay, change the engine + its tests first, then the authority, then the protocol/UI — and keep the GDD/TDD in sync.

**Test gotcha:** the default test environment is jsdom, but any test that touches `crypto.subtle` (the provably-fair digest, e.g. `fairness.test.ts` and `authority.test.ts` whose `beginRound` awaits it) must start with `// @vitest-environment node`. jsdom's realm `ArrayBuffer`/`TypedArray` fails Node's cross-realm check in `crypto.subtle.digest` (passes on Node 22, throws on Node 20/CI). Because that digest makes round start **async**, drive rounds in tests by polling for `status === 'BETTING'`, not a fixed `setTimeout` flush.

## Notable features (built & current)

The still-true big picture (deeper history in git, `TDD.md`, `cloudflare/README.md`):

- **Provably-fair deck** (`features/room/fairness.ts`, `utils/crypto.ts`): before betting the authority commits `SHA-256(hostSeed)` (private until REVEAL); cons auto-send entropy seeds (`PLAYER_SEED`); the final shuffle seed = `combineSeeds(hostSeed, conSeeds)`. Clients re-derive + verify the deck (`FairnessBadge`). The cái contributes no seed (it knows the host seed). This is why `beginRound` is **async** (awaits the digest) — see the test gotcha above.
- **Reconnect after reload** (`utils/storage.ts`): the session is persisted in localStorage and `RoomPage` calls `tryReconnect()` on mount. Because room state is durable in the DO, anyone (incl. the cái) rejoins via a normal **idempotent JOIN** that re-seats by playerId; `CloudflareSession` also auto-reconnects (backoff + re-HELLO) on a dropped socket.
- **Reactions** are ephemeral: the client sends a `REACTION` WS frame, the `RoomDO` relays it to **all** sockets (incl. the sender — so the client does *not* self-echo), and it never touches the authority/state, so it's never persisted/replayed. Palette-checked (`REACTIONS`) on both ends → a transient, capped `reactions[]` feed → `FloatingReactions`.
- **Spectators + seat↔spectator switching**: join as `spectator` (explicit, or auto when full; tracked in `RoomState.spectators`, no seat/balance). `BECOME_SPECTATOR`/`BECOME_PLAYER` swap between rounds only (the authority rejects mid-BETTING; never the cái); a fresh seat is `ready=false` with its balance overridden from the durable profile. `selectIsSpectator` drives the read-only UI.
- **Host/cái migration on leave**: a permanent in-app leave (`GameAuthority.leave`, vs `disconnect` which keeps the seat for reload) frees the seat; if the leaver was the cái the next connected player inherits **host + cái** (+ a system chat line), and a mid-BETTING round is aborted to LOBBY (safe — chips only move at settlement). The `RoomDO` deletes the room (storage + D1 directory row) when the last seat leaves, or after an empty grace.
- **Durable wallet** (`profiles` in D1): chips follow the player across rooms — seeded from the profile on create/JOIN, written back on settle. Home-only **top-up** (+2000, rickroll modal) and once-per-VN-day **gift** (+1000), keyed to the verified token uid (`cloudflare/src/d1.ts`).
- **Room settings + bonuses**: `UPDATE_CONFIG` (cái-only, accepted in any status **except BETTING**; `SettingsModal` + table `AnteControl`). Two modes — **Cào rùa** (equal-ante shared pot) and **Cào cái** (each con bets against the cái). Bonus multipliers (ba tiên / cào) flow through the engine's settlement.
- **IndexedDB history** (`features/history/db.ts`, via `idb`): completed rounds persist per room and merge with the live snapshot history in `HistoryPanel` (survives reload, accumulates past the in-memory cap). `history` stores full `RoundView`s (cards + fairness) so any past round can be re-shown and re-verified.
- **Reveal drama**: the cái's cards flip **last**, and result readouts (point badges, win/lose dressing, the `MyHandBar` readout, the `ResultOverlay`, the held HUD balance) are gated until each hand's flip completes — see the animation hooks in *Current state* above.

## Not yet built

Rotating cái (round-robin dealer per round), full vi/en i18n (UI is Vietnamese), an email/OAuth identity upgrade (the signed-token scheme in `cloudflare/src/auth.ts` is intentionally upgrade-ready), and the custom-domain cutover (still on the `workers.dev` host; uncomment `[routes]` in `wrangler.toml`).
