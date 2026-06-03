import { genId } from './id';

const PLAYER_ID_KEY = 'beikao.playerId';
const NAME_KEY = 'beikao.name';
const SESSION_KEY = 'beikao.session';

function safeGet(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function safeSet(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* storage unavailable (private mode / quota) — degrade silently */
  }
}

function safeRemove(key: string): void {
  try {
    localStorage.removeItem(key);
  } catch {
    /* ignore */
  }
}

/** A stable per-browser player id, persisted so reconnection keeps the seat. */
export function getPlayerId(): string {
  const existing = safeGet(PLAYER_ID_KEY);
  if (existing) return existing;
  const id = genId();
  safeSet(PLAYER_ID_KEY, id);
  return id;
}

/** Remembered display name so the player never has to retype it. */
export function getStoredName(): string {
  return safeGet(NAME_KEY) ?? '';
}

export function setStoredName(name: string): void {
  safeSet(NAME_KEY, name.trim().slice(0, 20));
}

/** Enough to silently rejoin the same room/seat after a reload. */
export interface StoredSession {
  roomId: string;
  name: string;
  isHost: boolean;
}

export function saveSession(s: StoredSession): void {
  safeSet(SESSION_KEY, JSON.stringify(s));
}

export function loadSession(): StoredSession | null {
  const raw = safeGet(SESSION_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<StoredSession>;
    if (typeof parsed.roomId === 'string' && typeof parsed.name === 'string') {
      return { roomId: parsed.roomId, name: parsed.name, isHost: !!parsed.isHost };
    }
  } catch {
    /* corrupt — fall through */
  }
  return null;
}

export function clearSession(): void {
  safeRemove(SESSION_KEY);
}
