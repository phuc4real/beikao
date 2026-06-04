-- D1 (SQLite) schema — the only cross-room durable data. Ports the Supabase
-- profiles (0003/0004/0011) + room_directory (0001_phase3_init view) to SQLite.
-- Per-room authoritative state lives in the Room Durable Object, not here.
--
-- Apply locally:  npx wrangler d1 migrations apply beikao --local
-- Apply remote:   npx wrangler d1 migrations apply beikao --remote

-- Durable player profiles: cross-room chip balance + cumulative stats.
-- RLS/SECURITY-DEFINER are unnecessary here — D1 is only reachable from the
-- Worker/DO (server side), and wallet credits are keyed to the verified token uid.
CREATE TABLE IF NOT EXISTS profiles (
  id            TEXT PRIMARY KEY,            -- stable player id (the signed-token uid)
  name          TEXT,
  balance       INTEGER NOT NULL DEFAULT 0,  -- durable chip stack (follows the player)
  total_net     INTEGER NOT NULL DEFAULT 0,  -- cumulative net across all rounds
  rounds_played INTEGER NOT NULL DEFAULT 0,
  wins          INTEGER NOT NULL DEFAULT 0,  -- rounds with a positive net
  last_gift_at  TEXT,                        -- VN-time date (YYYY-MM-DD) of last daily gift
  created_at    TEXT NOT NULL,
  updated_at    TEXT NOT NULL
);

-- Live public room browser. Room DOs upsert on state change, delete on close.
-- listDirectory() filters to status='LOBBY' AND is_public AND player_count>0.
CREATE TABLE IF NOT EXISTS room_directory (
  code         TEXT PRIMARY KEY,
  name         TEXT,
  mode         TEXT NOT NULL,
  status       TEXT NOT NULL,
  player_count INTEGER NOT NULL DEFAULT 0,
  max_players  INTEGER NOT NULL DEFAULT 0,
  is_public    INTEGER NOT NULL DEFAULT 1,   -- SQLite boolean (0/1)
  created_at   TEXT NOT NULL,
  updated_at   TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_room_directory_browse
  ON room_directory (status, is_public, created_at DESC);
