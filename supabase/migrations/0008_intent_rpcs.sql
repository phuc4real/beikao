-- Phase 3 — latency: collapse the intent path to the minimum DB round trips.
--
-- Evidence (pg_stat_statements + edge logs): the DB does each write in ~1–2ms
-- (commit_room 1.45ms, rooms UPDATE 0.99ms) on a ~2KB state blob, yet a warm
-- `intent` invocation is ~1.3–1.5s. A no-op OPTIONS is already ~240ms. So the
-- cost is the function↔DB network round trip (~550ms each, non-co-located DB),
-- NOT query execution. The only code lever is to issue FEWER round trips.
--
-- Before this migration a single intention could take THREE sequential trips:
--   JOIN:    loadRoom ‖ loadSecrets  →  getOrCreateBalance  →  commit_room
--   settle:  loadRoom ‖ loadSecrets  →  commit_room          →  record_round_result
-- This migration folds both stragglers server-side so EVERY intention is two
-- trips: one read RPC (`load_room_state`) + one write RPC (`commit_room`).

-- ── 1) one-call read: state + secrets + (optionally) the joiner's balance ────
-- Replaces loadRoom + loadSecrets (+ getOrCreateBalance on JOIN). When a joining
-- player id is passed, it upserts their durable profile in the SAME call and
-- returns the balance, seeding a new profile from the room's startingBalance.
create or replace function public.load_room_state(
  p_code           text,
  p_join_player_id text default null,
  p_join_name      text default null
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  r   record;
  bal bigint;
begin
  select state, version, host_id into r from public.rooms where code = p_code;
  if not found then
    return null;
  end if;

  if p_join_player_id is not null then
    insert into public.profiles (id, name, balance)
      values (p_join_player_id, p_join_name,
              coalesce((r.state->'config'->>'startingBalance')::bigint, 0))
      on conflict (id) do update set name = excluded.name
      returning balance into bal;
  end if;

  return jsonb_build_object(
    'state',    r.state,
    'version',  r.version,
    'host_id',  r.host_id,
    'secrets',  (select jsonb_build_object(
                   'pending_seed_hex',     s.pending_seed_hex,
                   'pending_player_seeds', s.pending_player_seeds,
                   'round_counter',        s.round_counter)
                 from public.room_secrets s where s.code = p_code),
    'balance',  bal
  );
end;
$$;

revoke all on function public.load_room_state(text, text, text) from public, anon, authenticated;
grant execute on function public.load_room_state(text, text, text) to service_role;

-- ── 2) commit_room: optionally record the settled round in the SAME txn ──────
-- Folds the post-commit `record_round_result` round trip into the commit, and
-- makes stats atomic with the state write (previously a separate best-effort
-- call that could be lost). Adding a defaulted param means a new overload, so
-- drop the old signature first to avoid an ambiguous-call error.
drop function if exists public.commit_room(
  text, integer, jsonb, room_status, game_mode, text, integer, integer,
  timestamptz, timestamptz, text, jsonb, integer);

create or replace function public.commit_room(
  p_code             text,
  p_expected_version integer,
  p_state            jsonb,
  p_status           room_status,
  p_mode             game_mode,
  p_cai_id           text,
  p_player_count     integer,
  p_max_players      integer,
  p_ends_at          timestamptz,
  p_empty_since      timestamptz,
  p_seed_hex         text,
  p_player_seeds     jsonb,
  p_round_counter    integer,
  p_round_results    jsonb default null
) returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  new_version integer;
begin
  update public.rooms set
    state        = p_state,
    version      = version + 1,
    status       = p_status,
    mode         = p_mode,
    cai_id       = p_cai_id,
    player_count = p_player_count,
    max_players  = p_max_players,
    ends_at      = p_ends_at,
    empty_since  = p_empty_since,
    updated_at   = now()
  where code = p_code and version = p_expected_version
  returning version into new_version;

  -- Lost the optimistic-concurrency race: don't touch secrets/stats, signal retry.
  if new_version is null then
    return null;
  end if;

  update public.room_secrets set
    pending_seed_hex     = p_seed_hex,
    pending_player_seeds = p_player_seeds,
    round_counter        = p_round_counter
  where code = p_code;

  -- A round just settled: record durable stats in the same transaction.
  if p_round_results is not null then
    perform public.record_round_result(p_round_results);
  end if;

  return new_version;
end;
$$;

revoke all on function public.commit_room(
  text, integer, jsonb, room_status, game_mode, text, integer, integer,
  timestamptz, timestamptz, text, jsonb, integer, jsonb) from public, anon, authenticated;
grant execute on function public.commit_room(
  text, integer, jsonb, room_status, game_mode, text, integer, integer,
  timestamptz, timestamptz, text, jsonb, integer, jsonb) to service_role;
