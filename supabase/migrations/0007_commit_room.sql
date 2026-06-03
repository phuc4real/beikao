-- Phase 3 — latency + atomicity: commit a room's new state + secrets in ONE call.
--
-- The Edge Functions previously issued two sequential PostgREST writes per
-- mutation (update rooms, then update room_secrets). That's two network round
-- trips, and it's not atomic — if the second failed after the first committed,
-- the room's published state and its private deck seed diverged.
--
-- This function does both in a single transaction, gated on the optimistic
-- concurrency check (version). Returns the new version on success, or NULL if
-- the caller lost the race (row advanced underneath them — they should reload
-- and retry). One round trip, atomic, OCC-safe.
--
-- SECURITY DEFINER + service_role-only: only the Edge Functions (server) commit
-- authoritative state; clients never call this.
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
  p_round_counter    integer
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

  -- Lost the optimistic-concurrency race: don't touch secrets, signal retry.
  if new_version is null then
    return null;
  end if;

  update public.room_secrets set
    pending_seed_hex     = p_seed_hex,
    pending_player_seeds = p_player_seeds,
    round_counter        = p_round_counter
  where code = p_code;

  return new_version;
end;
$$;

revoke all on function public.commit_room(text, integer, jsonb, room_status, game_mode, text, integer, integer, timestamptz, timestamptz, text, jsonb, integer) from public, anon, authenticated;
grant execute on function public.commit_room(text, integer, jsonb, room_status, game_mode, text, integer, integer, timestamptz, timestamptz, text, jsonb, integer) to service_role;
