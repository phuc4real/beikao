-- Phase 3 — room lifecycle cleanup.
-- Empty rooms (everyone left/disconnected) must disappear from the discovery
-- browser and eventually be deleted. We (a) hide rooms with 0 connected players
-- from the directory immediately, and (b) stamp `empty_since` so the `tick`
-- cron can reap rooms that stay empty past a short grace (a grace, not instant,
-- so a host who merely reloaded reconnects without losing the room).

alter table public.rooms add column empty_since timestamptz;

-- Reaper lookup: rooms that have been empty for a while.
create index rooms_empty_idx on public.rooms (empty_since) where empty_since is not null;

-- Redefine the discovery view to also exclude emptied rooms.
drop view public.room_directory;
create view public.room_directory as
  select code, name, mode, status, player_count, max_players, created_at
  from public.rooms
  where is_public = true and status = 'LOBBY' and player_count > 0;

grant select on public.room_directory to anon, authenticated;

comment on column public.rooms.empty_since is 'When the room last dropped to 0 connected players; null while occupied. Reaped by the tick function after a grace.';
