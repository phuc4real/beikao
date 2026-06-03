// Supabase data layer for the Edge Functions.
//
// Transport: supabase-js (PostgREST), NOT a direct Postgres connection. A direct
// postgres.js connection was tried and regressed badly: during normal play every
// request runs in a fresh (cold) isolate, and opening a new Postgres connection
// (TLS + SCRAM to the DB) cost ~900ms PER cold request. PostgREST is plain HTTP
// and connects instantly, so it's the better baseline here.
//
// The dominant cost is the function↔DB network round trip, NOT query execution
// (pg_stat_statements: each write runs in ~1-2ms server-side, yet a warm
// invocation is ~1.3s — the DB isn't co-located with the function). So we issue
// the FEWEST possible round trips: one read RPC (load_room_state) + one write
// RPC (commit_room) per intention. Real 10x fix is region co-location (README).
import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2';
import type { AuthoritySecrets, RoomState } from './types.ts';
import type { RoundResult } from './stats.ts';

// Module scope: reused across warm invocations.
export const supa: SupabaseClient = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  { auth: { persistSession: false } },
);

export interface RoomRow {
  state: RoomState;
  version: number;
  host_id: string;
}

// jsonb usually arrives parsed; tolerate a string just in case (cheap safety).
function asObj<T>(v: unknown, fallback: T): T {
  if (v == null) return fallback;
  return typeof v === 'string' ? (JSON.parse(v) as T) : (v as T);
}

/** Load a room by code, `state` guaranteed parsed. Null if it doesn't exist. */
export async function loadRoom(code: string): Promise<RoomRow | null> {
  const { data } = await supa.from('rooms').select('state, version, host_id').eq('code', code).maybeSingle();
  if (!data) return null;
  return { state: asObj<RoomState>(data.state, {} as RoomState), version: data.version, host_id: data.host_id };
}

export interface RoomLoad extends RoomRow {
  secrets: AuthoritySecrets;
  /** The joining player's durable balance — only when joinPlayerId was passed. */
  balance: number | null;
}

/**
 * One round trip for state + secrets (+ the joiner's durable balance when
 * `joinPlayerId` is given), via the `load_room_state` RPC (migration 0008).
 * Replaces loadRoom ‖ loadSecrets (+ getOrCreateBalance on JOIN) — the network
 * round trip dominates here, so collapsing three calls into one is the win.
 */
export async function loadRoomState(
  code: string,
  joinPlayerId?: string,
  joinName?: string,
): Promise<RoomLoad | null> {
  const { data } = await supa.rpc('load_room_state', {
    p_code: code,
    p_join_player_id: joinPlayerId ?? null,
    p_join_name: joinName ?? null,
  });
  const obj = asObj<Record<string, unknown> | null>(data, null);
  if (!obj || obj.state == null) return null;
  const s = (obj.secrets ?? {}) as Record<string, unknown>;
  return {
    state: obj.state as RoomState,
    version: obj.version as number,
    host_id: obj.host_id as string,
    secrets: {
      pendingSeedHex: (s.pending_seed_hex as string | null) ?? null,
      pendingPlayerSeeds: asObj<Record<string, string>>(s.pending_player_seeds, {}),
      roundCounter: (s.round_counter as number | null) ?? 0,
    },
    balance: typeof obj.balance === 'number' ? obj.balance : null,
  };
}

/** Load a room's private secrets, with defaults if the row is missing. */
export async function loadSecrets(code: string): Promise<AuthoritySecrets> {
  const { data } = await supa
    .from('room_secrets')
    .select('pending_seed_hex, pending_player_seeds, round_counter')
    .eq('code', code)
    .maybeSingle();
  return {
    pendingSeedHex: data?.pending_seed_hex ?? null,
    pendingPlayerSeeds: asObj<Record<string, string>>(data?.pending_player_seeds, {}),
    roundCounter: data?.round_counter ?? 0,
  };
}

/** Betting rooms whose deadline has passed (for the cron tick). */
export async function loadExpiredBettingRooms(now: Date): Promise<(RoomRow & { code: string })[]> {
  const { data } = await supa
    .from('rooms')
    .select('code, state, version, host_id')
    .eq('status', 'BETTING')
    .lte('ends_at', now.toISOString());
  return (data ?? []).map((r) => ({ code: r.code, state: asObj<RoomState>(r.state, {} as RoomState), version: r.version, host_id: r.host_id }));
}

