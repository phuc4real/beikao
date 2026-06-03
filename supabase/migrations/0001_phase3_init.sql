-- Phase 3 — Supabase backend, step 3a (foundation).
-- See TDD.md §19. Server-authoritative Bài cào: the authority + engine run in
-- the `intent` Edge Function (service_role); browsers read state via Realtime
-- and send intentions via RPC. They never write game state directly.
--
-- Design note (deviation from TDD §19.4's fully-normalized sketch): we persist
-- the authoritative RoomState as a single `state` jsonb blob. This lets the
-- Edge Function reuse the existing, fully-tested GameAuthority almost verbatim
-- (its broadcast() writes `state`; hidden hands are already kept OUT of
-- RoomState until REVEAL, so the blob is safe to publish). Private deal secrets
-- live in `room_secrets`, which is never published and not anon-readable.
-- Normalized tables for leaderboards/analytics can be added later (3d) without
-- changing this contract.

-- ── enums ──────────────────────────────────────────────────────────────────
create type room_status as enum ('LOBBY', 'BETTING', 'REVEAL', 'CLOSED');
create type game_mode   as enum ('CAO_CAI', 'CAO_RUA');

-- ── rooms: one row per room, holds the broadcastable RoomState ───────────────
create table public.rooms (
  code          text primary key,                 -- room code, e.g. "BAC-7QK2" (== RoomState.id)
  name          text,                              -- room title for the discovery browser
  host_id       text not null,                     -- player id of the creator (the cái)
  cai_id        text not null,                     -- current dealer
  status        room_status not null default 'LOBBY',
  mode          game_mode   not null default 'CAO_CAI',
  is_public     boolean     not null default true, -- listed in the room browser (§19.9)
  player_count  integer     not null default 1,    -- connected seats, denormalized for the list
  max_players   integer     not null default 16,
  state         jsonb       not null,              -- full RoomState (no hidden hands until REVEAL)
  version       integer     not null default 1,    -- optimistic-concurrency guard
  ends_at       timestamptz,                       -- betting deadline (for the cron tick)
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- Discovery list query: public rooms still in the lobby, freshest first.
create index rooms_discovery_idx on public.rooms (status, is_public, updated_at desc);
-- Cron tick: find betting rooms whose deadline has passed.
create index rooms_deadline_idx on public.rooms (status, ends_at) where status = 'BETTING';

-- ── room_secrets: private deal state, NEVER published / never anon-readable ──
create table public.room_secrets (
  code                 text primary key references public.rooms (code) on delete cascade,
  pending_seed_hex     text,                                   -- committed host seed (hidden until REVEAL)
  pending_player_seeds jsonb   not null default '{}'::jsonb,    -- con entropy collected during betting
  round_counter        integer not null default 0
);

-- ── Row-Level Security ───────────────────────────────────────────────────────
alter table public.rooms        enable row level security;
alter table public.room_secrets enable row level security;

-- Anyone may READ a room's public state by code (the state carries no secrets —
-- hidden hands/seeds are never in it). Writes are service_role only (no policy
-- below ⇒ denied; the Edge Function bypasses RLS with the service-role key).
-- NOTE: until Auth lands (3d) we can't scope reads by membership, so a private
-- room is "unlisted", not cryptographically hidden — matching the P2P model
-- where anyone with the code can join. See §19.9.
create policy rooms_read_anon on public.rooms
  for select to anon, authenticated
  using (true);

-- room_secrets: no policies at all ⇒ unreadable/unwritable by anon & authenticated.
-- Only the service_role (Edge Functions) touches it.

-- ── Discovery view: only directory columns of public, joinable rooms ─────────
create view public.room_directory as
  select code, name, mode, status, player_count, max_players, created_at
  from public.rooms
  where is_public = true and status = 'LOBBY';

grant select on public.room_directory to anon, authenticated;

-- ── Realtime: publish room rows (state changes fan out to subscribers). ──────
-- room_secrets is deliberately NOT added, so deal secrets never hit the wire.
alter publication supabase_realtime add table public.rooms;

comment on table  public.rooms        is 'Bài cào rooms; state is the broadcastable RoomState. Phase 3 / TDD §19.';
comment on table  public.room_secrets is 'Private per-room deal secrets (seeds). Never published, never anon-readable.';
comment on view   public.room_directory is 'Public, in-lobby rooms for the active-room-discovery browser (§19.9).';
