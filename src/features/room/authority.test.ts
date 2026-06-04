// @vitest-environment node
// beginRound awaits a Web Crypto SHA-256 commitment; run in Node's realm so
// crypto.subtle accepts the buffer (jsdom's globals fail Node's cross-realm check).
import { afterEach, describe, expect, it } from 'vitest';
import { GameAuthority } from './authority';
import type { RoomState } from './types';
import type { ServerMessage } from '@/network/protocol/messages';

function makeAuthority() {
  let state: RoomState | null = null;
  const errors: ServerMessage[] = [];
  const authority = new GameAuthority({
    roomId: 'BAC-TEST',
    hostId: 'host',
    hostName: 'Cái',
    config: { startingBalance: 1000, minBet: 10, maxBet: 500, bettingSeconds: 999 },
    callbacks: {
      broadcast: (s) => {
        state = s;
      },
      sendTo: (_pid, msg) => {
        if (msg.type === 'ERROR') errors.push(msg);
      },
    },
  });
  return { authority, getState: () => state!, errors };
}

let active: GameAuthority | null = null;
afterEach(() => active?.dispose());

/** Round start is async (it awaits the SHA-256 deck commitment); poll until done. */
async function waitFor(cond: () => boolean, timeout = 2000): Promise<void> {
  const start = Date.now();
  while (!cond()) {
    if (Date.now() - start > timeout) throw new Error('waitFor: timed out');
    await new Promise((r) => setTimeout(r, 5));
  }
}

describe('GameAuthority — Cào cái round', () => {
  it('runs lobby → betting → reveal and settles zero-sum', async () => {
    const { authority, getState, errors } = makeAuthority();
    active = authority;

    authority.join('con', 'Bình');
    authority.submit('con', { type: 'SET_READY', ready: true });
    authority.submit('host', { type: 'START_ROUND' });
    await waitFor(() => getState().status === 'BETTING');

    authority.submit('con', { type: 'PLACE_BET', amount: 100 });
    authority.submit('host', { type: 'CLOSE_BETTING' });

    const s = getState();
    expect(s.status).toBe('REVEAL');
    expect(s.round?.hands).toBeDefined();
    expect(s.round?.result).toBeDefined();

    const total = s.players.reduce((sum, p) => sum + p.balance, 0);
    expect(total).toBe(2000); // chips are conserved (zero-sum)

    const con = s.players.find((p) => p.id === 'con')!;
    expect([900, 1100]).toContain(con.balance); // lost or won exactly 100
    expect(errors).toHaveLength(0);
  });

  it('stays in betting (not lobby) and notifies when the cái closes with no bets', async () => {
    const { authority, getState, errors } = makeAuthority();
    active = authority;

    authority.join('con', 'Bình');
    authority.submit('con', { type: 'SET_READY', ready: true });
    authority.submit('host', { type: 'START_ROUND' });
    await waitFor(() => getState().status === 'BETTING');
    authority.submit('host', { type: 'CLOSE_BETTING' }); // nobody bet yet

    const s = getState();
    expect(s.status).toBe('BETTING'); // did NOT drop to lobby
    expect(s.round).not.toBeNull();
    expect(s.round?.endsAt).toBeNull(); // countdown paused
    expect(errors.some((e) => e.type === 'ERROR' && e.code === 'BAD_STATE')).toBe(true);
  });

  it('rejects a bet above balance and a bet from the cái', async () => {
    const { authority, getState, errors } = makeAuthority();
    active = authority;

    authority.join('con', 'Bình');
    authority.submit('con', { type: 'SET_READY', ready: true });
    authority.submit('host', { type: 'START_ROUND' });
    await waitFor(() => getState().status === 'BETTING');

    authority.submit('con', { type: 'PLACE_BET', amount: 999999 });
    authority.submit('host', { type: 'PLACE_BET', amount: 50 }); // cái cannot bet

    expect(errors.some((e) => e.type === 'ERROR' && e.code === 'BET_REJECTED')).toBe(true);
    expect(errors.some((e) => e.type === 'ERROR' && e.code === 'NOT_ALLOWED')).toBe(true);
    expect(getState().round?.bets).toEqual({});
  });

  it('will not start a round without a ready con', () => {
    const { authority, getState, errors } = makeAuthority();
    active = authority;

    authority.join('con', 'Bình'); // not ready
    authority.submit('host', { type: 'START_ROUND' });

    expect(getState().status).toBe('LOBBY');
    expect(errors.some((e) => e.type === 'ERROR' && e.code === 'BAD_STATE')).toBe(true);
  });

  it('enforces the room capacity', () => {
    const { authority, getState } = makeAuthority();
    active = authority;
    // host + 16 cons would exceed maxPlayers (16). The 16th con (17th seat) is rejected.
    for (let i = 0; i < 16; i++) authority.join(`con${i}`, `P${i}`);
    const connected = getState().players.filter((p) => p.connected).length;
    expect(connected).toBe(16);
  });

  it('seats spectators separately; they can chat but not play', () => {
    const { authority, getState } = makeAuthority();
    active = authority;

    authority.join('watcher', 'Xem', true);
    let s = getState();
    expect(s.spectators.some((x) => x.id === 'watcher')).toBe(true);
    expect(s.players.some((p) => p.id === 'watcher')).toBe(false);

    // A spectator may chat...
    authority.submit('watcher', { type: 'CHAT', text: 'gl hf' });
    expect(getState().chat.at(-1)?.text).toBe('gl hf');

    // ...but readying up does nothing (not a seated player; no con becomes ready).
    authority.submit('watcher', { type: 'SET_READY', ready: true });
    s = getState();
    expect(s.players.some((p) => p.id === 'watcher')).toBe(false);
    expect(s.players.filter((p) => !p.isCai).some((p) => p.ready)).toBe(false);
  });

  it('falls back to spectator when the room is full', () => {
    const { authority, getState } = makeAuthority();
    active = authority;
    // host + 15 cons = 16 seats (maxPlayers). The next joiner overflows to spectator.
    for (let i = 0; i < 15; i++) authority.join(`con${i}`, `P${i}`);
    authority.join('overflow', 'Muộn'); // not requesting spectator, but room is full
    const s = getState();
    expect(s.players.filter((p) => p.connected)).toHaveLength(16);
    expect(s.spectators.some((x) => x.id === 'overflow')).toBe(true);
  });

  it('only the host may start a round', () => {
    const { authority, getState } = makeAuthority();
    active = authority;
    authority.join('con', 'Bình');
    authority.submit('con', { type: 'SET_READY', ready: true });
    authority.submit('con', { type: 'START_ROUND' }); // con is not the cái
    expect(getState().status).toBe('LOBBY');
  });
});

