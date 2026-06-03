import { openDB, type IDBPDatabase } from 'idb';
import type { RoundView } from '@/features/room/types';

const DB_NAME = 'beikao';
const STORE = 'rounds';
const VERSION = 1;

interface RoundRecord {
  key: string; // `${roomId}:${roundNumber}`
  roomId: string;
  roundNumber: number;
  round: RoundView;
  savedAt: number;
}

let dbPromise: Promise<IDBPDatabase | null> | null = null;

/**
 * Open the IndexedDB lazily. Returns null (and the callers no-op) when storage
 * is unavailable — private mode, quota, or an environment without IndexedDB —
 * so the game degrades gracefully to in-memory/snapshot history.
 */
function getDB(): Promise<IDBPDatabase | null> {
  if (!dbPromise) {
    dbPromise = (async () => {
      try {
        if (typeof indexedDB === 'undefined') return null;
        return await openDB(DB_NAME, VERSION, {
          upgrade(db) {
            const store = db.createObjectStore(STORE, { keyPath: 'key' });
            store.createIndex('roomId', 'roomId');
          },
        });
      } catch {
        return null;
      }
    })();
  }
  return dbPromise;
}

/** Persist completed rounds for a room (idempotent, keyed by round number). */
export async function saveRounds(roomId: string, rounds: readonly RoundView[]): Promise<void> {
  if (rounds.length === 0) return;
  try {
    const db = await getDB();
    if (!db) return;
    const tx = db.transaction(STORE, 'readwrite');
    const now = Date.now();
    for (const round of rounds) {
      const rec: RoundRecord = {
        key: `${roomId}:${round.roundNumber}`,
        roomId,
        roundNumber: round.roundNumber,
        round,
        savedAt: now,
      };
      await tx.store.put(rec);
    }
    await tx.done;
  } catch {
    /* ignore persistence failures */
  }
}

/** Load all stored rounds for a room, newest first. */
export async function loadRounds(roomId: string): Promise<RoundView[]> {
  try {
    const db = await getDB();
    if (!db) return [];
    const recs = (await db.getAllFromIndex(STORE, 'roomId', roomId)) as RoundRecord[];
    return recs.sort((a, b) => b.roundNumber - a.roundNumber).map((r) => r.round);
  } catch {
    return [];
  }
}
