// Phase 3 — betting-deadline closer (TDD §19.8).
//
// The server owns the clock. This function is meant to be invoked ~1×/second by
// a scheduler (pg_cron + pg_net, or an external cron) — see supabase/README.md.
// It finds rooms whose betting window has expired and runs the SAME authority's
// close→deal→settle→reveal, then persists. Idempotent: a room already past
// BETTING is skipped.

import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2';
import { GameAuthority } from '../_shared/engine.bundle.js';
import type { AuthoritySecrets, RoomState } from '../_shared/types.ts';
import { recordRound } from '../_shared/stats.ts';
import { json, corsHeaders } from '../_shared/cors.ts';

interface Row {
  code: string;
  state: RoomState;
  version: number;
  host_id: string;
}

function admin(): SupabaseClient {
  return createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
    auth: { persistSession: false },
  });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const db = admin();
  const now = Date.now();
  const nowIso = new Date(now).toISOString();

  const { data: rooms } = await db
    .from('rooms')
    .select('code, state, version, host_id')
    .eq('status', 'BETTING')
    .lte('ends_at', nowIso)
    .returns<Row[]>();

  let closed = 0;
  for (const room of rooms ?? []) {
    const { data: sec } = await db
      .from('room_secrets')
      .select('pending_seed_hex, pending_player_seeds, round_counter')
      .eq('code', room.code)
      .maybeSingle<{ pending_seed_hex: string | null; pending_player_seeds: Record<string, string>; round_counter: number }>();

    const secrets: AuthoritySecrets = {
      pendingSeedHex: sec?.pending_seed_hex ?? null,
      pendingPlayerSeeds: sec?.pending_player_seeds ?? {},
      roundCounter: sec?.round_counter ?? 0,
    };

    const auth = new GameAuthority({
      roomId: room.state.id,
      hostId: room.host_id,
      hostName: '',
      snapshot: room.state,
      secrets,
      useTimers: false,
      callbacks: { broadcast: () => undefined, sendTo: () => undefined },
    });

    if (!auth.tickDeadline(now)) continue;
    const state = auth.getState();
    const nextSecrets = auth.getSecrets();

    const { data: updated } = await db
      .from('rooms')
      .update({
        state,
        version: room.version + 1,
        status: state.status,
        ends_at: state.round?.endsAt != null ? new Date(state.round.endsAt).toISOString() : null,
        updated_at: nowIso,
      })
      .eq('code', room.code)
      .eq('version', room.version) // skip if a player intent already advanced it
      .select('code');

    if (updated && updated.length > 0) {
      await db
        .from('room_secrets')
        .update({
          pending_seed_hex: nextSecrets.pendingSeedHex,
          pending_player_seeds: nextSecrets.pendingPlayerSeeds,
          round_counter: nextSecrets.roundCounter,
        })
        .eq('code', room.code);
      // A deadline close that reached REVEAL just settled a round → record stats.
      if (state.status === 'REVEAL') await recordRound(db, state);
      closed += 1;
    }
  }

  // Reap rooms that have sat empty (everyone left/disconnected) past the grace.
  // The grace lets a host who merely reloaded reconnect without losing the room.
  const EMPTY_GRACE_MS = 30_000;
  const reapBefore = new Date(now - EMPTY_GRACE_MS).toISOString();
  const { data: reaped } = await db
    .from('rooms')
    .delete()
    .lt('empty_since', reapBefore) // null empty_since is excluded by `<`
    .select('code');

  // Dead-room sweep: if a room hasn't been written to in a long time, every
  // client has dropped without anyone reporting it empty (presence reporter gone
  // too). The reporter heartbeats every ~25s, so a stale `updated_at` = dead.
  const DEAD_MS = 120_000;
  const deadBefore = new Date(now - DEAD_MS).toISOString();
  const { data: swept } = await db
    .from('rooms')
    .delete()
    .lt('updated_at', deadBefore)
    .select('code');

  return json({ ok: true, closed, reaped: reaped?.length ?? 0, swept: swept?.length ?? 0 });
});
