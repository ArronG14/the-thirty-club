/**
 * REHEARSAL ONLY. The simulated concierge (`/api/concierge/*`,
 * `/api/owner/*`): the real handlers from netlify/concierge with a store in
 * this tab's session storage, fake channels and the rehearsal clock.
 * Credentials are the obviously fake test values (sim/env.ts); notifications
 * are recorded in the simulated outbox, never sent.
 */
import { createConciergeApi } from '../../../../netlify/concierge/api';
import { readConfig } from '../../../../netlify/concierge/config';
import type { KvStore } from '../../../../netlify/concierge/store';
import {
  fakeChannels,
  type OutboxEntry,
} from '../../../../netlify/concierge/testing';
import { OWNER_PREFIX } from '../../owner/session';
import { rehearsalNow } from '../clock';
import { SIM_ENV } from './env';

const STORE_KEY = `${OWNER_PREFIX}sim-concierge`;
const OUTBOX_KEY = `${OWNER_PREFIX}sim-notifications`;
export const NOTIFICATIONS_EVENT = 'thirty-club:sim-notifications';

interface Saved {
  version: number;
  data: Record<string, { json: string; etag: string }>;
}

function load(): Saved {
  try {
    const raw = sessionStorage.getItem(STORE_KEY);
    if (raw) return JSON.parse(raw) as Saved;
  } catch {
    // An unreadable simulation is an empty one.
  }
  return { version: 0, data: {} };
}

function save(state: Saved) {
  try {
    sessionStorage.setItem(STORE_KEY, JSON.stringify(state));
  } catch {
    // Best effort: the simulation continues in memory.
  }
}

/** The KvStore contract (create-if-new, replace-if-unchanged) in session storage. */
export function sessionKvStore(): KvStore {
  const write = (key: string, value: unknown) => {
    const state = load();
    state.version += 1;
    state.data[key] = {
      json: JSON.stringify(value),
      etag: `"s${state.version}"`,
    };
    save(state);
  };
  return {
    async get<T>(key: string) {
      const found = load().data[key];
      return found
        ? { value: JSON.parse(found.json) as T, etag: found.etag }
        : null;
    },
    async create(key, value) {
      if (load().data[key]) return false;
      write(key, value);
      return true;
    },
    async replace(key, value, etag) {
      if (load().data[key]?.etag !== etag) return false;
      write(key, value);
      return true;
    },
    async put(key, value) {
      write(key, value);
    },
    async list(prefix) {
      return Object.keys(load().data)
        .filter((key) => key.startsWith(prefix))
        .sort();
    },
    async remove(key) {
      const state = load();
      delete state.data[key];
      save(state);
    },
  };
}

export interface SimNotification extends OutboxEntry {
  source: 'concierge' | 'office';
}

export function simulatedNotifications(): SimNotification[] {
  try {
    return JSON.parse(
      sessionStorage.getItem(OUTBOX_KEY) ?? '[]',
    ) as SimNotification[];
  } catch {
    return [];
  }
}

export function recordNotification(entry: SimNotification) {
  try {
    const list = [entry, ...simulatedNotifications()].slice(0, 200);
    sessionStorage.setItem(OUTBOX_KEY, JSON.stringify(list));
  } catch {
    // Best effort.
  }
  window.dispatchEvent(new Event(NOTIFICATIONS_EVENT));
}

let handler: ReturnType<typeof createConciergeApi> | null = null;

export function simConcierge() {
  if (handler) return handler;
  const channels = fakeChannels(rehearsalNow);
  channels.setConfigured('sms', true);
  const record = channels.outbox.push.bind(channels.outbox);
  channels.outbox.push = (...entries: OutboxEntry[]) => {
    entries.forEach((entry) =>
      recordNotification({ ...entry, source: 'concierge' }),
    );
    return record(...entries);
  };
  handler = createConciergeApi({
    store: sessionKvStore(),
    config: readConfig(SIM_ENV),
    channels,
    clock: rehearsalNow,
  });
  return handler;
}

export function clearSimConcierge() {
  handler = null;
  try {
    sessionStorage.removeItem(STORE_KEY);
    sessionStorage.removeItem(OUTBOX_KEY);
  } catch {
    // Nothing to clear.
  }
}
