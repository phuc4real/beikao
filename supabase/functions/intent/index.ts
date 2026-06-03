// Phase 3 — the server-side authority (TDD §19.2 / §19.5).
//
// The whole point: we DON'T reimplement the rules. We load the persisted
// RoomState + secrets, hydrate the SAME GameAuthority the app engine uses, apply
// one intention, then persist the new state + secrets. The authority already
// guarantees hidden hands stay out of RoomState until REVEAL, so the published
// `rooms.state` is safe. Clients receive the new state via Realtime; the caller
// also gets any targeted WELCOME/ERROR back in this function's HTTP response.
//
// DB access is supabase-js/PostgREST (see _shared/db.ts). The function↔DB
// network round trip is the dominant cost (the DB itself runs each query in
// ~1-2ms), so each op is kept to the minimum: ONE read RPC (load_room_state)
// + ONE write RPC (commit_room), with stats/balance folded server-side.

// Engine + authority + protocol, bundled from src/ (npm run build:functions).
import { GameAuthority, intentionSchema, DEFAULT_CONFIG } from '../_shared/engine.bundle.js';
import type { AuthorityLike, AuthoritySecrets, Intention, RoomState, ServerMessage } from '../_shared/types.ts';
import { commitRoom, writeRoomOnly, loadRoom, loadRoomState, insertRoom, deleteRoom, getOrCreateBalance } from '../_shared/db.ts';
import { roundResults } from '../_shared/stats.ts';
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

const MAX_RETRIES = 3;

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

// ── operations ───────────────────────────────────────────────────────────────

async function createRoom(body: Body): Promise<Response> {
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
  auth.setBalance(body.playerId, await getOrCreateBalance(body.playerId, body.name, config.startingBalance));
  const state: RoomState = auth.getState();
  const secrets: AuthoritySecrets = auth.getSecrets();

  const err = await insertRoom(
    { code: body.roomCode, name: body.roomName ?? `Bàn của ${body.name}`, hostId: body.playerId, isPublic: body.isPublic ?? true },
    state,
    secrets,
  );
  if (err) {
    // 23505 = unique_violation: the code is already taken.
    const taken = err.code === '23505';
    return json({ ok: false, error: taken ? 'Mã phòng đã tồn tại' : 'Không tạo được phòng' }, taken ? 409 : 500);
  }

  server.push(welcome(body.playerId, body.roomCode));
  return json({ ok: true, state, server });
}

async function runIntent(body: Body, intention: Intention): Promise<Response> {
  const isJoin = intention.type === 'JOIN';
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    // One round trip: state + secrets (+ the joiner's durable balance on JOIN),
    // instead of two parallel reads plus a separate balance lookup.
    const room = isJoin
      ? await loadRoomState(body.roomCode, body.playerId, body.name)
      : await loadRoomState(body.roomCode);
    if (!room) return json({ ok: false, error: 'Không tìm thấy phòng' }, 404);
    const wasBetting = room.state.status === 'BETTING';

    const next = await applyToAuthority(room.state, room.secrets, room.host_id, body.playerId, async (auth) => {
      await auth.submit(body.playerId, intention);
      if (room.balance !== null) auth.setBalance(body.playerId, room.balance);
    });

    // Atomic, OCC-gated write of state + secrets in one round trip — and, when a
    // round just settled (BETTING → REVEAL), the durable stats in the same txn.
    // Returns the new version, or null if the row advanced → reload & retry.
    const results = wasBetting && next.state.status === 'REVEAL' ? roundResults(next.state) : null;
    const committed = await commitRoom(body.roomCode, next.state, next.secrets, room.version, results);
    if (committed == null) continue;

    const server = [...next.server];
    if (intention.type === 'JOIN') server.unshift(welcome(body.playerId, body.roomCode));
    return json({ ok: true, state: next.state, server });
  }
  return json({ ok: false, error: 'Máy chủ bận, thử lại' }, 409);
}

async function leaveRoom(body: Body): Promise<Response> {
  const room = await loadRoom(body.roomCode);
  if (!room) return json({ ok: true });

  const next = await applyToAuthority(room.state, { pendingSeedHex: null, pendingPlayerSeeds: {}, roundCounter: 0 }, room.host_id, body.playerId, (auth) =>
    auth.disconnect(body.playerId),
  );

  const connected = next.state.players.filter((p) => p.connected).length;
  // Last person leaving on purpose (the in-app "leave") closes the room now.
  // A tab-close beacon (permanent !== true) only marks them disconnected so a
  // reload can reconnect; the reaper deletes it later if it stays empty.
  if (connected === 0 && body.permanent) {
    await deleteRoom(body.roomCode);
    return json({ ok: true, deleted: true });
  }

  await writeRoomOnly(body.roomCode, next.state, room.version, false); // rooms only — preserve the deck seed
  return json({ ok: true });
}

/**
 * Reconcile every seat's connected flag against the present set (from Realtime
 * Presence, pushed by the reporter client). Also bumps the row so the reaper
 * sees the room is alive. Does NOT touch room_secrets (the committed deck seed
 * is preserved across this write).
 */
async function syncPresence(body: Body): Promise<Response> {
  const present = Array.isArray(body.present)
    ? body.present.filter((x): x is string => typeof x === 'string')
    : [];
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    const room = await loadRoom(body.roomCode);
    if (!room) return json({ ok: true }); // room already gone

    const next = await applyToAuthority(
      room.state,
      { pendingSeedHex: null, pendingPlayerSeeds: {}, roundCounter: 0 },
      room.host_id,
      body.playerId,
      (auth) => auth.reconcilePresence(present),
    );

    if (await writeRoomOnly(body.roomCode, next.state, room.version, true)) return json({ ok: true });
  }
  return json({ ok: true }); // contention — the next heartbeat reconciles
}

// ── entrypoint ─────────────────────────────────────────────────────────────

// Diagnostic: flips false after the first request this isolate handles, so the
// logs distinguish a COLD invocation (fresh isolate) from a WARM one. Remove
// once latency is understood.
let coldStart = true;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ ok: false, error: 'POST only' }, 405);

  const cold = coldStart;
  coldStart = false;
  const t0 = performance.now();

  let body: Body;
  try {
    body = await req.json();
  } catch {
    return json({ ok: false, error: 'Bad JSON' }, 400);
  }
  if (!body.roomCode || !body.playerId) return json({ ok: false, error: 'Missing room/player' }, 400);

  try {
    switch (body.op) {
      case 'create':
        return await createRoom(body);
      case 'leave':
        return await leaveRoom(body);
      case 'sync_presence':
        return await syncPresence(body);
      case 'intent': {
        const parsed = intentionSchema.safeParse(body.intention);
        if (!parsed.success) return json({ ok: false, error: 'Lệnh không hợp lệ' }, 400);
        return await runIntent(body, parsed.data);
      }
      default:
        return json({ ok: false, error: 'Unknown op' }, 400);
    }
  } catch (e) {
    return json({ ok: false, error: `Lỗi máy chủ: ${e instanceof Error ? e.message : 'unknown'}` }, 500);
  } finally {
    console.log(JSON.stringify({ op: body.op, cold, ms: Math.round(performance.now() - t0) }));
  }
});
