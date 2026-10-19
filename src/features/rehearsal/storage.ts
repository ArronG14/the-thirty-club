/**
 * The `localStorage` a feature should use (ADR-018). In a rehearsal
 * document it is a view of this tab's session storage under the owner
 * prefix, so rehearsal sessions, keys and records never touch the device's
 * real ones; everywhere else it is the real `localStorage`.
 */
import { OWNER_PREFIX } from '../owner/session';
import { simulationActive } from './mode';

const PREFIX = `${OWNER_PREFIX}local:`;

function prefixedSessionStorage(): Storage {
  const keys = () => {
    const found: string[] = [];
    for (let i = 0; i < sessionStorage.length; i++) {
      const key = sessionStorage.key(i);
      if (key?.startsWith(PREFIX)) found.push(key.slice(PREFIX.length));
    }
    return found;
  };
  return {
    get length() {
      return keys().length;
    },
    key: (index: number) => keys()[index] ?? null,
    getItem: (key: string) => sessionStorage.getItem(PREFIX + key),
    setItem: (key: string, value: string) =>
      sessionStorage.setItem(PREFIX + key, value),
    removeItem: (key: string) => sessionStorage.removeItem(PREFIX + key),
    clear: () =>
      keys().forEach((key) => sessionStorage.removeItem(PREFIX + key)),
  };
}

export function deviceStorage(): Storage {
  return simulationActive ? prefixedSessionStorage() : window.localStorage;
}

/** Removes every rehearsal "local" record in this tab. */
export function clearRehearsalLocal() {
  try {
    prefixedSessionStorage().clear();
  } catch {
    // Nothing to clear.
  }
}
