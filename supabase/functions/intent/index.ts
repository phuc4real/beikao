// Phase 3 — the server-side authority (TDD §19.2 / §19.5).
//
// The whole point: we DON'T reimplement the rules. We load the persisted
// RoomState + secrets, hydrate the SAME GameAuthority the P2P host uses, apply
// one intention, then persist the new state + secrets. The authority already
// guarantees hidden hands stay out of RoomState until REVEAL, so the published
// `rooms.state` is safe. Clients receive the new state via Realtime; the caller
// also gets any targeted WELCOME/ERROR back in this function's HTTP response.

import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2';
// Engine + authority + protocol, bundled from src/ (npm run build:functions).
import { GameAuthority, intentionSchema, DEFAULT_CONFIG } from '../_shared/engine.bundle.js';
import type { AuthorityLike, AuthoritySecrets, Intention, RoomState, ServerMessage } from '../_shared/types.ts';
import { recordRound } from '../_shared/stats.ts';
import { corsHeaders, json } from '../_shared/cors.ts';

interface Body {
  op: 'create' | 'intent' | 'leave' | 'sync_presence';
  roomCode: string;
  playerId: string;
  name: string;
  intention?: unknown;
  config?: Record<string, unknown>;
  isPublic?: boolean;
  roomName?: string;
  /** Explicit in-app leave (vs. a tab-close beacon): delete the room if empty. */
  permanent?: boolean;
  /** sync_presence: the set of player ids currently present on the channel. */
  present?: unknown;
}

interface RoomRow {
  state: RoomState;
  version: number;
  host_id: string;
}

interface Secrets {
  pending_seed_hex: string | null;
  pending_player_seeds: Record<string, string>;
  round_counter: number;
}

const MAX_RETRIES = 3;

function admin(): SupabaseClient {
  return createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    { auth: { persistSession: false } },
  );
}

/** Columns denormalized from RoomState for the discovery list + cron tick. */
function directoryColumns(state: RoomState) {
  const connected = state.players.filter((p) => p.connected).length;
  const nowIso = new Date().toISOString();
  return {
    status: state.status,
    mode: state.config.mode,
    cai_id: state.caiId,
    player_count: connected,
    max_players: state.config.maxPlayers,
    ends_at: state.round?.endsAt != null ? new Date(state.round.endsAt).toISOString() : null,
    // Mark when the room becomes empty so the reaper can delete it after a grace.
    empty_since: connected === 0 ? nowIso : null,
    updated_at: nowIso,
  };
}

/**
 * Hydrate the authority from persisted state, apply `action`, and return the
 * resulting state/secrets plus any messages targeted at the acting player.
 */
async function applyToAuthority(
  state: RoomState,
  secrets: AuthoritySecrets,
  hostId: string,
  actingPlayerId: string,
  action: (auth: AuthorityLike) => void | Promise<void>,
): Promise<{ state: RoomState; secrets: AuthoritySecrets; server: ServerMessage[] }> {
  const server: ServerMessage[] = [];
  const auth: AuthorityLike = new GameAuthority({
    roomId: state.id,
    hostId,
    hostName: '',
    snapshot: state,
    secrets,
    useTimers: false,
    callbacks: {
      broadcast: () => undefined, // we read auth.getState() after the action resolves
      sendTo: (pid: string, msg: ServerMessage) => {
        if (pid === actingPlayerId) server.push(msg);
      },
    },
  });
  await action(auth); // await: START_ROUND/NEXT_ROUND finish the deck commitment first
  return { state: auth.getState(), secrets: auth.getSecrets(), server };
}

function welcome(playerId: string, roomId: string): ServerMessage {
  return { v: 1, type: 'WELCOME', playerId, roomId };
}

/** A player's durable chip balance (creating the profile with `grant` if new). */
async function profileBalance(db: SupabaseClient, id: string, name: string, grant: number): Promise<number> {
  const { data } = await db.rpc('get_or_create_profile', { p_id: id, p_name: name, p_default: grant });
  return typeof data === 'number' ? data : grant;
}

// ── operations ───────────────────────────────────────────────────────────────

async function createRoom(db: SupabaseClient, body: Body): Promise<Response> {
  const config = { ...DEFAULT_CONFIG, ...(body.config ?? {}) };
  const server: ServerMessage[] = [];
  const auth = new GameAuthority({
    roomId: body.roomCode,
    hostId: body.playerId,
    hostName: body.name,
    config,
    useTimers: false,
    callbacks: { broadcast: () => undefined, sendTo: () => undefined },
  });
  // Seed the host's chip stack from their durable profile (chips follow them).
  auth.setBalance(body.playerId, await profileBalance(db, body.playerId, body.name, config.startingBalance));
  const state = auth.getState();
  const secrets = auth.getSecrets();

  const { error } = await db.from('rooms').insert({
    code: body.roomCode,
    name: body.roomName ?? `Bàn của ${body.name}`,
    host_id: body.playerId,
    is_public: body.isPublic ?? true,
    state,
    version: state.version,
    ...directoryColumns(state),
  });
  if (error) {
    // 23505 = unique_violation: the code is already taken.
    const taken = (error as { code?: string }).code === '23505';
    return json({ ok: false, error: taken ? 'Mã phòng đã tồn tại' : 'Không tạo được phòng' }, taken ? 409 : 500);
  }
  await db.from('room_secrets').insert({
    code: body.roomCode,
    pending_seed_hex: secrets.pendingSeedHex,
    pending_player_seeds: secrets.pendingPlayerSeeds,
    round_counter: secrets.roundCounter,
  });

  server.push(welcome(body.playerId, body.roomCode));
  return json({ ok: true, state, server });
}

