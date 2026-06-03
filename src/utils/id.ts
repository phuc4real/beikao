/** Stable unique id for players/messages. */
export function genId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }
  // Fallback (older environments / tests without WebCrypto UUID).
  return 'id-' + Math.abs(hashStr(String(performance.now()) + ':' + Math.random())).toString(36);
}

const ROOM_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no easily-confused chars

/** Human-friendly room code, e.g. "BAC-7QK2". */
export function genRoomCode(): string {
  const bytes = new Uint8Array(4);
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    crypto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < bytes.length; i++) bytes[i] = Math.floor(Math.random() * 256);
  }
  let code = '';
  for (let i = 0; i < 4; i++) code += ROOM_ALPHABET[bytes[i]! % ROOM_ALPHABET.length];
  return `BAC-${code}`;
}

/** PeerJS broker id derived from a room code (namespaced to reduce collisions). */
export function peerIdForRoom(roomCode: string): string {
  return `beikao-${roomCode.toUpperCase()}`;
}

function hashStr(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
  return h;
}