describe('GameAuthority — seat ↔ spectator switching', () => {
  it('lets a con step back to watch and a spectator take a seat (lobby)', () => {
    const { authority, getState, errors } = makeAuthority();
    active = authority;

    authority.join('con', 'Bình');
    authority.submit('con', { type: 'BECOME_SPECTATOR' });
    let s = getState();
    expect(s.players.some((p) => p.id === 'con')).toBe(false);
    expect(s.spectators.some((x) => x.id === 'con')).toBe(true);

    authority.submit('con', { type: 'BECOME_PLAYER' });
    s = getState();
    expect(s.spectators.some((x) => x.id === 'con')).toBe(false);
    const seat = s.players.find((p) => p.id === 'con')!;
    expect(seat.ready).toBe(false); // must opt into the next round explicitly
    expect(seat.name).toBe('Bình'); // keeps the (already unique) name
    expect(errors).toHaveLength(0);
  });

  it('blocks switching in either direction during BETTING', async () => {
    const { authority, getState, errors } = makeAuthority();
    active = authority;

    authority.join('con', 'Bình');
    authority.join('watcher', 'Xem', true);
    authority.submit('con', { type: 'SET_READY', ready: true });
    authority.submit('host', { type: 'START_ROUND' });
    await waitFor(() => getState().status === 'BETTING');

    authority.submit('con', { type: 'BECOME_SPECTATOR' });
    authority.submit('watcher', { type: 'BECOME_PLAYER' });

    const s = getState();
    expect(s.players.some((p) => p.id === 'con')).toBe(true); // still seated
    expect(s.spectators.some((x) => x.id === 'watcher')).toBe(true); // still watching
    expect(errors.filter((e) => e.type === 'ERROR' && e.code === 'BAD_STATE')).toHaveLength(2);
  });

  it('allows switching at REVEAL (after the round settles)', async () => {
    const { authority, getState } = makeAuthority();
    active = authority;

    authority.join('con', 'Bình');
    authority.join('watcher', 'Xem', true);
    authority.submit('con', { type: 'SET_READY', ready: true });
    authority.submit('host', { type: 'START_ROUND' });
    await waitFor(() => getState().status === 'BETTING');
    authority.submit('con', { type: 'PLACE_BET', amount: 100 });
    authority.submit('host', { type: 'CLOSE_BETTING' });
    expect(getState().status).toBe('REVEAL');

    authority.submit('con', { type: 'BECOME_SPECTATOR' });
    authority.submit('watcher', { type: 'BECOME_PLAYER' });

    const s = getState();
    expect(s.spectators.some((x) => x.id === 'con')).toBe(true);
    expect(s.players.some((p) => p.id === 'watcher')).toBe(true);
  });

  it('never lets the cái become a spectator, nor seats past capacity', () => {
    const { authority, getState, errors } = makeAuthority();
    active = authority;

    // Fill the table (host + 15 cons = 16 = maxPlayers); overflow watches.
    for (let i = 0; i < 15; i++) authority.join(`con${i}`, `P${i}`);

    authority.submit('host', { type: 'BECOME_SPECTATOR' });
    expect(getState().players.some((p) => p.isCai)).toBe(true);
    expect(errors.some((e) => e.type === 'ERROR' && e.code === 'NOT_ALLOWED')).toBe(true);

    authority.join('watcher', 'Xem', true);
    authority.submit('watcher', { type: 'BECOME_PLAYER' });

    const s = getState();
    expect(s.players.some((p) => p.id === 'watcher')).toBe(false); // no free seat
    expect(s.spectators.some((x) => x.id === 'watcher')).toBe(true);
    expect(errors.some((e) => e.type === 'ERROR' && e.code === 'ROOM_FULL')).toBe(true);
  });
});
