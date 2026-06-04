# Cloudflare migration plan — Supabase → Workers + Durable Objects

> Status: **accepted — in progress on the `release/worker` branch.** This is the planning
> doc for moving the *entire* stack off Supabase + GitHub Pages onto Cloudflare:
> server-authoritative backend → Workers + Durable Objects + D1, **and static hosting
> → the same Worker (static assets), one deploy, one origin.** It mirrors the approach
> that worked for the Phase 3 Supabase migration (see `TDD.md §19`): **migration, not
> rewrite** — reuse the engine and authority verbatim, add a new `Session` impl behind
> the existing seam, run it in parallel, then cut over and delete the old backend.
>
> **Decisions locked in (this revision):**
> - **Cloudflare is the only target.** The earlier "stay on GitHub Pages" option is
>   dropped. Hosting, API, realtime, durable state, and deploy all live on Cloudflare.
> - **Deploy via Cloudflare Workers Builds (connect the Git repo), not GitHub Actions.**
>   Cloudflare's GitHub app connects directly to the **private** repo and builds +
>   deploys on push. The repo stays private; no `wrangler deploy` in GitHub Actions and
>   **no Cloudflare API token stored as a GitHub secret.**
> - **`release/worker` is the deploy branch.** Pushing to `release/worker` triggers a Workers
>   Builds production deploy (Worker + DO + D1 + the SPA assets); other branches/PRs get
>   non-production preview builds.
> - **Single Worker serves both the SPA and the API** (Workers Static Assets), so the
>   app is **same-origin** — no CORS, and the WebSocket is just `wss://<same-host>/api/room/:code`.

---

## 1. Why move (and why it's tractable)

### The latency argument (the real motivation)

`supabase/functions/_shared/db.ts` documents the current bottleneck in its own
header comment:

