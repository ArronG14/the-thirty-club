/**
 * Where this device keeps its concierge session. The live session (Alise's)
 * and a rehearsal session (the owner's) live under separate keys; while a
 * rehearsal is active it takes precedence, and ending it restores the live
 * state untouched.
 */
import {
  decodeSessionClaims,
  type Realm,
  type SessionClaims,
} from '../domain/session';

export const SESSION_KEYS: Record<Realm, string> = {
  live: 'thirty-club:concierge-session',
  rehearsal: 'thirty-club:rehearsal-session',
};

/** Every local key a rehearsal may write; cleared when it ends. */
export const REHEARSAL_PREFIX = 'thirty-club:rehearsal:';

export interface StoredSession {
  token: string;
  claims: SessionClaims;
}

function read(storage: Storage, key: string): StoredSession | null {
  try {
    const token = storage.getItem(key);
    if (!token) return null;
    const claims = decodeSessionClaims(token);
    return claims ? { token, claims } : null;
  } catch {
    return null;
  }
}

function browserStorage(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

export function activeSession(
  storage: Storage | null = browserStorage(),
): StoredSession | null {
  if (!storage) return null;
  return (
    read(storage, SESSION_KEYS.rehearsal) ?? read(storage, SESSION_KEYS.live)
  );
}

export function isRehearsing(storage: Storage | null = browserStorage()) {
  return activeSession(storage)?.claims.realm === 'rehearsal';
}

/** Saves a session under its own realm's key. */
export function saveSession(
  token: string,
  storage: Storage | null = browserStorage(),
): StoredSession | null {
  const claims = decodeSessionClaims(token);
  if (!claims || !storage) return null;
  try {
    storage.setItem(SESSION_KEYS[claims.realm], token);
  } catch {
    // Storage full or blocked: the session lasts as long as the page.
  }
  return { token, claims };
}

export function clearSession(
  realm: Realm,
  storage: Storage | null = browserStorage(),
) {
  try {
    storage?.removeItem(SESSION_KEYS[realm]);
  } catch {
    // Nothing to clear.
  }
}

/** Ends a rehearsal and removes everything it stored on this device. */
export function endRehearsal(storage: Storage | null = browserStorage()) {
  if (!storage) return;
  try {
    const doomed: string[] = [SESSION_KEYS.rehearsal];
    for (let i = 0; i < storage.length; i += 1) {
      const key = storage.key(i);
      if (key?.startsWith(REHEARSAL_PREFIX)) doomed.push(key);
    }
    doomed.forEach((key) => storage.removeItem(key));
  } catch {
    // Nothing to clear.
  }
}

/** The storage key for a local record in the active realm. */
export function realmKey(
  name: string,
  storage: Storage | null = browserStorage(),
): string {
  return isRehearsing(storage)
    ? `${REHEARSAL_PREFIX}${name}`
    : `thirty-club:${name}`;
}
