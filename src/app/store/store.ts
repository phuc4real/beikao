import { create } from 'zustand';
import type { ReactionMsg, RoomConfig, RoomState } from '@/features/room/types';
import type { Intention } from '@/network/protocol/messages';
import { SupabaseSession } from '@/app/session/supabaseSession';
import { isSupabaseConfigured } from '@/network/supabase/client';
import { ensureIdentity } from '@/network/supabase/auth';
import type { ConnStatus, Session, SessionHooks } from '@/app/session/types';
import { genRoomCode } from '@/utils/id';
import { clearSession, loadSession, saveSession, setStoredName } from '@/utils/storage';

/** Keep the floating-reaction overlay bounded; they fade after a few seconds. */
const REACTION_CAP = 24;

interface AppState {
  room: RoomState | null;
  me: { playerId: string; name: string } | null;
  /**
   * Ephemeral table reactions (Realtime broadcast, not authoritative state).
   * Transient and client-local — never persisted, capped, cleared on leave.
   */
  reactions: ReactionMsg[];
  status: ConnStatus;
  /** Fatal connection error (room not found, closed, etc.). */
  fatal: string | null;
  /** Transient notice (bet rejected, etc.) shown then cleared by the UI. */
  notice: string | null;
  /**
   * In-flight command intentions, keyed by action (e.g. 'bet', 'ready'). The
   * server round trip is ~1s+, so the UI shows a pending/disabled state for the
   * duration instead of looking frozen. Set true on send, false on response.
   */
  pending: Record<string, boolean>;

  createRoom: (name: string, config?: Partial<RoomConfig>, isPublic?: boolean) => void;
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
    onReaction: (reaction) =>
      set((s) => ({ reactions: [...s.reactions, reaction].slice(-REACTION_CAP) })),
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

  // Fire-and-forget: high-frequency, no pending UI (chat, seeds).
  const dispatch = (intention: Intention) => void session?.send(intention);

  // A user command: flag `key` pending for the whole server round trip so the
  // triggering control can disable + spin. Always clears, even on failure.
  const command = async (key: string, intention: Intention) => {
    if (!session) return;
    set((s) => ({ pending: { ...s.pending, [key]: true } }));
    try {
      await session.send(intention);
    } finally {
      set((s) => ({ pending: { ...s.pending, [key]: false } }));
    }
  };

  return {
    room: null,
    me: null,
    reactions: [],
    status: 'idle',
    fatal: null,
    notice: null,
    pending: {},

    createRoom: async (name, config, isPublic = true) => {
      session?.leave();
      if (!isSupabaseConfigured()) {
        set({ status: 'error', fatal: 'Cần cấu hình Supabase (VITE_SUPABASE_URL / ANON_KEY).' });
        return;
      }
      const roomId = genRoomCode();
      setStoredName(name);
      set({ status: 'connecting', fatal: null, notice: null, room: null, reactions: [] });
      // The id is the (anonymous) auth uid; resolving it is async.
      const playerId = await ensureIdentity();
      set({ me: { playerId, name } });
      // Server-authoritative: room state is durable, so a host CAN rejoin after a
      // reload (handled in tryReconnect as a normal JOIN). `isPublic` controls
      // whether the room is listed in the discovery browser (§19.9).
      saveSession({ roomId, name, isHost: true, spectator: false });
      session = new SupabaseSession(
        { roomId, playerId, name, role: 'host', config: config ?? {}, isPublic },
        hooksWithSessionGuard(name),
      );
    },

    joinRoom: async (code, name, asSpectator = false) => {
      session?.leave();
      if (!isSupabaseConfigured()) {
        set({ status: 'error', fatal: 'Cần cấu hình Supabase (VITE_SUPABASE_URL / ANON_KEY).' });
        return;
      }
      const roomId = code.trim().toUpperCase();
      setStoredName(name);
      saveSession({ roomId, name, isHost: false, spectator: asSpectator });
      set({ status: 'connecting', fatal: null, notice: null, room: null, reactions: [] });
      const playerId = await ensureIdentity();
      set({ me: { playerId, name } });
      session = new SupabaseSession(
        { roomId, playerId, name, role: 'client', spectator: asSpectator },
        hooksWithSessionGuard(name),
      );
    },

    tryReconnect: () => {
      const stored = loadSession();
      if (!stored) return false;
      // State is durable on the server, so anyone (incl. the cái) rejoins via a
      // normal JOIN — the server matches their existing seat by playerId.
      void get().joinRoom(stored.roomId, stored.name, stored.spectator);
      return true;
    },

    leave: () => {
      session?.leave();
      session = null;
      clearSession();
      set({ room: null, me: null, reactions: [], status: 'idle', fatal: null, notice: null, pending: {} });
    },

    updateConfig: (config) => void command('config', { type: 'UPDATE_CONFIG', config }),

    setReady: (ready) => void command('ready', { type: 'SET_READY', ready }),
    placeBet: (amount) => void command('bet', { type: 'PLACE_BET', amount }),
    clearBet: () => void command('bet', { type: 'CLEAR_BET' }),
    startRound: () => void command('start', { type: 'START_ROUND' }),
    closeBetting: () => void command('close', { type: 'CLOSE_BETTING' }),
    nextRound: () => void command('next', { type: 'NEXT_ROUND' }),
    backToLobby: () => void command('lobby', { type: 'BACK_TO_LOBBY' }),
    sendChat: (text) => dispatch({ type: 'CHAT', text }),
    sendSeed: (seed) => dispatch({ type: 'PLAYER_SEED', seed }),
    sendReaction: (emoji) => session?.sendReaction(emoji),

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