> "The dominant cost is the function↔DB network round trip, NOT query execution
> (pg_stat_statements: each write runs in ~1-2ms server-side, yet a warm
> invocation is ~1.3s — the DB isn't co-located with the function)."

So every intention pays: client → Edge Function → (network) → Postgres read RPC →
(network) → Postgres write RPC → response, **plus** the Realtime row-change fan-out
to other clients. That ~1s round trip is precisely what the UI animation layer
currently masks (chip flight, deal choreography, optimistic bets, phase crossfades).

A **Durable Object holds the authority and its state in the same isolate** — no
network hop between "run the rules" and "read/write state". Combined with a
**persistent WebSocket** (push, not poll-a-row-change) the per-intention latency
should drop from ~1s to tens of ms. **This migration attacks the lag we're masking
rather than hiding it better.**

### The structural-fit argument

`GameAuthority` is a single-writer, single-room, consistent actor. That is *exactly*
the Durable Object model. The current stateless design (hydrate from Postgres on
every request, gate writes on an optimistic-concurrency `version`, retry on
contention — see `runIntent`'s `MAX_RETRIES` loop and `commit_room`) exists purely
to work around Edge Functions being stateless. A DO is single-threaded and
serializes all mutations, so **the entire OCC/version/retry machinery disappears.**

### What we delete outright (accidental complexity)

| Today (Supabase) | After (Cloudflare) |
|---|---|
| OCC `version` column + `MAX_RETRIES` retry loops (`intent/index.ts`, `commit_room`) | Gone — DO serializes mutations |
| Presence "reporter election" + 25s heartbeat + `sync_presence` op + `reconcilePresence` | Gone — the DO knows its own open sockets exactly |
| `pg_cron` + `tick` function + the client-side `CLOSE_BETTING` failsafe in `GameTable.tsx` | One **DO Alarm** at `round.endsAt` |
| `room_secrets` table + RLS to hide it | DO private storage — never sent to clients, no table to protect |
| Per-request authority **rehydration** from jsonb | Authority stays warm in the DO (rehydrate only after eviction) |

### Non-goals

- No gameplay/rules changes. The engine (`features/cao/`) is untouched.
- No change to `RoomState`, the protocol intentions, or the Zustand store's public shape.
- No SPA framework change.

**In scope *because* hosting moves to Cloudflare** (these were "out" in the GH Pages
draft and are now "in"): the Vite `base` drops from `/beikao/` to `/` (served at the
domain root), and routing **may** switch from hash mode to history mode since the Worker
can serve `index.html` as the SPA fallback for deep links (the original reason for hash
mode — GitHub Pages having no server-side routing — no longer applies). The history
switch is optional and can land after cutover; hash mode keeps working in the meantime.

---

## 2. Target architecture

Everything is one Cloudflare Worker on one custom domain (e.g. `beikao.<domain>`):
it serves the built SPA as static assets **and** handles every API/WS route — so the
browser, the API, and the WebSocket are all same-origin.

```
                         one origin: https://beikao.<domain>
┌─────────────┐                          │
│   Browser   │   GET / , /assets/*  ─────┤  (Static Assets: the built dist/)
│  (React SPA)│                          │
│             │   wss://…/room/:code  ───┤────────────────►┌──────────────────────┐
│  Session =  │                          │   (WS upgrade    │  Room Durable Object  │
│ CloudflareS │   POST /api/auth/anon ───┤    routed to DO) │  (one per room code)  │
└─────────────┘   POST /api/wallet/* ───┤                  │  • GameAuthority      │
                  GET  /api/rooms     ───┤                  │    (in memory + DO    │
                          │              │                  │     storage)          │
                    Worker (fetch):      │                  │  • Set<WebSocket>     │
                    static-asset serving │                  │  • Alarm @ endsAt     │
                    + API router + SPA   │                  └───────────┬──────────┘
                    fallback (index.html)│                              │ on settle/state change
                          │              ▼                              ▼
                          │     ┌──────────────────────┐    ┌──────────────────────┐
                          └────►│  Lobby Durable Object │    │   D1 (SQLite)         │
                                │  (live room browser   │    │  • profiles/balances  │
                                │   fan-out over WS)    │    │  • room_directory     │
                                └──────────────────────┘    └──────────────────────┘
```

- **Worker (single entry)** — serves the static SPA via the **Static Assets** binding
  and, for non-asset paths, runs the router: identity minting, wallet RPCs,
  room-directory reads, the WebSocket upgrade (forwarded to the right room DO), and an
  `index.html` SPA fallback for client routes. One `wrangler deploy` ships all of it.
- **Room Durable Object** (`RoomDO`) — one instance per room code (`idFromName(code)`).
  Owns the `GameAuthority`, the live WebSocket set, and the betting-deadline alarm.
- **D1** — the only *cross-room* durable data: player profiles/balances and the
  public room directory. Per-room authoritative state lives in the DO, not D1.
- **Lobby Durable Object** — a single well-known DO that room DOs notify on
  create/status-change/close; browsers subscribe over WS for a live room browser
  (parity with today's Realtime-subscribed `RoomBrowser`). Fallback if we want less
  code: browsers poll `GET /api/rooms` every few seconds.

### Supabase → Cloudflare mapping

| Supabase primitive | Cloudflare replacement |
|---|---|
| Edge Function `intent` (create/intent/leave/sync_presence) | `RoomDO` WS message handlers + HTTP methods |
| Edge Function `tick` (deadline close) | `RoomDO.alarm()` |
| Realtime `postgres_changes` (state in) | WebSocket message `{type:'STATE', state}` from `RoomDO` |
| Realtime Presence (who's connected) | `RoomDO`'s open-socket set (exact) |
| Realtime Broadcast (reactions) | `RoomDO` relays the reaction message to peers |
| `rooms.state` jsonb + `version` | `RoomDO` storage (`state`, `secrets`) |
| `room_secrets` (service-role only) | `RoomDO` private storage (never broadcast) |
| `room_directory` view + subscribe | D1 `room_directory` table + Lobby DO (or polling) |
| `profiles`, `get_or_create_profile`, `record_round_result` | D1 + Worker/DO helpers |
| `claim_topup`, `claim_daily_gift` SQL RPCs | Worker endpoints keyed to the verified uid |
| Anonymous Supabase Auth (uid) | **Worker-minted signed token** (the one net-new piece) |
| `supabase start` / CLI / migrations | `wrangler dev` (local) / `wrangler d1 migrations apply` |
| `npm run build:functions` (esbuild → Deno bundle) | Gone — Workers import `src/` TS directly |
| **GitHub Actions** deploy workflow + Pages | **Cloudflare Workers Builds** — connect the private repo, deploy on push |
| **GitHub Pages** (static SPA host) + `gh-pages` deploy | **Worker Static Assets** — the same Worker serves `dist/` |
| `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` | None needed — same-origin; client derives API/WS from `location` |

---

## 3. What carries over **unchanged**

These are the assets that make this a migration, not a rewrite:

- **`src/features/cao/`** — pure engine. Zero changes. Runs in a Worker isolate as-is.
- **`src/features/room/authority.ts`** — the `GameAuthority`. Already hydratable
  (`snapshot`/`secrets`/`useTimers`) and already routes all output through
  `AuthorityCallbacks.broadcast`/`sendTo`. The DO just wires those callbacks to
  WebSocket sends. **Small changes only — see §5.**
- **`src/network/protocol/messages.ts`** — Zod `intentionSchema` validates inbound
  WS messages in the DO, exactly as it does today in `intent/index.ts`.
- **`src/features/room/types.ts`** — `RoomState`, `PlayerView`, etc. unchanged.
- **The entire UI** — `GameTable`, `Seat`, store, hooks. They talk to the `Session`
  interface, never the transport. Preserve the interface → the UI is untouched
  (we even *remove* the `CLOSE_BETTING` client failsafe — a simplification).

The reuse mechanism is also simpler than today: Workers run TypeScript/ESM natively,
so the DO can `import { GameAuthority } from '../src/features/room/authority'` directly
via wrangler's bundler. **The Deno import-map + esbuild `engine.bundle.js` step
(`scripts/build-functions.mjs`, `build:functions`) is deleted.**

---

## 4. The two genuinely new pieces

Everything else is a port. These two have no drop-in equivalent and carry the risk.

### 4.1 Identity / auth (highest-risk, do a spike first)

Supabase gave us anonymous-but-real, reload-stable, upgradeable-to-OAuth uids for
free (`auth.ts: ensureIdentity` / `peekIdentity`). On Cloudflare we mint our own:

- `POST /auth/anon` → Worker generates a random uid, returns a **signed token**
  (JWT or HMAC over `{uid, iat}` using a secret in Worker env). Client stores it in
  localStorage (replacing the persisted Supabase session).
- Every authenticated call (wallet RPCs) and the **WebSocket upgrade** carries the
  token; the Worker/DO verifies the signature → a trusted `playerId` that can't be
  spoofed (preserving "clients send intentions, never results", and that wallet
  credits are keyed to the *verified* uid, not a client-claimed one).
- Keep the function signatures of `ensureIdentity()`/`peekIdentity()` — swap only
  the bodies. The localStorage-fallback path stays as the degraded mode.
- **Upgrade path preserved**: later, link email/OAuth by minting a token for an
  authenticated user and migrating the D1 profile row. (Cloudflare Access or a
  third-party OIDC can slot in here without touching the game.)

> ⚠️ Token-in-query-param for the WS upgrade is logged by proxies. Prefer sending
> the token as the **first WS message** (a `HELLO`), or use a short-lived
> single-use ticket fetched over HTTPS just before connecting.

### 4.2 Cross-room durable data → D1

Per-room state lives in the DO. Only data that must be queried *across* rooms goes
to D1 (SQLite — the SQL ports almost verbatim from the Postgres migrations):

- **`profiles`** (`id PK, name, balance, last_gift_at, created_at, updated_at`).
  Ports from `0003`/`0004`/`0011`. The SECURITY-DEFINER RPCs become Worker handlers:
  - `get_or_create_profile` → read-or-insert on JOIN/create (called by `RoomDO`).
  - `record_round_result` → on settle, the DO writes each seat's post-settle balance.
  - `claim_topup` (+2000) / `claim_daily_gift` (+1000, once per VN-day) → Worker
    endpoints keyed to the verified uid. The VN-time day check ports directly.
- **`room_directory`** (`code PK, name, mode, status, player_count, max_players,
  created_at`). Room DOs `upsert` on state change and `delete` on close. The Home
  browser reads via `GET /rooms` (Worker `SELECT ... WHERE status='LOBBY' AND
  is_public ORDER BY created_at DESC LIMIT 50`).

> Note the existing caveat (CLAUDE.md): a wallet top-up while seated is overwritten
> at the next settle. That stays true here and the wallet taps remain Home-only.

---

## 5. `GameAuthority` changes (small, surgical)

The authority is reused, but a few seams change. None touch the rules.

1. **Callbacks → WebSocket sends.** Construct it with:
   ```ts
   new GameAuthority({
     roomId, hostId, hostName, snapshot, secrets, useTimers: false,
     callbacks: {
       broadcast: (state) => this.broadcastToSockets(state),       // → all WS, hidden-hands already stripped
       sendTo: (pid, msg) => this.sendToSocket(pid, msg),          // → that player's WS
     },
   })
   ```
   This is the same callback contract `intent/index.ts` already uses (it just
   collected `sendTo` into an array). No authority code change.

2. **Persistence on commit.** Today the Edge Function persists *after* `submit`
   resolves. In the DO, persist inside/after each mutation. Two options:
   - **(a) Keep authority warm**, persist `state`+`secrets` to DO storage after each
     `submit`/`alarm` (so eviction can rehydrate). Lowest latency.
   - **(b) Hydrate-per-message** like today but from DO storage (still co-located, so
     cheap). Simpler, slightly slower.
   Recommend **(a)**. Either way, `getState()`/`getSecrets()` already expose what to
   persist; `{snapshot, secrets}` already rehydrates.

3. **Deadline via Alarm.** Keep `useTimers: false`. When `beginRound` sets
   `round.endsAt`, the DO calls `this.storage.setAlarm(round.endsAt)`. `alarm()` →
   `auth.tickDeadline(Date.now())` → persist + broadcast. Exact, durable, no cron.
   *(Optional tiny addition to the authority: a public method or returned signal
   indicating "a round just opened, here's the new `endsAt`" so the DO can set the
   alarm without reaching into `getState().round`. Reading `getState().round?.endsAt`
   after `submit` also works and needs no authority change.)*

4. **Presence.** Drop `reconcilePresence`/`sync_presence` usage. On WS close →
   `auth.disconnect(playerId)`. On in-app leave message → `auth.leave(playerId)`
   (host migration logic already lives in `promoteNewCai`). When the **last** socket
   closes, set a short alarm to delete the room after the empty-grace (replaces
   `reapEmptyRooms`). `sweepDeadRooms` is unnecessary — a DO with no sockets and no
   alarm simply idles at zero cost.

5. **`record_round_result` hook.** Today `intent/index.ts` calls `roundResults(state)`
   when `wasBetting && status==='REVEAL'` and folds it into `commit_room`. In the DO,
   detect the same BETTING→REVEAL transition after `submit`/`alarm` and write balances
   to D1. (`_shared/stats.ts:roundResults` ports over as a plain function.)

---

## 6. WebSocket protocol

One protocol we own, replacing three Realtime mechanisms (changes + presence +
broadcast). It maps directly onto the existing `SessionHooks`.

**Client → Server** (over the room WS):
- `HELLO { token, name, spectator?, role: 'host'|'client' }` — first frame; the DO
  verifies the token, then runs `create` (host, first time) or `auth.join(...)`.
- `INTENT { intention }` — validated by `intentionSchema`, fed to `auth.submit`.
- `REACTION { emoji }` — palette-checked, relayed to peers (never hits the authority,
  same as today).
- `LEAVE { permanent }` — `auth.leave` (permanent) or rely on socket close (disconnect).

**Server → Client** (maps to `SessionHooks`):
- `STATE { state }` → `hooks.onState` (replaces the postgres_changes payload).
- `WELCOME`/`ERROR`/`SNAPSHOT`/`CLOSED` → `hooks.onServerMessage` (these `ServerMessage`
  types already exist in `messages.ts`).
- `REACTION { ... }` → `hooks.onReaction`.

`pagehide` keepalive leave: replace the `fetch(..., {keepalive:true})` beacon with a
WS close (the DO sees it immediately — *better* than today's beacon) plus an optional
keepalive `POST /room/:code/leave` for the rare close-before-socket-flush case.

---

## 7. Client: `CloudflareSession`

A new `Session` impl, the direct analogue of `SupabaseSession`, behind the **same
interface** (`src/app/session/types.ts`). The store (`store.ts`) and UI don't change.

- Constructor opens `wss://<api>/room/:code`, sends `HELLO`, wires incoming WS
  messages to the hooks (`onState`/`onServerMessage`/`onReaction`/`onStatus`).
- `send(intention)` → WS `INTENT`. **Returns a promise resolved on the echoed
  `STATE`/`ERROR`** so the store's existing `pending`/optimistic logic (added in the
  UX pass) keeps working unchanged.
- `sendReaction` → WS `REACTION`.
- `leave()` → WS `LEAVE {permanent:true}` then close.
- **Reconnect** (the `reconnecting` status we just added) maps perfectly: on WS close
  not initiated by us → `onStatus('reconnecting')`, auto-reconnect with backoff,
  re-`HELLO` on reopen (idempotent JOIN re-seats by playerId), `onStatus('connected')`.
  The `ReconnectingBanner` and recovery flow from the UX pass work as-is.

The `client.ts`/`auth.ts`/`rooms.ts`/`profile.ts` Supabase helpers get Cloudflare
twins (`apiClient.ts`, swapped `auth.ts`, `rooms.ts` → `GET /rooms`, `profile.ts` →
wallet endpoints). Same exported function signatures → callers unchanged.

---

## 8. Phasing (all on the `release/worker` branch)

All work happens on `release/worker`. Each phase is independently shippable and green;
from C0 on, every push deploys a real Cloudflare Worker via Workers Builds (preview from
`main`/PR branches, live on `release/worker` push — §9.2/§9.3), so we exercise the real
runtime continuously.

- **Phase C0 — Spike + scaffold + connect the repo (de-risk auth + DO + WS + hosting +
  deploy).** Add `wrangler.toml` + a `cloudflare/src/worker.ts` stub: the Static Assets
  binding (so `dist/` is served at the Worker origin), a throwaway `RoomDO` that accepts a
  WS and echoes with a server timestamp, and `/api/auth/anon` token minting. **Connect the
  private repo in the Cloudflare dashboard (Import a repository)** with production branch
  `release/worker` and the §9.2 build/deploy commands. **Goals**: prove the import + build +
  deploy pipeline on a private repo, confirm same-origin assets + WS, and measure WS
  round-trip latency vs. the ~1.3s Supabase baseline. **Decision gate**: latency win real?

- **Phase C1 — Real server in `cloudflare/`.** Full `RoomDO` (authority + sockets + alarm
  + persistence), the Worker router (API + SPA fallback), D1 schema + migrations,
  wallet/profile/directory handlers, the `LobbyDO`. Reuse `src/` engine/authority/protocol
  by import (no bundle step). Unit-test the DO with `@cloudflare/vitest-pool-workers`.

- **Phase C2 — `CloudflareSession` + flip the SPA to same-origin.** Add the client impl +
  Cloudflare twins of the network helpers; set `base: '/'` and derive API/WS from
  `location`. A temporary `VITE_BACKEND` flag lets us A/B the Cloudflare path against the
  still-live Supabase one during dev, but the **end state is Cloudflare-only** (no kept
  fallback). QA on the `release/worker` preview/live Worker.
  *(Same "new Session impl behind the interface" move Phase 3 used — store/UI unchanged.)*

- **Phase C3 — Data migration + cutover.** Export Supabase `profiles` → D1 (one-off
  script: balances + `last_gift_at`). Rooms are ephemeral — nothing to migrate. Point the
  custom domain at the Worker, make Cloudflare the only backend, retire the GitHub Pages
  deploy. Monitor.

- **Phase C4 — Delete Supabase + GH Pages.** Remove `supabase/`, `@supabase/supabase-js`,
  `build:functions`/`scripts/build-functions.mjs`, the old GH Pages workflow, the
  `VITE_SUPABASE_*` secrets, the `VITE_BACKEND` flag, and the OCC/presence/cron code paths.
  Update `CLAUDE.md`, `TDD.md` (add §20), `README.md`. Merge `release/worker` into `main` so
  the branches reconverge with Cloudflare as the documented backend.

---

## 9. Hosting, branches & CI (all Cloudflare)

### 9.1 Hosting — one Worker, one origin

The built SPA ships **as the Worker's Static Assets**, and the same Worker handles the
API/WS routes. One artifact, one `wrangler deploy`, same origin.

- `wrangler.toml`:
  ```toml
  name = "beikao"
  main = "cloudflare/src/worker.ts"
  compatibility_date = "2025-01-01"

  [assets]
  directory = "./dist"           # vite build output
  binding = "ASSETS"             # Worker can fall back to index.html for SPA routes
  not_found_handling = "single-page-application"

  [[durable_objects.bindings]]
  name = "ROOM"
  class_name = "RoomDO"
  [[durable_objects.bindings]]
  name = "LOBBY"
  class_name = "LobbyDO"

  [[migrations]]                 # DO class migrations
  tag = "v1"
  new_classes = ["RoomDO", "LobbyDO"]

  [[d1_databases]]
  binding = "DB"
  database_name = "beikao"
  database_id = "<from wrangler d1 create>"

  [routes]                       # custom domain
  pattern = "beikao.<domain>"
  custom_domain = true
  ```
- **Routing order in the Worker's `fetch`**: API paths (`/api/*`, `/room/:code` WS
  upgrade) are handled first; everything else falls through to the Static Assets
  binding, which serves `dist/` and returns `index.html` for unknown paths (the SPA
  fallback). WebSockets work on Workers custom domains.
- **Vite config**: `base: '/'` (drop `/beikao/`). The client uses **relative** API paths
  and derives the WS URL from `window.location` (`wss://${location.host}/room/${code}`) —
  **no `VITE_*` URL needed** because it's same-origin. Optionally flip the router to
  history mode once the SPA fallback is verified.

### 9.2 Deploy = Cloudflare Workers Builds (connect the private repo)

Instead of GitHub Actions, the Worker is created in the Cloudflare dashboard via
**Workers & Pages → Create → Workers → Import a repository**, which installs the
Cloudflare GitHub app against the **private** repo (scoped to just this repo — the code
never leaves GitHub except to Cloudflare's build runner). On every push, Workers Builds
clones, runs the build command, then the deploy command (`wrangler deploy`).

What makes the repo importable (must exist on the connected branch):
- **`wrangler.toml`** at the repo root (Worker `main`, the `[assets]` binding → `./dist`,
  the DO + D1 bindings, DO migration). Without it the import has nothing to deploy.
- A Worker entry (`cloudflare/src/worker.ts`) — even the C0 stub is enough.
- Build settings in the dashboard:
  - **Build command:** `npm run build` (produces `dist/`).
  - **Deploy command:** `npx wrangler deploy` (bundles the Worker + uploads `dist/` assets).
  - **Root directory:** repo root. **Node version:** 22 (set via build var or `.nvmrc`).
- `wrangler` + `@cloudflare/workers-types` as devDependencies so the build image uses a
  pinned wrangler and `npm ci` resolves (keep `package-lock.json` in sync when adding them).

### 9.3 Branches & promotion

Workers Builds maps Git branches to environments:
- **`release/worker`** = the **production branch** in the Workers Builds settings. A push
  there is a production deploy (Worker + DOs + Static Assets). D1 migrations run as part
  of the deploy command (`wrangler d1 migrations apply beikao --remote && wrangler deploy`).
- **`main` / PR branches** = non-production builds → preview Worker versions with their
  own URLs, exercised against real DOs/D1 before promotion.
- **Promotion** = merge `main` → `release/worker`. No manual deploy steps and **no CI secrets
  in GitHub** — Cloudflare owns the build/deploy. **Rollback** = redeploy a previous
  build from the dashboard (or `wrangler rollback`).
- The old `.github/workflows/deploy.yml` (GH Pages) is deleted. *(Optional:* keep a
  GitHub Actions workflow that only runs typecheck + lint + test as a PR gate — it never
  deploys. Decide in C2; not required since Workers Builds runs the build too.)

### 9.4 Local dev & runtime secrets

- `wrangler dev` runs the Worker + DOs + a local D1 + serves `dist/` (or proxies Vite).
  Replaces `supabase start`. (`npm run dev` still works for pure-UI iteration against a
  deployed preview Worker.)
- Runtime secret: `AUTH_SIGNING_KEY` (the token-signing key, §4.1) — set in the dashboard
  (Worker → Settings → Variables) or `wrangler secret put`, **not** in the repo. D1/DO
  bindings come from `wrangler.toml`; no client-side env vars remain.

---

## 10. Concrete change list

**New (Cloudflare side, in `cloudflare/`):**
- `wrangler.toml` (repo root) — Worker `main`, **Static Assets** binding (`./dist`),
  `RoomDO` + `LobbyDO` bindings, DO class migration, D1 binding, custom-domain route.
- `cloudflare/src/worker.ts` — `fetch` router: API paths (`/api/auth/anon`,
  `/api/wallet/{topup,daily,:id}`, `/api/rooms`) + `/room/:code` WS upgrade → DO, then
  fall through to the Static Assets binding (serves `dist/`, `index.html` SPA fallback).
- `cloudflare/src/roomDO.ts` — the room actor (authority + sockets + alarm + persistence).
- `cloudflare/src/lobbyDO.ts` — live room-directory fan-out over WS.
- `cloudflare/src/auth.ts` — token mint/verify (HMAC/JWT) using `AUTH_SIGNING_KEY`.
- `cloudflare/src/d1.ts` — profiles + directory queries (ports `_shared/db.ts` + RPC SQL).
- `cloudflare/src/stats.ts` — port of `_shared/stats.ts`.
- `cloudflare/migrations/*.sql` — D1 schema (profiles, room_directory).
- *(No deploy workflow file — Cloudflare Workers Builds owns build+deploy. The deploy
  config is the dashboard repo connection + the build/deploy commands in §9.2.)*

**Changed (app side):**
- `src/app/session/cloudflareSession.ts` — **new** `Session` impl (the only real client work).
- `src/network/` — Cloudflare twins of `client.ts`/`auth.ts`/`rooms.ts`/`profile.ts`
  (same exported signatures; URLs are relative/`location`-derived — no env vars).
- `src/app/store/store.ts` — swap the session constructor (temporary `VITE_BACKEND` switch in C2).
- `vite.config.ts` — `base: '/'` (was `/beikao/`); optional history-mode router follow-up.
- `index.html` / router — drop the `/beikao/` base assumptions; SPA fallback handles deep links.
- `src/components/GameTable.tsx` — **remove** the `CLOSE_BETTING` client-failsafe effect
  (the DO alarm owns the deadline now).
- `src/features/room/authority.ts` — no rules change; verify the callback wiring and the
  "expose new endsAt for the alarm" affordance (or read `getState().round?.endsAt`).
- `package.json` — drop `build:functions`; add `cf:dev`/`cf:deploy` wrangler scripts.

**New (deploy config — not repo files):**
- A Workers Builds connection to the private repo (dashboard), production branch =
  `release/worker`, build command `npm run build`, deploy command `npx wrangler deploy`.
- `wrangler` + `@cloudflare/workers-types` added to `devDependencies`; `.nvmrc` = `22`.

**Deleted (at C4):**
- `supabase/` (functions, migrations, config), `scripts/build-functions.mjs`,
  `build:functions` script, `@supabase/supabase-js` dep, `VITE_SUPABASE_*`.
- `.github/workflows/deploy.yml` (GitHub Pages) and the `gh-pages`/Pages config.
- The OCC `version` retry loops, `sync_presence`/presence-reporter/heartbeat code,
  `reconcilePresence` call sites, `tick`/`pg_cron`, and the `VITE_BACKEND` flag.

---

## 11. Risks & open questions

| Risk | Mitigation |
|---|---|
| **Auth scheme** is net-new and security-sensitive | Spike it first (C0); keep it dead-simple (signed random uid); token as first WS frame, not query param |
| Losing Supabase's free OAuth-upgrade path | Token scheme is explicitly upgrade-friendly (§4.1); revisit only if real accounts are needed |
| Hibernatable WebSocket lifecycle subtleties (eviction mid-round) | Persist `state`+`secrets` on every commit so any rehydrate is lossless; the authority already supports this |
| D1 maturity / limits for profiles | Profiles are tiny and low-QPS; D1 fits comfortably. Could fall back to a DO-backed KV if needed |
| Live room browser without Realtime | Lobby DO + WS for parity, or just poll `GET /rooms` (a lobby tolerates a few seconds of staleness) |
| Cost model change (DO requests/duration, WS) | Idle rooms hibernate (no socket = ~zero cost); estimate before C3 |
| Region/latency for D1 vs DO | DO state is the hot path (co-located); D1 is only touched on join/settle/wallet, off the per-intention path |
| WS + Static Assets on one Worker | Supported; route API/WS first, assets last. Verify WS over the custom domain in C0 before committing |
| `base: '/beikao/'` → `'/'` breaks old deep links | The app is hash-routed and ephemeral (no durable room URLs to honour); ship base change with C2, history-mode optional later |
| Custom domain / DNS cutover | Domain must be on Cloudflare (orange-cloud); add the route in C0 on a preview/`workers.dev` host, point the real domain in C3 |

## 12. Bottom line

The hard parts — server-authoritative design, a hydratable authority, the pluggable
`Session` seam, and (just now) the latency-masking UX — are **already done**. This
revision commits the *whole* stack to Cloudflare: one Worker serves the SPA and the API
same-origin, Durable Objects hold each room (deleting the OCC/presence/cron subsystems
that only existed to work around stateless functions), D1 holds profiles + the room
directory, and `release/worker` is the deploy branch that ships it all via one
`wrangler deploy`. The one genuinely new build is the identity/auth scheme; everything
else is a port behind interfaces that already exist. Net: a focused, multi-day, phased
effort on `release/worker` — not a rewrite — with a real latency payoff on top of the cleanup.

---

## Appendix: immediate next steps

1. **`release/worker` branch created** ✅ (this is where the work lands).
2. Push `release/worker` to the private GitHub repo so Cloudflare can see it. (User action.)
3. Scaffold **Phase C0** on `release/worker`: `wrangler.toml` (Static Assets + DO) + a
   `cloudflare/src/worker.ts` stub (`/api/health`, `/api/auth/anon`, `/api/room/:code` WS
   echo), `wrangler` + `@cloudflare/workers-types` devDeps, `.nvmrc=22`, eslint ignore for
   `cloudflare/`. *(Deferred — we're planning now; implement when ready.)*
4. In the Cloudflare dashboard: **Workers & Pages → Create → Workers → Import a
   repository** → pick the private repo → set production branch `release/worker`, build
   command `npm run build`, deploy command `npx wrangler deploy`, Node 22. (User action —
   needs the Cloudflare account; the Cloudflare GitHub app grants scoped access.)
5. Measure WS round-trip latency vs. the ~1.3s baseline. **Gate the rest on that number.**
6. Later (C1/C3): `wrangler d1 create beikao`, add the D1 binding + custom domain.
