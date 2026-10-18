/**
 * A vault key found in the real world (the token from an NFC tag's URL),
 * held across the reloads, Safari navigations and membership checks that
 * may sit between the scan and the opening. It is a bearer secret for one
 * compartment, never a location: it is removed as soon as the server has
 * answered, and it expires after a few hours regardless.
 */
const KEY = 'thirty-club:vault-key';
const MAX_AGE_MS = 6 * 60 * 60 * 1000;

export interface PendingKey {
  credential: string;
  foundAt: number;
}

function storage(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

export function isPlausibleVaultToken(token: string): boolean {
  return /^[A-Za-z0-9_-]{43}$/.test(token);
}

export function holdKey(
  credential: string,
  now = Date.now(),
  store: Storage | null = storage(),
): boolean {
  if (!isPlausibleVaultToken(credential)) return false;
  try {
    store?.setItem(KEY, JSON.stringify({ credential, foundAt: now }));
    return Boolean(store);
  } catch {
    return false;
  }
}

export function heldKey(
  now = Date.now(),
  store: Storage | null = storage(),
): PendingKey | null {
  try {
    const raw = store?.getItem(KEY);
    if (!raw) return null;
    const value = JSON.parse(raw) as Partial<PendingKey>;
    if (
      typeof value.credential !== 'string' ||
      !isPlausibleVaultToken(value.credential) ||
      typeof value.foundAt !== 'number' ||
      now - value.foundAt > MAX_AGE_MS ||
      value.foundAt - now > 60_000
    ) {
      store?.removeItem(KEY);
      return null;
    }
    return { credential: value.credential, foundAt: value.foundAt };
  } catch {
    return null;
  }
}

export function releaseKey(store: Storage | null = storage()) {
  try {
    store?.removeItem(KEY);
  } catch {
    // Nothing held.
  }
}
