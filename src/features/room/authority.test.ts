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

  it('only the host may start a round', () => {
    const { authority, getState } = makeAuthority();
    active = authority;
    authority.join('con', 'Bình');
    authority.submit('con', { type: 'SET_READY', ready: true });
    authority.submit('con', { type: 'START_ROUND' }); // con is not the cái
    expect(getState().status).toBe('LOBBY');
  });
});
