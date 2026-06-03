-- Phase 3 — fill in two missing indexes for hot query paths.
--
-- Audit of existing coverage:
--   rooms          PK(code) ✓; rooms_discovery_idx(status,is_public,updated_at),
--                  rooms_deadline_idx(status,ends_at) WHERE status='BETTING',
--                  rooms_empty_idx(empty_since) WHERE empty_since IS NOT NULL.
--   room_secrets   PK(code) ✓ — every access is by code.
--   profiles       PK(id) ✓ — get_or_create_profile / record_round_result hit it by id.
--
-- Two query paths were left unindexed:

-- 1) tick() dead-room sweep — `DELETE FROM rooms WHERE updated_at < $deadBefore`
--    (no status filter). Runs every cron tick (~1×/s). The existing
--    rooms_discovery_idx has updated_at as its THIRD column, so a filter on
--    updated_at alone can't use it → sequential scan every second. A plain btree
--    on updated_at turns the sweep into an index range scan.
create index if not exists rooms_updated_at_idx on public.rooms (updated_at);

-- 2) leaderboard view — `SELECT ... FROM profiles WHERE rounds_played > 0
--    ORDER BY total_net DESC LIMIT 50`. No index → seqscan + sort over all
--    profiles. A partial index ordered by total_net DESC matches the predicate
--    and supplies the sort order, so the top-50 read is an index scan + limit.
create index if not exists profiles_leaderboard_idx
  on public.profiles (total_net desc)
  where rounds_played > 0;
