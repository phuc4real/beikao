import { create } from 'zustand';
import type { RoomConfig, RoomState } from '@/features/room/types';
import type { Intention } from '@/network/protocol/messages';
import { HostSession } from '@/app/session/hostSession';
import { ClientSession } from '@/app/session/clientSession';
import type { ConnStatus, Session, SessionHooks } from '@/app/session/types';
import { genRoomCode } from '@/utils/id';
import { clearSession, getPlayerId, loadSession, saveSession, setStoredName } from '@/utils/storage';

interface AppState {
  room: RoomState | null;
  me: { playerId: string; name: string } | null;
  status: ConnStatus;
  /** Fatal connection error (room not found, closed, etc.). */
  fatal: string | null;
  /** Transient notice (bet rejected, etc.) shown then cleared by the UI. */
  notice: string | null;

  createRoom: (name: string, config?: Partial<RoomConfig>) => void;
  joinRoom: (code: string, name: string, asSpectator?: boolean) => void;
  /** Auto-rejoin a stored room after a page reload (clients only). */
  tryReconnect: () => boolean;
  leave: () => void;

  updateConfig: (config: Partial<RoomConfig>) => void;

  setReady: (ready: boolean) => void;
  placeBet: (amount: number) => void;
  clearBet: () => void;
  startRound: () => void;
  closeBetting: () => void;
  nextRound: () => void;
  backToLobby: () => void;
  sendChat: (text: string) => void;
  sendSeed: (seed: string) => void;
  sendReaction: (emoji: string) => void;

  clearNotice: () => void;
  /** True if I am the cái/host of the current room. */
  isHost: () => boolean;
}

let session: Session | null = null;

export const useGame = create<AppState>((set, get) => {
  const hooks = (name: string): SessionHooks => ({
    onState: (state) => set({ room: state }),
    onStatus: (status, detail) =>
      set((s) => ({
        status,
        fatal: status === 'error' || status === 'closed' ? detail ?? s.fatal : null,
      })),
    onServerMessage: (msg) => {
      if (msg.type === 'WELCOME') {
        set({ me: { playerId: msg.playerId, name } });
      } else if (msg.type === 'ERROR') {
        set({ notice: msg.reason });
      } else if (msg.type === 'CLOSED') {
        clearSession();
        set({ fatal: msg.reason });
      }
    },
  });

  // A failed connection means the stored session is stale — don't loop on reload.
  const hooksWithSessionGuard = (name: string): SessionHooks => {
    const base = hooks(name);
    return {
      ...base,
      onStatus: (status, detail) => {
        if (status === 'error' || status === 'closed') clearSession();
        base.onStatus(status, detail);
      },
    };
  };

  const dispatch = (intention: Intention) => session?.send(intention);

  return {
    room: null,
    me: null,
    status: 'idle',
    fatal: null,
    notice: null,

    createRoom: (name, config) => {
      session?.leave();
      const roomId = genRoomCode();
      const playerId = getPlayerId();
      setStoredName(name);
      // Host authority state can't survive a reload, so don't mark the session
      // as rejoinable — a host reload starts fresh.
      saveSession({ roomId, name, isHost: true, spectator: false });
      set({ status: 'connecting', fatal: null, notice: null, me: { playerId, name }, room: null });
      session = new HostSession(roomId, playerId, name, config ?? {}, hooksWithSessionGuard(name));
    },

    joinRoom: (code, name, asSpectator = false) => {
      session?.leave();
      const roomId = code.trim().toUpperCase();
      const playerId = getPlayerId();
      setStoredName(name);
      saveSession({ roomId, name, isHost: false, spectator: asSpectator });
      set({ status: 'connecting', fatal: null, notice: null, me: { playerId, name }, room: null });
      session = new ClientSession(roomId, playerId, name, asSpectator, hooksWithSessionGuard(name));
    },

    tryReconnect: () => {
      const stored = loadSession();
      // Only clients can rejoin — a host's authoritative room is gone on reload.
      if (!stored || stored.isHost) {
        clearSession();
        return false;
      }
      get().joinRoom(stored.roomId, stored.name, stored.spectator);
      return true;
    },

    leave: () => {
      session?.leave();
      session = null;
      clearSession();
      set({ room: null, me: null, status: 'idle', fatal: null, notice: null });
    },

    updateConfig: (config) => dispatch({ type: 'UPDATE_CONFIG', config }),

    setReady: (ready) => dispatch({ type: 'SET_READY', ready }),
    placeBet: (amount) => dispatch({ type: 'PLACE_BET', amount }),
    clearBet: () => dispatch({ type: 'CLEAR_BET' }),
    startRound: () => dispatch({ type: 'START_ROUND' }),
    closeBetting: () => dispatch({ type: 'CLOSE_BETTING' }),
    nextRound: () => dispatch({ type: 'NEXT_ROUND' }),
    backToLobby: () => dispatch({ type: 'BACK_TO_LOBBY' }),
    sendChat: (text) => dispatch({ type: 'CHAT', text }),
    sendSeed: (seed) => dispatch({ type: 'PLAYER_SEED', seed }),
    sendReaction: (emoji) => dispatch({ type: 'REACTION', emoji }),

    clearNotice: () => set({ notice: null }),
    isHost: () => {
      const { room, me } = get();
      return !!room && !!me && room.hostId === me.playerId;
    },
  };
});

/** Selector helper: my player record in the current room (if any). */
export function selectMe(state: AppState) {
  if (!state.room || !state.me) return undefined;
  return state.room.players.find((p) => p.id === state.me!.playerId);
}

/** True if I'm watching as a spectator (not a seated player). */
export function selectIsSpectator(state: AppState): boolean {
  if (!state.room || !state.me) return false;
  return state.room.spectators.some((s) => s.id === state.me!.playerId);
}
