// Phase 3 — betting-deadline closer (TDD §19.8).
//
// The server owns the clock. This function is meant to be invoked ~1×/second by
// a scheduler (pg_cron + pg_net, or an external cron) — see supabase/README.md.
// It finds rooms whose betting window has expired and runs the SAME authority's
// close→deal→settle→reveal, then persists. Idempotent: a room already past
// BETTING is skipped. DB access is supabase-js/PostgREST (db.ts).

import { GameAuthority } from '../_shared/engine.bundle.js';
import type { RoomState } from '../_shared/types.ts';
import { commitRoom, loadSecrets, loadExpiredBettingRooms, reapEmptyRooms, sweepDeadRooms, type RoomRow } from '../_shared/db.ts';
import { roundResults } from '../_shared/stats.ts';
import { json, corsHeaders } from '../_shared/cors.ts';

/** Close one room whose betting deadline passed; returns 1 if it advanced. */
async function closeRoom(room: RoomRow & { code: string }, now: number): Promise<number> {
  const secrets = await loadSecrets(room.code);

  const auth = new GameAuthority({
    roomId: room.state.id,
    hostId: room.host_id,
    hostName: '',
    snapshot: room.state,
    secrets,
    useTimers: false,
    callbacks: { broadcast: () => undefined, sendTo: () => undefined },
  });

  if (!auth.tickDeadline(now)) return 0;
  const state: RoomState = auth.getState();
  const nextSecrets = auth.getSecrets();

  // One atomic, OCC-gated write (skips if a player intent already advanced it).
  // A deadline close that reached REVEAL just settled a round → record the
  // durable stats in the same transaction (no extra round trip).
  const results = state.status === 'REVEAL' ? roundResults(state) : null;
  const committed = await commitRoom(room.code, state, nextSecrets, room.version, results);
  if (committed == null) return 0;
  return 1;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const now = Date.now();

  const rooms = await loadExpiredBettingRooms(new Date(now));

  // Close expired rooms concurrently (each is an independent OCC transaction).
  const closedFlags = await Promise.all(rooms.map((room) => closeRoom(room, now)));
  const closed = closedFlags.reduce((a, b) => a + b, 0);

  // Cleanup deletes are independent of each other → run in parallel.
  // - Reap: rooms empty past the grace (a reloaded host reconnects within it).
  //   `empty_since < X` excludes NULL empty_since (NULL comparisons are false).
  // - Sweep: rooms not written to in a long time = every client dropped without
  //   reporting empty (the presence reporter heartbeats ~25s, so stale = dead).
  const EMPTY_GRACE_MS = 30_000;
  const DEAD_MS = 120_000;
  const [reaped, swept] = await Promise.all([
    reapEmptyRooms(new Date(now - EMPTY_GRACE_MS)),
    sweepDeadRooms(new Date(now - DEAD_MS)),
  ]);

  return json({ ok: true, closed, reaped, swept });
});
