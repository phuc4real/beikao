# Phase 3 — Supabase backend

Server-authoritative backend for Bài cào (see [`TDD.md` §19](../TDD.md#19-phase-3--supabase-backend-migration)). This is the app's **only** backend — the original host-authoritative P2P/WebRTC (PeerJS) transport has been removed. The SPA requires `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` to create or join rooms.

## What's here

```
supabase/
├── config.toml                  # local dev stack config
├── migrations/
│   ├── 0001_phase3_init.sql          # schema, RLS, realtime publication, discovery view
│   ├── 0002_room_cleanup.sql         # empty_since + directory hides empty rooms
│   ├── 0003_profiles_leaderboard.sql # durable stats + leaderboard view (3d)
│   ├── 0004_durable_balances.sql     # profiles.balance + get_or_create_profile (3d)
│   ├── 0005_security_invoker_views.sql # views run as SECURITY INVOKER (advisor fix)
│   ├── 0006_indexes.sql              # rooms.updated_at + profiles leaderboard index
│   └── 0007_commit_room.sql          # atomic state+secrets write (1 round trip, OCC-gated)
└── functions/
    ├── _shared/cors.ts
    ├── _shared/types.ts         # minimal Deno-side types
    ├── _shared/db.ts            # supabase-js data layer: loaders + commit/write helpers
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
- `intent` loads the persisted `RoomState` + private `room_secrets`, **hydrates the `GameAuthority`** (`snapshot`/`secrets`/`useTimers:false`) — the same engine + state machine from `src/`, run statelessly per request — applies one intention, and persists the result. The authority keeps hidden hands out of `RoomState` until REVEAL, so the published `state` is safe; the deck seed lives only in `room_secrets`, which is never published and not anon-readable.
- `tick` runs the betting-deadline close (the server owns the clock — there's no host `setTimeout`) **and reaps empty rooms** (see below).

### Database access + latency

All DB access goes through `_shared/db.ts` (loaders + write helpers), backed by **supabase-js (PostgREST)**. Writes go through the `commit_room` RPC (state + secrets atomically in one round trip, OCC-gated) or `writeRoomOnly` (rooms-only, for leave/presence — never disturbs the deck seed).

**On latency:** measured per-query time function↔DB is ~65–95ms — i.e. the Edge Function and the database are **not in the same datacenter**, so each round trip pays real network RTT. A typical `intent` is 2 sequential trips (parallel reads, then one `commit_room` write) ≈ ~190ms warm, more when the isolate is cold. This is the floor for a read→compute→write authority and **transport changes can't beat it**:

- A direct pooled Postgres connection (`postgres.js`) was tried and **regressed**: during normal play every request hits a fresh (cold) isolate, and opening a new Postgres connection cost ~900ms each. PostgREST is plain HTTP and connects instantly, so it's the better baseline.
- The genuine fixes are infrastructure/UX, not code: (1) ensure the **Edge Functions region matches the database region** (co-location drops each hop to ~single-digit ms); (2) apply intentions **optimistically on the client** and let Realtime confirm, so gameplay feels instant regardless of the server round trip.

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

Then set `VITE_SUPABASE_URL` + `VITE_SUPABASE_ANON_KEY` (GitHub Actions secrets) and deploy as usual. These are **mandatory** — the CI build fails fast if they're empty, and the deployed SPA can't create/join rooms without them.

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
- **3e:** ✅ Supabase is the **only** backend — the PeerJS/TURN P2P transport (and the `VITE_BACKEND` flag) has been removed entirely.
