# Cloudflare backend (Workers + Durable Objects + D1)

Operational guide for the Cloudflare backend that replaces Supabase (see
`../cloudflare_migration_plan.md` for the design). One Worker serves the SPA
(Static Assets) **and** the API/WS, so everything is same-origin.

```
cloudflare/
  src/worker.ts    Router: /api/* + WS upgrades; else → static assets (SPA fallback)
  src/roomDO.ts    RoomDO — GameAuthority + WebSocket set + betting-deadline alarm
  src/lobbyDO.ts   LobbyDO — live room-browser change pings
  src/auth.ts      Signed-token (HMAC) mint/verify — the anonymous identity
  src/d1.ts        Profiles (durable balances/stats/wallet) + room directory
  src/stats.ts     roundResults() — per-player settle rows for D1
  migrations/      D1 (SQLite) schema
```

The engine/authority/protocol are reused **verbatim** from `../src/` (imported as
`@/…`; esbuild resolves the alias via the root `tsconfig.json` `paths`). There is
no bundle step — re-running anything after an engine change is unnecessary.

## Local development

```bash
# First time / after a schema change — apply D1 migrations to the LOCAL db:
npx wrangler d1 migrations apply beikao --local

# Run the Worker + DOs + local D1, serving the built SPA:
npm run build            # produces dist/ (the Static Assets the Worker serves)
npm run cf:dev           # wrangler dev  → http://127.0.0.1:8788

# Typecheck the Worker (separate from the app's tsc -b):
npm run cf:typecheck
```

`AUTH_SIGNING_KEY` falls back to a dev-only value locally; set a real secret for
deploys (below). For pure UI iteration you can still `npm run dev` (Vite), but the
API/WS only exist under the Worker, so run against `cf:dev` to exercise the backend.

## One-time Cloudflare setup (before the first real deploy)

1. **Create the D1 database** and paste the id into `wrangler.toml` (`database_id`):
   ```bash
   npx wrangler d1 create beikao
   ```
2. **Set the signing secret** (Worker → Settings → Variables, or):
   ```bash
   npx wrangler secret put AUTH_SIGNING_KEY
   ```
3. **Workers Builds deploy command** — update it (dashboard) to apply migrations
   before deploying:
   ```
   npx wrangler d1 migrations apply beikao --remote && npx wrangler deploy
   ```

The SPA has no env vars — it's same-origin, so the client derives the API/WS URLs
from `window.location`.

## Going live (no data migration — fresh start)

We start fresh on Cloudflare; there is no Supabase data to carry over (rooms are
ephemeral and player profiles begin empty).

1. **Point the custom domain** at the Worker (uncomment the `[routes]` block in
   `wrangler.toml`; the domain must be on Cloudflare). Verify `wss://…/api/room/:code`
   works over the real domain.
2. **Verify** on the live Worker: create/join, a full round, wallet top-up/daily,
   the room browser, and reconnect after a reload.

## Teardown — done

Supabase is fully removed (the `supabase/` functions/migrations, the
`@supabase/supabase-js` dep, `build:functions`, the `VITE_SUPABASE_*` env, the
`network/backend.ts` selector + `VITE_BACKEND` flag, the `network/supabase/*` and
`app/session/supabaseSession.ts` impls, and the GitHub Pages workflow). Cloudflare
is the only backend. `release/worker` carries this; merge it to `main` when ready.

## What's deleted vs. Supabase (already gone in this backend)

OCC `version`/retry loops, the presence reporter + heartbeat + `sync_presence`,
`pg_cron` + the `tick` function + the client `CLOSE_BETTING` failsafe, the
`room_secrets` table + RLS, and per-request authority rehydration — the DO holds
the warm authority in-isolate and a single Alarm owns the deadline.
