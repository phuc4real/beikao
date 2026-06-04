# Bài Cào — Multiplayer

A browser-based multiplayer [Bài cào](https://vi.wikipedia.org/wiki/Bài_cào) (Vietnamese 3-card game). Static React SPA deployable to GitHub Pages, backed by **Supabase** (server-authoritative) — Postgres state, Realtime transport, and Edge Functions that run the game authority. The room creator is the **cái (dealer)** — a real player everyone bets against.

> **History:** the app began as host-authoritative peer-to-peer over WebRTC (PeerJS). That layer has been **removed** in favour of the Supabase backend (TDD §19); the docs' P2P sections are retained as design history. See [GDD.md](./GDD.md) (game design), [TDD.md](./TDD.md) (technical design), and [CLAUDE.md](./CLAUDE.md) (contributor orientation).

## Quick start

```bash
npm install
cp .env.example .env.local   # then fill in your Supabase URL + anon key
npm run dev                  # http://localhost:5173/beikao/
```

Supabase is **required** — without `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` the app can't create or join rooms. See [`supabase/README.md`](./supabase/README.md) to stand up the backend (`supabase start`, migrations, Edge Functions). Then create a room and share the code (or the `?room=BAC-XXXX` link) to join.

## Scripts

| Command | Purpose |
| --- | --- |
| `npm run dev` | Dev server (Vite). |
| `npm run build` | Typecheck + production build to `dist/`. |
| `npm run preview` | Serve the production build locally. |
| `npm run test` | Run the Vitest suite once. |
| `npm run test:watch` | Watch mode. |
| `npm run test:cov` | Coverage report. |
| `npm run typecheck` | Type-check without emitting. |
| `npm run lint` | ESLint. |

Run a single test file: `npx vitest run src/features/cao/hand.test.ts`

## Backend

All multiplayer goes through **Supabase** (no WebRTC/TURN, no signaling broker): clients read room state over **Realtime** and send intentions to **Edge Functions** that run the authority. Set up the backend per [`supabase/README.md`](./supabase/README.md) and configure `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` (via `.env.local` locally, or GitHub Actions secrets for deploy).

## Status

- ✅ Game engine (scoring, ba tiên, suit tie-break, settlement) — fully unit-tested; reused **verbatim** server-side in the Edge Functions
- ✅ **Supabase backend (Phase 3, 3a–3e):** server-authoritative engine in Edge Functions, Postgres state + Realtime transport, server RNG, provably-fair commit–reveal, presence-based disconnect, anonymous Auth, durable cross-room balances, leaderboard, live room-discovery browser
- ✅ UI: Home (create / join / browse / leaderboard) + a **single table screen** (the waiting lobby *is* the table), betting timer, card-deal + chip animations, reveal, chat with popup bubbles, reactions, history, spectator with seat↔watch switching between rounds
- ✅ **UI v2 — "Lacquer & Gold"** (from `design_handoff_beikao/`): sơn mài red + gold-leaf design system, Be Vietnam Pro typography, SVG card faces with three selectable backs (trống đồng / phượng hoàng / hoa sen), elliptical felt table with arc seating, chip-button betting bar with countdown ring, result overlay; personal card-back/chip-style prefs in localStorage
- 🗑️ The legacy host-authoritative **P2P/WebRTC (PeerJS) layer has been removed** (TDD §19)
- ⏳ Persistent round history in Postgres, tournaments, JWT-derived server-side identity (see TDD phasing)

Virtual chips only — play money, not real-money gambling.
