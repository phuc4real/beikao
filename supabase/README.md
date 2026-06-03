# Phase 3 — Supabase backend

Server-authoritative backend for Bài cào (see [`TDD.md` §19](../TDD.md#19-phase-3--supabase-backend-migration)). This is **step 3a (foundation)** plus a first cut of the authority Edge Function (3b). The P2P backend is still the default; this only activates when the client is built with `VITE_BACKEND=supabase`.

## What's here

```
supabase/
├── config.toml                  # local dev stack config
├── migrations/
│   ├── 0001_phase3_init.sql          # schema, RLS, realtime publication, discovery view
│   ├── 0002_room_cleanup.sql         # empty_since + directory hides empty rooms
│   ├── 0003_profiles_leaderboard.sql # durable stats + leaderboard view (3d)
│   └── 0004_durable_balances.sql     # profiles.balance + get_or_create_profile (3d)
└── functions/
    ├── _shared/cors.ts
    ├── _shared/types.ts         # minimal Deno-side types
    ├── _shared/stats.ts         # records settled-round net into profiles
    ├── _shared/engine.bundle.js # GENERATED: engine + authority + protocol (no fork) — see below
    ├── intent/                  # authority: create / intention / leave / sync_presence
    └── tick/                    # cron: close betting + reap empty/dead rooms
```

The engine bundle is produced from `src/` by `npm run build:functions`
(`scripts/build-functions.mjs`, esbuild). **Re-run it whenever you change the
engine, authority, protocol, or room types**, then redeploy the functions.

## How it works

- Browsers **read** state over Realtime (Postgres changes on the `rooms` row) and **send** intentions by invoking the `intent` Edge Function. They never write game state directly (RLS denies it).
- `intent` loads the persisted `RoomState` + private `room_secrets`, **hydrates the same `GameAuthority` the P2P host uses** (`snapshot`/`secrets`/`useTimers:false`), applies one intention, and persists the result. The authority keeps hidden hands out of `RoomState` until REVEAL, so the published `state` is safe; the deck seed lives only in `room_secrets`, which is never published and not anon-readable.
- `tick` runs the betting-deadline close (the server owns the clock — there's no host `setTimeout`) **and reaps empty rooms** (see below).

## Room lifecycle / why empty rooms disappear

A room only shows in the browser while it's `LOBBY`, public, **and has ≥1 connected player** (`room_directory` filters `player_count > 0`).

- **In-app leave** ("Về trang chủ"): a *permanent* leave — if you were the last one in, the server **deletes the room immediately**.
- **Tab close / reload**: the client sends a `keepalive` leave on `pagehide` that only **marks you disconnected** (not permanent), so the room empties and drops off the browser at once — but it isn't deleted, so a reload reconnects within the grace.
- **Reaper**: when a room hits 0 connected players the server stamps `empty_since`; the `tick` function **deletes rooms empty longer than ~30 s**. So abandoned rooms vanish from the list instantly and are removed from the DB shortly after. (Requires `tick` to be scheduled — see below.)

> Rooms created **before** this change may linger with a stale `connected` player. Clear them once with `supabase db reset` (local) or `delete from rooms;` in the SQL editor (hosted).

## Local development

```bash
# 0. Install the Supabase CLI + Docker, then from the repo root:
npm run build:functions        # bundle the engine → functions/_shared/engine.bundle.js
supabase start                 # boots Postgres + Realtime + Studio + Edge runtime
supabase db reset              # applies migrations/0001_phase3_init.sql
supabase functions serve       # serves intent + tick locally

# Point the SPA at the local stack (.env.local):
#   VITE_BACKEND=supabase
#   VITE_SUPABASE_URL=http://127.0.0.1:54321
#   VITE_SUPABASE_ANON_KEY=<printed by `supabase start`>
npm run dev
```

## Deploy

```bash
npm run build:functions                 # (re)generate the engine bundle first
supabase link --project-ref <your-project-ref>
supabase db push                        # apply migrations to the hosted DB
supabase functions deploy intent tick   # SUPABASE_URL + SERVICE_ROLE_KEY are injected automatically
```

Then set `VITE_SUPABASE_URL` + `VITE_SUPABASE_ANON_KEY` (GitHub Actions secrets) and deploy as usual — **Supabase is the default backend whenever those are set** (no `VITE_BACKEND` needed; use `VITE_BACKEND=p2p` to force the WebRTC fallback).

**Enable anonymous auth:** in the Supabase dashboard → Authentication → Providers, turn on **Anonymous sign-ins** (the player identity is an anonymous auth user — 3d). If it's off, the app degrades to the localStorage id.

### Schedule the betting-deadline tick

`tick` must run ~1×/second. Easiest is pg_cron + pg_net (SQL editor), calling the deployed function:

```sql
select cron.schedule(
  'beikao-tick', '1 seconds',
  $$ select net.http_post(
       url := 'https://<ref>.functions.supabase.co/tick',
       headers := jsonb_build_object('Authorization', 'Bearer <anon-or-service-key>')
     ); $$
);
```

(For local dev, you can poke `tick` by hand: `curl -X POST http://127.0.0.1:54321/functions/v1/tick`.)

## How the engine is shared (no fork)

The Edge Functions reuse the app's rules **verbatim** — they don't reimplement
anything. `npm run build:functions` bundles `src/features/{cao,room}` + the
protocol (and zod) into one ESM module, `functions/_shared/engine.bundle.js`,
which the functions import as untyped values (`GameAuthority`, `intentionSchema`,
`DEFAULT_CONFIG`); `functions/_shared/types.ts` supplies the few Deno-side type
annotations. The engine only uses Web APIs (`crypto`, `TextEncoder`), so it runs
unchanged on Deno.

> We bundle (rather than have Deno resolve `src/` directly) because the engine
> uses extensionless / `@/` TS imports that the Supabase Edge runtime rejects
> (`sloppy-imports` isn't honored there, and `jsr:@supabase/supabase-js` 403s —
> hence the `npm:@supabase/supabase-js@2` specifier in the functions).
> **The bundle is a generated artifact — re-run `npm run build:functions` after
> any change to the engine/authority/protocol.**

## Not yet done (next steps)

- **3b finish:** verify the Edge Functions end-to-end on `supabase start` (Deno import resolution, RLS, realtime payload shape).
- **3c:** ✅ presence-based disconnect — clients track Realtime **Presence**; a deterministic "reporter" (lowest present id) pushes the present set to `sync_presence`, which reconciles every seat's `connected` flag; the reporter heartbeats so the reaper can sweep dead rooms.
- **3d:** ✅ active-room-discovery browser + public/private toggle; ✅ durable **stats + leaderboard**; ✅ **anonymous Supabase Auth** identity (persisted, upgradeable); ✅ **durable cross-room balances** (chips follow the player; new players granted the room's starting balance). Hardening left: derive the player id from the verified JWT server-side instead of trusting the request body.
- **3e:** ✅ Supabase is the **default** backend when configured; PeerJS/TURN kept as an opt-in fallback (`VITE_BACKEND=p2p`) rather than deleted.
