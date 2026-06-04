# Bài Cào — Multiplayer

A browser-based multiplayer [Bài cào](https://vi.wikipedia.org/wiki/Bài_cào) (Vietnamese 3-card game). A React SPA served by a **Cloudflare Worker** that also hosts the server-authoritative backend — **Durable Objects** (one per room: the game authority + the WebSocket set + the betting-deadline alarm) and **D1** (durable balances + the room directory), all same-origin. The room creator is the **cái (dealer)** — a real player everyone bets against.

> **History:** the app began as host-authoritative peer-to-peer (WebRTC/PeerJS), then moved to a Supabase backend (Postgres + Realtime + Edge Functions), and now runs on Cloudflare (Workers + Durable Objects + D1). Those earlier layers have been **removed**; the docs retain some sections as design history. See [GDD.md](./GDD.md) (game design), [TDD.md](./TDD.md) (technical design), [CLAUDE.md](./CLAUDE.md) (contributor orientation), and [`cloudflare/README.md`](./cloudflare/README.md) (backend ops).

## Quick start

```bash
npm install
npm run build                # build the SPA the Worker serves
npx wrangler d1 migrations apply beikao --local   # first time
npm run cf:dev               # Worker + Durable Objects + local D1 → http://127.0.0.1:8788
```

No env vars are needed — the app is same-origin, so the client derives the API/WebSocket URLs from `window.location`. Create a room and share the code to join. (`npm run dev` runs Vite for pure-UI iteration, but the API/WS only exist under the Worker — use `cf:dev` to exercise the backend.) See [`cloudflare/README.md`](./cloudflare/README.md) for setup + deploy.

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
| `npm run cf:dev` | Run the Worker + Durable Objects + local D1 (serves `dist/`). |
| `npm run cf:deploy` | `wrangler deploy` (Worker + DOs + Static Assets). |
| `npm run cf:typecheck` | Type-check the Worker (`cloudflare/`). |

Run a single test file: `npx vitest run src/features/cao/hand.test.ts`

## Backend

All multiplayer goes through one **Cloudflare Worker** (no WebRTC/TURN, no signaling broker): the browser opens a WebSocket to the room's **Durable Object**, which runs the game authority in-isolate and pushes state back; cross-room data (durable balances + the room directory) lives in **D1**. Deploys go through **Cloudflare Workers Builds** (connected to the repo, production branch `release/worker`). Setup + deploy details in [`cloudflare/README.md`](./cloudflare/README.md).

## Status

- ✅ Game engine (scoring, ba tiên, suit tie-break, settlement) — fully unit-tested; reused **verbatim** server-side in the Durable Object
- ✅ **Cloudflare backend:** server-authoritative authority in a per-room Durable Object (WebSocket transport, in-isolate state, betting-deadline alarm), server RNG, provably-fair commit–reveal, exact socket-based presence, signed-token anonymous identity, durable cross-room balances + wallet, live room-discovery browser — all same-origin on one Worker
- ✅ UI: Home (create / join / browse) + a **single table screen** (the waiting lobby *is* the table), betting timer, card-deal + chip animations, reveal, chat with popup bubbles, reactions, history, spectator with seat↔watch switching between rounds
- ✅ **UI v2 — "Lacquer & Gold"** (from `design_handoff_beikao/`): sơn mài red + gold-leaf design system, Be Vietnam Pro typography, SVG card faces with three selectable backs (trống đồng / phượng hoàng / hoa sen), elliptical felt table with arc seating, chip-button betting bar with countdown ring, result overlay; personal card-back/chip-style prefs in localStorage
- 🗑️ The earlier **P2P/WebRTC (PeerJS)** and **Supabase (Postgres/Realtime/Edge Functions)** backends have been removed
- ⏳ Custom-domain cutover, rotating cái, tournaments, email/OAuth identity upgrade (see TDD phasing)

Virtual chips only — play money, not real-money gambling.
