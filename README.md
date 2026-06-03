# Bài Cào — Multiplayer (P2P)

A browser-based multiplayer [Bài cào](https://vi.wikipedia.org/wiki/Bài_cào) (Vietnamese 3-card game). Static SPA, host-authoritative peer-to-peer over WebRTC (PeerJS), deployable to GitHub Pages with no dedicated game backend.

The room creator is the **cái (dealer)** — a real player everyone bets against, *and* the game authority. See [GDD.md](./GDD.md) (game design), [TDD.md](./TDD.md) (technical design), and [CLAUDE.md](./CLAUDE.md) (contributor orientation).

## Quick start

```bash
npm install
npm run dev        # http://localhost:5173/beikao/
```

Open the URL, create a room, then share the room code (or the `?room=BAC-XXXX` link) with another browser/device to join.

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

## Networking note

PeerJS uses the public broker for signaling. For reliable connectivity on mobile / restrictive networks you need a **TURN server** — configure it via `.env.local` (see [.env.example](./.env.example)) or GitHub Actions secrets. Without TURN, some peers will fail to connect.

## Status

- ✅ Game engine (scoring, ba tiên, suit tie-break, settlement) — fully unit-tested
- ✅ Host-authoritative networking (PeerJS), Zustand store, Cào cái + Cào rùa
- ✅ UI: Home / Lobby / Game, betting timer, reveal, chat, history
- ⏳ Provably-fair commit–reveal, host migration, spectator, replay (see TDD phasing)

Virtual chips only — play money, not real-money gambling.
