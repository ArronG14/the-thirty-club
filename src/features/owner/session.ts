/** A convenience gate, not protection for public assets. */
export const OWNER_PIN = '1414';
export const OWNER_PREFIX = 'thirty-club:owner:';
const AUTH_KEY = `${OWNER_PREFIX}authenticated`;
const MODE_KEY = `${OWNER_PREFIX}mode`;
export type OwnerMode = 'locked' | 'birthday' | 'open';

function readSession(key: string): string | null {
  try {
    return sessionStorage.getItem(key);
  } catch {
    return null;
  }
}

// Snapshot at document creation. Mode changes reload the document so late
// cleanup writes from an owner room can NEVER fall through to guest storage.
export const ownerActive = readSession(AUTH_KEY) === '1';
const mode = readSession(MODE_KEY);
export const ownerMode: OwnerMode =
  mode === 'birthday' || mode === 'open' ? mode : 'locked';

export function authenticateOwner(pin: string): boolean {
  if (pin !== OWNER_PIN) return false;
  try {
    clearOwnerProgress();
    sessionStorage.removeItem(MODE_KEY);
    sessionStorage.setItem(AUTH_KEY, '1');
    return true;
  } catch {
    return false;
  }
}

let ownerWritesEnabled = true;

/** Uses the same serializers and parsers, but never the member's records. */
export const progressStorage = {
  getItem(key: string): string | null {
    return ownerActive
      ? sessionStorage.getItem(OWNER_PREFIX + key)
      : localStorage.getItem(key);
  },
  setItem(key: string, value: string): void {
    if (ownerActive) {
      if (ownerWritesEnabled) sessionStorage.setItem(OWNER_PREFIX + key, value);
    } else localStorage.setItem(key, value);
  },
};

/** Optional films use tab-local progress even for guests. */
export const sessionProgressStorage = {
  getItem(key: string): string | null {
    return ownerActive
      ? progressStorage.getItem(key)
      : sessionStorage.getItem(key);
  },
  setItem(key: string, value: string): void {
    if (ownerActive) progressStorage.setItem(key, value);
    else sessionStorage.setItem(key, value);
  },
};

export function clearOwnerProgress(): void {
  ownerWritesEnabled = false;
  for (let i = sessionStorage.length - 1; i >= 0; i--) {
    const key = sessionStorage.key(i);
    if (key?.startsWith(OWNER_PREFIX + 'thirty-club:'))
      sessionStorage.removeItem(key);
  }
}

export function setOwnerMode(next: OwnerMode): void {
  if (!ownerActive) return;
  ownerWritesEnabled = false;
  // Unlock latches must not leak between rehearsals; rewards remain isolated.
  if (next !== 'open') {
    sessionStorage.removeItem(OWNER_PREFIX + 'thirty-club:entrance');
    sessionStorage.removeItem(OWNER_PREFIX + 'thirty-club:membership');
  }
  sessionStorage.setItem(MODE_KEY, next);
}

export function exitOwner(): void {
  clearOwnerProgress();
  sessionStorage.removeItem(AUTH_KEY);
  sessionStorage.removeItem(MODE_KEY);
}

/** Invoked by completed clicks (including touch), avoiding WebKit click-through.
 * A rolling window, so a slow initial tap doesn't discard a later burst. */
export function fiveTapGesture(onActivate: () => void) {
  let taps: number[] = [];
  return (now: number) => {
    taps = taps.filter((at) => now - at <= 3000);
    taps.push(now);
    if (taps.length >= 5) {
      taps = [];
      onActivate();
    }
  };
}
