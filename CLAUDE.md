# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Current state

The MVP **plus Phase 2** is implemented and green, and **Phase 3 completed the migration to a server-authoritative Supabase backend** — the P2P/PeerJS networking layer has been **removed** (only comments and the historical Phase 3 notes below still mention it). The app is a Vite + React + TS SPA with a fully-tested game engine, a single Supabase-backed `Session`, and the Home/Room UI (the waiting lobby and the game share **one table screen** — see Code map). `npm run build`, `npm run lint`, and `npm run test` (47 tests) all pass; CI (`.github/workflows/deploy.yml`, Node 22) **requires** the `VITE_SUPABASE_URL`/`VITE_SUPABASE_ANON_KEY` secrets (it fails fast if they're empty), runs typecheck + lint + test + build, then deploys to Pages. See the Phase 3 section below and `supabase/README.md`.

**UI v2 ("Lacquer & Gold") is implemented** from the `design_handoff_beikao/` handoff per `beikao_ui_v2_plan.md` — a presentation-only refactor (engine/authority/protocol untouched): design tokens in `src/styles/theme.css` (mirrored in `tailwind.config.js`), Be Vietnam Pro / Playfair Display via `@fontsource`, card faces + three card backs (`src/components/cards/` — faces are simplified: corner indices + big centre rank/suit, courts framed; no pip grids; the `TableCard` flip is a **midpoint face-swap** — turn edge-on, swap the single rendered face, turn back — deliberately not a coplanar two-face `preserve-3d`/`backface-visibility` flip, which mis-renders on some GPU/display-scaling combos), elliptical felt table with arc seating (`src/components/table/`), result overlay, and client-only cosmetic prefs (`src/utils/prefs.ts`, localStorage). Vietnamese text must always render in Be Vietnam Pro (Playfair is for the Latin "BEIKAO" wordmark only); money displays use `vi-VN` grouping via `src/utils/money.ts`.

**Post-v2 table UX (all presentation-only):** the waiting **lobby is merged into `GameTable`** (`Lobby.tsx` deleted; `RoomPage` always renders the table, which branches on `room.status` — felt-centre room-code banner, seat ready-badges, invite pill, host-only ⚙ settings drawer toggle in LOBBY). Animation layer: chips fly to **my seat pot** on "Đặt cược" (`table/chipFlight.ts` — the shared centre `Pot` renders only in Cào rùa; in Cào cái each bettor's stake shows as a per-seat `BetPot` (`table/Seat.tsx`), with the local player's pinned to the felt's bottom edge), dealt cards fly from the felt centre card-by-card then flip (`TableCard flyIn` + `DEAL_STEP_MS`/`dealSpanMs` in `table/seatGeometry.ts` — `ResultOverlay` waits these out), additive quick-bet chips, chat popup bubbles + unread badge when the drawer is closed (`useChatPopups.ts`), HUD balance ±delta flash (**held during REVEAL** via `useDisplayedBalance` in `GameTable.tsx`: the HUD shows `balance − result.deltas[me]` until `revealSettleMs` — the same instant `ResultOverlay` appears — so the number, the flash, and the result land together and the flash always equals the round's delta; likewise the seat point-badges, win/lose card dressing, and the `MyHandBar` readout are held until each hand's last card has flipped — `useDelayedTrue` in `app/hooks.ts` + `seatFlipDelayMs`/`FLIP_MS` in `seatGeometry.ts` — so nothing spoils a hand that is still face-down). These animations deliberately mask the ~1s `intent` round trip.

> **Note on the Phase 3 section below:** it is kept as a build log. Where it describes P2P as "still the default", a `VITE_BACKEND` flag, or a `backend.ts` seam, that is **stale** — Supabase is the only backend now and those flags/files no longer exist. The "Code map", "Backend reality", and "Architecture invariants" sections above are the current source of truth.

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
- **`src/features/room/`** — `authority.ts` (`GameAuthority`: state machine + intention validation, the only place that mutates authoritative state — runs **server-side** in the `intent` Edge Function, hydrated per request) and `types.ts` (`RoomState` and friends).
- **`src/network/protocol/messages.ts`** — Zod schemas for client→server intentions + typed server→client messages. The same `intentionSchema` validates inbound messages in the Edge Function.
- **`src/app/session/`** — `types.ts` (the `Session` interface) and `supabaseSession.ts` (the only implementation: Realtime in, `intent` Edge Function RPC out). The legacy PeerJS host/client sessions were removed.
- **`src/network/supabase/`** — `client.ts` (the Supabase client), `auth.ts` (anonymous-auth identity), `rooms.ts` (discovery), `profile.ts` (durable wallet for the Home "Số dư" panel — balance + `claim_topup`/`claim_daily_gift` RPC wrappers; the leaderboard UI was removed — migration `0010` dropped its view, but `record_round_result`/`profiles` stay: they power durable balances). **Wallet top-up & daily gift** (`src/components/WalletPanel.tsx`, migration `0011`): "Nạp chip" opens a rickroll modal and credits +2000; the daily gift credits +1000 once per VN-time day, claim-only. Both are SQL RPCs keyed to `auth.uid()` (SECURITY DEFINER, execute revoked from anon) — the client never writes a balance, preserving the "clients send intentions, never results" invariant. Caveat: a top-up while seated in a live room is overwritten at that room's next settle (`record_round_result` writes the post-settle seat balance back), which is why the wallet taps live on the Home page only.
- **`src/app/store/store.ts`** — Zustand store; the bridge between React and the active session. UI never touches the session directly.
- **`src/components/`, `src/pages/`** — UI. `RoomPage` always renders `GameTable`, which is the single screen for every `room.status`: in `LOBBY` (`room.round == null`) it renders the waiting state (felt banner, ready controls) and in `BETTING`/`REVEAL` the round UI — there is no separate `Lobby` component.

## What the project is

A multiplayer **Bài cào** game (Vietnamese 3-card gambling card game) — **not Baccarat** (an earlier discarded direction). It is a static React SPA deployed to GitHub Pages, backed by **Supabase** (server-authoritative): clients read room state over **Realtime** and send intentions to **Edge Functions** that run the `GameAuthority`. The room creator is the **cái (dealer)** — a real participant, no longer the authority. (It originally used host-authoritative P2P over WebRTC/PeerJS; that layer was removed — see Phase 3 below.)

## Domain rules that are easy to get wrong

These are the highest-risk logic and the source of most subtle bugs. Implement exactly:

- **Score ("nút")** = last digit of the 3-card sum (`sum % 10`). Card points: A=1, 2–10 face value, **J/Q/K = 10**. Score **9 = "cào"** (best), **0 = "bù"** (worst).
- **"Ba tiên"** (a hand of three face cards J/Q/K) is an **automatic win that beats any numeric score** — handle it as a separate tier before comparing scores.
- **Tie-break on equal score is by SUIT rank, not card rank**: **♦ > ♥ > ♣ > ♠** (Diamond > Heart > Club > Spade), with **A♦ the single strongest card**. Compare each hand's strongest card, where suit dominates rank. With one deck two hands can never share a card, so suit ordering always produces exactly one winner (no true pushes).
- **Money is integer chip units everywhere** — never floats. Define rounding once (`floor`) for any bonus multipliers.
- **Deck capacity**: one 52-card deck. Validate `3 * playerCount <= 52` before dealing (supports the 2–16 player range; rules allow up to 17).

## Architecture invariants

The authority runs on the **server** (the `intent` Edge Function, hydrating `GameAuthority` per request). Preserve these:

- **The cái (dealer) is a real participant, not the authority.** The server holds the deck/RNG, so the dealer has no information or rules advantage beyond the structural house edge of being the cái.
- **Authority/engine code must never branch on `isHost` / `isCai`.** Every hand is dealt from the same shuffled deck in the same seat order; everyone's bets/accounting go through the same validation/settlement path.
- **Clients send intentions, never results.** A client says "bet 100"; the server computes the outcome. Never trust a client-reported win/score/balance.
- **Hidden hands are never sent to clients before the reveal step** — the authority keeps them out of `RoomState` until REVEAL, and the deck seed lives in `room_secrets` (never published, never anon-readable).
- **The server owns time.** The betting deadline (`endsAt`) is server-controlled and closed by the `tick` cron (scheduled every 10 s by migration `0009_schedule_tick.sql` — without it the countdown expires and nothing happens); client timestamps are advisory only. The cái's client additionally fires `CLOSE_BETTING` the moment its countdown expires (failsafe in `GameTable`) — server-validated, so it grants no authority.
- **No single point of failure.** State is durable in Postgres, so any client (incl. the cái) can drop and rejoin freely.

## Backend reality (do not skip)

All multiplayer is **Supabase** — no WebRTC/TURN, no signaling broker. Clients read room state via **Realtime** (Postgres changes on the room's row) and send intentions to **Edge Functions** (`intent`, `tick`) running with the service-role key. The Edge Functions reuse the app's engine + authority **verbatim** via `npm run build:functions` (esbuild → `supabase/functions/_shared/engine.bundle.js`). The app **requires** `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` to function. Full setup/deploy in `supabase/README.md`.

## Toolchain & conventions

Stack in use: **React 18 + Vite + TypeScript (strict, incl. `noUncheckedIndexedAccess`)**, Tailwind, **Zustand**, **`@supabase/supabase-js`** (Realtime + Auth + Edge Function RPC), **Zod** (validates all inbound messages, client- and server-side), **Web Crypto** (`getRandomValues` for the shuffle seed — never `Math.random`). Tests: **Vitest** with co-located `*.test.ts`. The `@/` alias maps to `src/`. GitHub Pages: Vite `base` is `/beikao/` (override with `BASE_PATH`) and routing is **hash-mode**, so refreshes/deep-links work without a `404.html`.

When extending gameplay, change the engine + its tests first, then the authority, then the protocol/UI — and keep the GDD/TDD in sync.

**Test gotcha:** the default test environment is jsdom, but any test that touches `crypto.subtle` (the provably-fair digest, e.g. `fairness.test.ts` and `authority.test.ts` whose `beginRound` awaits it) must start with `// @vitest-environment node`. jsdom's realm `ArrayBuffer`/`TypedArray` fails Node's cross-realm check in `crypto.subtle.digest` (passes on Node 22, throws on Node 20/CI). Because that digest makes round start **async**, drive rounds in tests by polling for `status === 'BETTING'`, not a fixed `setTimeout` flush.

## Phase 2 (built)

- **Provably-fair** (`features/room/fairness.ts`): host commits `SHA-256(hostSeed)` before betting (kept private until REVEAL); cons auto-send entropy seeds (`PLAYER_SEED`); final shuffle seed = `combineSeeds(hostSeed, conSeeds)` (`utils/crypto.ts`). Clients re-derive and verify the deck — `FairnessBadge`. The cái never contributes a seed (it knows the host seed). Round start (`beginRound`) is therefore **async** (awaits the digest) — guarded by a `starting` flag; tests must poll for `status === 'BETTING'`.
- **Reconnect after reload** (`utils/storage.ts`): session persisted in localStorage; `RoomPage` calls `tryReconnect()` on mount. Clients rejoin their seat; a host reload can't restore authority → goes home. Player name is remembered.
- **Room settings + bonuses**: `UPDATE_CONFIG` intention (host, LOBBY only); `SettingsModal`. Bonus multipliers flow through the engine's settlement.
- **Reactions + replay**: reactions are **ephemeral** and ride Supabase Realtime **broadcast** (peer→peer over the open socket) — they do *not* go through the `intent` Edge Function or `rooms.state`, so they're never persisted/replayed. `SupabaseSession.sendReaction` palette-checks (the `REACTIONS` list) and echoes locally; inbound broadcasts are re-validated on receipt and fed to a transient, capped `reactions[]` feed in the store → `FloatingReactions`. (There is intentionally no `REACTION` intention or authority handling.) `history` stores full `RoundView`s (cards + fairness) so `History`/replay can re-show and re-verify any past round.
- **Spectator mode**: join with `spectator` (explicit toggle, or auto when the room is full); spectators are tracked in `RoomState.spectators` (no seat/balance), can chat/react but not bet/ready. `selectIsSpectator` drives the read-only UI. **Seat ↔ spectator switching** (post-Phase-3): `BECOME_SPECTATOR`/`BECOME_PLAYER` intentions let a con step back to watch and a spectator take a free seat — only in LOBBY/REVEAL (the authority rejects mid-BETTING switches), never the cái; a fresh seat is seeded `ready=false` and the server overrides its balance from the durable profile (same path as JOIN).
- **IndexedDB history** (`features/history/db.ts`, via `idb`): completed rounds persisted per room and merged with live snapshot history in `HistoryPanel` (survives reload, accumulates past the in-memory cap). Degrades to live-only if storage is unavailable.
- **Reveal drama**: the cái's cards flip *last* (`flipDelayMs` places its base after every con) in both the table seats and the big `MyHand`.

## Not yet built (per TDD phasing)

Rotating cái (round-robin dealer per round) and full vi/en i18n (UI is Vietnamese). Session persistence uses localStorage (only round history uses IndexedDB).

**Built since:**
- **Host migration on leave**: a permanent in-app leave calls `GameAuthority.leave()` (vs `disconnect()`, which keeps the seat for reload-reconnect) — the seat is freed, any live stake dropped, and if the leaver was the cái the next *connected* player inherits **host + cái** (`hostId`/`caiId`/`isCai`/`ready`, plus a system chat line). A mid-BETTING round whose cái left is aborted back to LOBBY (safe: chips only move at settlement). The room is deleted only when the last seat empties (`intent` leave op: `players.length === 0 && permanent`); a tab-close beacon still only marks disconnected. `writeRoomOnly` keeps the denormalized `rooms.host_id`/`cai_id` columns in step.
- **Cào rùa table ante control** (`src/components/table/AnteControl.tsx`): the cái sets the shared per-player ante (= `config.minBet`) directly on the table in LOBBY and REVEAL — no settings drawer. It rides the existing `UPDATE_CONFIG` intention; the authority now accepts UPDATE_CONFIG in **any status except BETTING** (config only takes effect at the next `beginRound`). Cào cái remains the fully-driven betting mode.

## Phase 3 (3a–3e built): Supabase backend migration

See **`TDD.md §19`** and **`supabase/README.md`**. Moving from host-authoritative P2P to a **server-authoritative Supabase backend** as a *migration, not a rewrite*.

**Already implemented** (this section originally read "behind a flag — P2P is still the default"; that is no longer true — the migration is complete and Supabase is the only backend):
- `GameAuthority` is now **hydratable**: `new GameAuthority({ snapshot, secrets, useTimers:false })` resumes a persisted room and runs statelessly (no `setTimeout`); `getSecrets()` exposes the private deal state; `tickDeadline(now)` closes betting from a cron. The fresh-construction path is unchanged (all 43 tests still green).
- `supabase/` — SQL migration (`rooms` + `room_secrets` + `room_directory` view, RLS, realtime publication), `config.toml`, and Edge Functions `intent` (the authority — hydrate→submit→persist) + `tick` (deadline closer). The functions **reuse `src/` verbatim** via a Deno import map (`functions/deno.json`); they are linted/typechecked by the Supabase CLI, NOT this app's eslint/tsc (`supabase/` is in `.eslintrc` ignore + outside `tsconfig` include).
- Client seam: `src/network/supabase/client.ts` + `src/app/session/supabaseSession.ts` (the `Session` impl — Realtime in, `intent` RPC out), store wired to it. (The historical `backend.ts` selector file no longer exists — there's nothing to select now that P2P is gone.) Persisted state means a **host can rejoin after reload** under Supabase.
- Engine bundling: Edge Functions reuse `src/` verbatim via `npm run build:functions` (esbuild → `supabase/functions/_shared/engine.bundle.js`); they import `npm:@supabase/supabase-js@2`. Re-run `build:functions` after any engine/authority/protocol change.
- **Active room discovery (3d):** `src/network/supabase/rooms.ts` (queries the `room_directory` view + Realtime subscribe), `src/components/RoomBrowser.tsx`, and a "Tìm phòng" tab on `HomePage` shown only in Supabase mode. `createRoom(name, config, isPublic)` carries the public/private toggle.
- **Room lifecycle (cleanup):** the directory only lists rooms with `player_count > 0`. In-app leave is *permanent* (deletes the room if last out); tab-close sends a `keepalive` non-permanent leave (marks disconnected → room empties/hides, but survives for reload-reconnect). `tick` reaps rooms whose `empty_since` is older than ~30 s, and sweeps dead rooms (stale `updated_at`). See `migrations/0002_room_cleanup.sql`.
- **Presence (3c):** clients track Realtime Presence (key = playerId); the lowest-present-id "reporter" pushes the present set to the `sync_presence` op, which calls `GameAuthority.reconcilePresence(present)` to set every seat's `connected`. The reporter also heartbeats (~25 s) so a stale `updated_at` reliably means a dead room. The `pagehide` keepalive leave remains the instant clean-close path.
- **Stats + leaderboard (3d):** `migrations/0003_profiles_leaderboard.sql` (`profiles` + `leaderboard` view + service-role-only `record_round_result` RPC). The server records each settled round's per-player net+balance via `_shared/stats.ts` (called from `intent` CLOSE_BETTING and `tick` deadline-close). Client: ~~`leaderboard.ts` + `Leaderboard.tsx` on `HomePage`~~ — the leaderboard UI was **since removed** (lighter app; migration `0010` dropped the view); the server-side stats/balance recording remains.
- **Auth identity (3d):** `src/network/supabase/auth.ts` — in Supabase mode the player id is an **anonymous Supabase Auth uid** (persisted session → stable across reloads, upgradeable to email/OAuth later); `ensureIdentity()` is awaited in `store.createRoom/joinRoom`. P2P still uses the localStorage id. Requires "Anonymous sign-ins" enabled in the Supabase dashboard.
- **Durable balances (3d):** `migrations/0004_durable_balances.sql` adds `profiles.balance` + `get_or_create_profile` RPC. On create/JOIN the server seeds the seat's balance from the profile (`GameAuthority.setBalance`); on settle, `record_round_result` writes the post-settle balance back — so chips follow the player across rooms (new players are granted the room's `startingBalance`).
- **Backend default (3e), since superseded:** this step originally made Supabase the default while *keeping* PeerJS/TURN as a fallback (`ACTIVE_BACKEND`/`VITE_BACKEND`). That fallback has since been **removed entirely** — there is no `peerjs` dependency, no `VITE_BACKEND` flag, and no host/client P2P session. Supabase is mandatory: CI now **hard-fails** if `VITE_SUPABASE_URL`/`VITE_SUPABASE_ANON_KEY` are empty (see the "Verify Supabase secrets are present" CI step), and the app cannot create/join rooms without them.

**Design choice vs TDD §19.4:** authoritative state is one `rooms.state` jsonb blob (not normalized tables) — that's what makes the verbatim authority reuse possible. Secrets are isolated in `room_secrets` (never published, never anon-readable). Normalized tables for leaderboards come in 3d.

**Not yet verified:** the Edge Functions need a live `supabase start` to shake out Deno import resolution (sloppy-imports), RLS, and the realtime payload shape — see `supabase/README.md` "Not yet done".

The intent is to leverage two existing seams:
- **The engine (`features/cao/`) is pure/I-O-free**, so it runs unchanged inside a Deno **Edge Function** (server-side authority + server RNG).
- **`Session` is an interface** (`hostSession.ts`/`clientSession.ts` implement it; the store only talks to `Session`). Phase 3 adds a third impl, **`SupabaseSession`** (Realtime for state in, Edge Function RPC for intentions out), leaving the store, UI, `RoomState`, and Zod schemas untouched.

Mapping: authority → Edge Functions; transport → Supabase **Realtime** (replaces WebRTC, drops the signaling broker + TURN); state → Postgres tables; RNG → server-side (eliminates the host-cheat class, so commit–reveal becomes optional); identity → Supabase **Auth** (anonymous-first). **Hidden hands** stay safe via a `round_hands` table excluded from the Realtime publication + RLS (own-row always, others only where `revealed`) — the "no hidden hands before REVEAL" invariant becomes DB-enforced. The server owns the betting clock (pg_cron / scheduled function). When extending toward Phase 3, preserve the same invariants and don't fork the engine — share it.

**Active room discovery** (a Phase-3 deliverable, TDD §19.9): once rooms are Postgres rows, the Home page can show a **live public room browser** (Realtime-subscribed to `rooms WHERE status='LOBBY' AND is_public`) for one-click join — something pure P2P can't do (no client can enumerate rooms in other browsers). Rooms are **public by default** with a host private/public toggle; `rooms.is_public` + a denormalized `player_count` drive the list; an anon RLS policy exposes only directory columns (never config/seeds/hands). No heartbeat needed — row state evicts stale entries.