/** Connected-seat count + the timestamps the directory/reaper queries need. */
function dirCols(state: RoomState) {
  const connected = state.players.filter((p) => p.connected).length;
  return {
    connected,
    endsAt: state.round?.endsAt != null ? new Date(state.round.endsAt).toISOString() : null,
    emptySince: connected === 0 ? new Date().toISOString() : null,
  };
}

/**
 * Atomically commit a new RoomState + secrets in ONE round trip via the
 * `commit_room` RPC (migration 0007/0008), gated on the optimistic-concurrency
 * version. When `roundResults` is given (a round just settled), the durable
 * stats are recorded in the SAME transaction — no extra round trip, atomic with
 * the commit. Returns the new version, or null if the row advanced underneath us.
 */
export async function commitRoom(
  code: string,
  state: RoomState,
  secrets: AuthoritySecrets,
  expectedVersion: number,
  roundResults?: RoundResult[] | null,
): Promise<number | null> {
  const { connected, endsAt, emptySince } = dirCols(state);
  const { data } = await supa.rpc('commit_room', {
    p_code: code,
    p_expected_version: expectedVersion,
    p_state: state,
    p_status: state.status,
    p_mode: state.config.mode,
    p_cai_id: state.caiId,
    p_player_count: connected,
    p_max_players: state.config.maxPlayers,
    p_ends_at: endsAt,
    p_empty_since: emptySince,
    p_seed_hex: secrets.pendingSeedHex,
    p_player_seeds: secrets.pendingPlayerSeeds,
    p_round_counter: secrets.roundCounter,
    p_round_results: roundResults ?? null,
  });
  return typeof data === 'number' ? data : null;
}

/**
 * Update ONLY the rooms row (never room_secrets — preserves the committed deck
 * seed). Used by leave/presence. `occ` adds the version guard and returns false
 * on a lost race; without it the update is unconditional.
 */
export async function writeRoomOnly(code: string, state: RoomState, currentVersion: number, occ: boolean): Promise<boolean> {
  const { connected, endsAt, emptySince } = dirCols(state);
  let q = supa
    .from('rooms')
    .update({
      state,
      version: currentVersion + 1,
      status: state.status,
      mode: state.config.mode,
      cai_id: state.caiId,
      player_count: connected,
      max_players: state.config.maxPlayers,
      ends_at: endsAt,
      empty_since: emptySince,
      updated_at: new Date().toISOString(),
    })
    .eq('code', code);
  if (occ) q = q.eq('version', currentVersion);
  const { data } = await q.select('code');
  return !!data && data.length > 0;
}

/** Insert a fresh room + its secrets. Returns the rooms-insert error (if any). */
export async function insertRoom(
  row: { code: string; name: string; hostId: string; isPublic: boolean },
  state: RoomState,
  secrets: AuthoritySecrets,
): Promise<{ code?: string } | null> {
  const { connected, endsAt, emptySince } = dirCols(state);
  const { error } = await supa.from('rooms').insert({
    code: row.code,
    name: row.name,
    host_id: row.hostId,
    is_public: row.isPublic,
    state,
    version: state.version,
    status: state.status,
    mode: state.config.mode,
    cai_id: state.caiId,
    player_count: connected,
    max_players: state.config.maxPlayers,
    ends_at: endsAt,
    empty_since: emptySince,
    updated_at: new Date().toISOString(),
  });
  if (error) return error as { code?: string };
  await supa.from('room_secrets').insert({
    code: row.code,
    pending_seed_hex: secrets.pendingSeedHex,
    pending_player_seeds: secrets.pendingPlayerSeeds,
    round_counter: secrets.roundCounter,
  });
  return null;
}

export async function deleteRoom(code: string): Promise<void> {
  await supa.from('rooms').delete().eq('code', code);
}

/** Delete rooms empty past the grace; returns how many. (`< before` skips NULLs.) */
export async function reapEmptyRooms(before: Date): Promise<number> {
  const { data } = await supa.from('rooms').delete().lt('empty_since', before.toISOString()).select('code');
  return data?.length ?? 0;
}

/** Delete rooms not written to in a long time (dead); returns how many. */
export async function sweepDeadRooms(before: Date): Promise<number> {
  const { data } = await supa.from('rooms').delete().lt('updated_at', before.toISOString()).select('code');
  return data?.length ?? 0;
}

/** A player's durable chip balance (creating the profile with `grant` if new). */
export async function getOrCreateBalance(id: string, name: string, grant: number): Promise<number> {
  const { data } = await supa.rpc('get_or_create_profile', { p_id: id, p_name: name, p_default: grant });
  return typeof data === 'number' ? data : grant;
}
