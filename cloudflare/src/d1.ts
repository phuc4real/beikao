// D1 data layer — the only CROSS-room durable data (per-room authoritative state
// lives in the RoomDO, not here). Ports the Postgres profile RPCs + room
// directory from the Supabase migrations (0003/0004/0011) to SQLite. See
// cloudflare_migration_plan.md §4.2.
//
// The "clients never write results" invariant is preserved structurally: these
// run only inside the Worker/DO (service-role equivalent). Wallet credits are
// keyed to the *verified* token uid passed by the Worker, never a client claim.

import type { RoundResultRow } from './stats';

export interface Wallet {
  balance: number;
  /** VN-time date (YYYY-MM-DD) of the last claimed daily gift; null = never. */
  lastGiftAt: string | null;
}

export interface DirectoryRow {
  code: string;
  name: string | null;
  mode: string;
  status: string;
  player_count: number;
  max_players: number;
  created_at: string;
}

/** Asia/Ho_Chi_Minh is a fixed UTC+7 (no DST) → derive the VN calendar day. */
export function vnDay(nowMs: number): string {
  return new Date(nowMs + 7 * 3_600_000).toISOString().slice(0, 10);
}

/**
 * Seed/return a player's durable balance on create/JOIN; creates the profile
 * (granting `def`) if new. Ports get_or_create_profile — the existing balance is
 * preserved on conflict (chips follow the player), only the name is refreshed.
 */
export async function getOrCreateProfile(db: D1Database, id: string, name: string, def: number): Promise<number> {
  const now = new Date().toISOString();
  const row = await db
    .prepare(
      `INSERT INTO profiles (id, name, balance, created_at, updated_at)
       VALUES (?1, ?2, ?3, ?4, ?4)
       ON CONFLICT(id) DO UPDATE SET name = excluded.name, updated_at = excluded.updated_at
       RETURNING balance`,
    )
    .bind(id, name, def, now)
    .first<{ balance: number }>();
  return row?.balance ?? def;
}

/**
 * Record a settled round's per-player net + post-settle balance (ports
 * record_round_result). One batched transaction; upsert-increments stats.
 */
export async function recordRoundResult(db: D1Database, rows: RoundResultRow[]): Promise<void> {
  if (rows.length === 0) return;
  const now = new Date().toISOString();
  const stmt = db.prepare(
    `INSERT INTO profiles (id, name, balance, total_net, rounds_played, wins, created_at, updated_at)
     VALUES (?1, ?2, ?3, ?4, 1, ?5, ?6, ?6)
     ON CONFLICT(id) DO UPDATE SET
       name          = excluded.name,
       balance       = excluded.balance,
       total_net     = profiles.total_net + ?4,
       rounds_played = profiles.rounds_played + 1,
       wins          = profiles.wins + ?5,
       updated_at    = excluded.updated_at`,
  );
  await db.batch(rows.map((r) => stmt.bind(r.id, r.name, r.balance, r.net, r.net > 0 ? 1 : 0, now)));
}

/** A player's wallet for the Home "Số dư" panel (public read; balance isn't secret). */
export async function fetchWallet(db: D1Database, id: string): Promise<Wallet | null> {
  const row = await db
    .prepare(`SELECT balance, last_gift_at FROM profiles WHERE id = ?1`)
    .bind(id)
    .first<{ balance: number; last_gift_at: string | null }>();
  if (!row) return null;
  return { balance: row.balance, lastGiftAt: row.last_gift_at ?? null };
}

/** +2000 to the verified caller's wallet (ports claim_topup). Null if no profile yet. */
export async function claimTopup(db: D1Database, uid: string): Promise<number | null> {
  const row = await db
    .prepare(`UPDATE profiles SET balance = balance + 2000, updated_at = ?2 WHERE id = ?1 RETURNING balance`)
    .bind(uid, new Date().toISOString())
    .first<{ balance: number }>();
  return row?.balance ?? null;
}

/** +1000 once per VN-day (ports claim_daily_gift). Null if already claimed today / no profile. */
export async function claimDailyGift(db: D1Database, uid: string, nowMs: number): Promise<number | null> {
  const today = vnDay(nowMs);
  const row = await db
    .prepare(
      `UPDATE profiles SET balance = balance + 1000, last_gift_at = ?2, updated_at = ?3
       WHERE id = ?1 AND (last_gift_at IS NULL OR last_gift_at < ?2)
       RETURNING balance`,
    )
    .bind(uid, today, new Date(nowMs).toISOString())
    .first<{ balance: number }>();
  return row?.balance ?? null;
}

export interface DirectoryUpsert {
  code: string;
  name: string | null;
  mode: string;
  status: string;
  playerCount: number;
  maxPlayers: number;
  isPublic: boolean;
  createdAt: string;
}

/** Room DOs upsert their directory row on every state change. */
export async function upsertDirectory(db: D1Database, r: DirectoryUpsert): Promise<void> {
  await db
    .prepare(
      `INSERT INTO room_directory (code, name, mode, status, player_count, max_players, is_public, created_at, updated_at)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)
       ON CONFLICT(code) DO UPDATE SET
         name = excluded.name, mode = excluded.mode, status = excluded.status,
         player_count = excluded.player_count, max_players = excluded.max_players,
         is_public = excluded.is_public, updated_at = excluded.updated_at`,
    )
    .bind(r.code, r.name, r.mode, r.status, r.playerCount, r.maxPlayers, r.isPublic ? 1 : 0, r.createdAt, new Date().toISOString())
    .run();
}

export async function deleteDirectory(db: D1Database, code: string): Promise<void> {
  await db.prepare(`DELETE FROM room_directory WHERE code = ?1`).bind(code).run();
}

/** Public, joinable rooms, freshest first (ports the room_directory view filter). */
export async function listDirectory(db: D1Database): Promise<DirectoryRow[]> {
  const { results } = await db
    .prepare(
      `SELECT code, name, mode, status, player_count, max_players, created_at
       FROM room_directory
       WHERE status = 'LOBBY' AND is_public = 1 AND player_count > 0
       ORDER BY created_at DESC LIMIT 50`,
    )
    .all<DirectoryRow>();
  return results ?? [];
}
