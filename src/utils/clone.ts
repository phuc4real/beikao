/**
 * Deep clone a plain-data value. Used for the host loopback: the authority
 * mutates its state object in place, so the host's store must receive a fresh
 * reference each broadcast (otherwise Zustand sees an unchanged reference and
 * skips the re-render). Clients get this for free via PeerJS serialization.
 */
export function deepClone<T>(value: T): T {
  if (typeof structuredClone === 'function') return structuredClone(value);
  return JSON.parse(JSON.stringify(value)) as T;
}