async function runIntent(db: SupabaseClient, body: Body, intention: Intention): Promise<Response> {
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    const { data: room } = await db
      .from('rooms')
      .select('state, version, host_id')
      .eq('code', body.roomCode)
      .maybeSingle<RoomRow>();
    if (!room) return json({ ok: false, error: 'Không tìm thấy phòng' }, 404);
    const wasBetting = room.state.status === 'BETTING';

    const { data: sec } = await db
      .from('room_secrets')
      .select('pending_seed_hex, pending_player_seeds, round_counter')
      .eq('code', body.roomCode)
      .maybeSingle<Secrets>();
    const secrets: AuthoritySecrets = {
      pendingSeedHex: sec?.pending_seed_hex ?? null,
      pendingPlayerSeeds: sec?.pending_player_seeds ?? {},
      roundCounter: sec?.round_counter ?? 0,
    };

    // A joining player brings their durable balance; seed it after the seat exists.
    const joinBalance =
      intention.type === 'JOIN'
        ? await profileBalance(db, body.playerId, body.name, room.state.config.startingBalance)
        : null;

    const next = await applyToAuthority(room.state, secrets, room.host_id, body.playerId, async (auth) => {
      await auth.submit(body.playerId, intention);
      if (joinBalance !== null) auth.setBalance(body.playerId, joinBalance);
    });

    // Optimistic concurrency: only write if the row hasn't changed underneath us.
    const { data: updated } = await db
      .from('rooms')
      .update({
        state: next.state,
        version: room.version + 1,
        ...directoryColumns(next.state),
      })
      .eq('code', body.roomCode)
      .eq('version', room.version)
      .select('code');

    if (!updated || updated.length === 0) continue; // lost the race — reload & retry

    await db.from('room_secrets').update({
      pending_seed_hex: next.secrets.pendingSeedHex,
      pending_player_seeds: next.secrets.pendingPlayerSeeds,
      round_counter: next.secrets.roundCounter,
    }).eq('code', body.roomCode);

    // A round just settled (BETTING → REVEAL): record durable stats.
    if (wasBetting && next.state.status === 'REVEAL') await recordRound(db, next.state);

    const server = [...next.server];
    if (intention.type === 'JOIN') server.unshift(welcome(body.playerId, body.roomCode));
    return json({ ok: true, state: next.state, server });
  }
  return json({ ok: false, error: 'Máy chủ bận, thử lại' }, 409);
}

async function leaveRoom(db: SupabaseClient, body: Body): Promise<Response> {
  const { data: room } = await db
    .from('rooms')
    .select('state, version, host_id')
    .eq('code', body.roomCode)
    .maybeSingle<RoomRow>();
  if (!room) return json({ ok: true });

  const next = await applyToAuthority(room.state, { pendingSeedHex: null, pendingPlayerSeeds: {}, roundCounter: 0 }, room.host_id, body.playerId, (auth) =>
    auth.disconnect(body.playerId),
  );

  const connected = next.state.players.filter((p) => p.connected).length;
  // Last person leaving on purpose (the in-app "leave") closes the room now.
  // A tab-close beacon (permanent !== true) only marks them disconnected so a
  // reload can reconnect; the reaper deletes it later if it stays empty.
  if (connected === 0 && body.permanent) {
    await db.from('rooms').delete().eq('code', body.roomCode);
    return json({ ok: true, deleted: true });
  }

  await db.from('rooms').update({ state: next.state, version: room.version + 1, ...directoryColumns(next.state) }).eq('code', body.roomCode);
  return json({ ok: true });
}

/**
 * Reconcile every seat's connected flag against the present set (from Realtime
 * Presence, pushed by the reporter client). Also bumps the row so the reaper
 * sees the room is alive. Does NOT touch room_secrets (the committed deck seed
 * is preserved across this write).
 */
async function syncPresence(db: SupabaseClient, body: Body): Promise<Response> {
  const present = Array.isArray(body.present)
    ? body.present.filter((x): x is string => typeof x === 'string')
    : [];
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    const { data: room } = await db
      .from('rooms')
      .select('state, version, host_id')
      .eq('code', body.roomCode)
      .maybeSingle<RoomRow>();
    if (!room) return json({ ok: true }); // room already gone

    const next = await applyToAuthority(
      room.state,
      { pendingSeedHex: null, pendingPlayerSeeds: {}, roundCounter: 0 },
      room.host_id,
      body.playerId,
      (auth) => auth.reconcilePresence(present),
    );

    const { data: updated } = await db
      .from('rooms')
      .update({ state: next.state, version: room.version + 1, ...directoryColumns(next.state) })
      .eq('code', body.roomCode)
      .eq('version', room.version)
      .select('code');
    if (updated && updated.length > 0) return json({ ok: true });
  }
  return json({ ok: true }); // contention — the next heartbeat reconciles
}

// ── entrypoint ─────────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ ok: false, error: 'POST only' }, 405);

  let body: Body;
  try {
    body = await req.json();
  } catch {
    return json({ ok: false, error: 'Bad JSON' }, 400);
  }
  if (!body.roomCode || !body.playerId) return json({ ok: false, error: 'Missing room/player' }, 400);

  const db = admin();
  try {
    switch (body.op) {
      case 'create':
        return await createRoom(db, body);
      case 'leave':
        return await leaveRoom(db, body);
      case 'sync_presence':
        return await syncPresence(db, body);
      case 'intent': {
        const parsed = intentionSchema.safeParse(body.intention);
        if (!parsed.success) return json({ ok: false, error: 'Lệnh không hợp lệ' }, 400);
        return await runIntent(db, body, parsed.data);
      }
      default:
        return json({ ok: false, error: 'Unknown op' }, 400);
    }
  } catch (e) {
    return json({ ok: false, error: `Lỗi máy chủ: ${e instanceof Error ? e.message : 'unknown'}` }, 500);
  }
});
