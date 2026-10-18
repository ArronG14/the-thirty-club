/**
 * The device's memory of the entrance. Non-authoritative and deliberately
 * tiny: it only prevents the doors relocking (e.g. a clock correction) and
 * avoids replaying the ceremony unprompted. It grants no rewards.
 */

export const ENTRANCE_RECORD_KEY = 'thirty-club:entrance';
const VERSION = 1;

export interface EntranceRecord {
  unlockedAt: string | null;
  ceremonySeenAt: string | null;
}

export interface EntranceStorage {
  load(): EntranceRecord;
  save(record: EntranceRecord): void;
}

export const emptyRecord: EntranceRecord = {
  unlockedAt: null,
  ceremonySeenAt: null,
};

function isoOrNull(value: unknown): string | null {
  return typeof value === 'string' && !Number.isNaN(Date.parse(value))
    ? value
    : null;
}

export function parseRecord(raw: string | null): EntranceRecord {
  if (!raw) return emptyRecord;
  try {
    const data: unknown = JSON.parse(raw);
    if (typeof data !== 'object' || data === null) return emptyRecord;
    const value = data as Record<string, unknown>;
    if (value.version !== VERSION) return emptyRecord;
    const ceremonySeenAt = isoOrNull(value.ceremonySeenAt);
    return {
      // Seeing the ceremony implies the doors were unlocked.
      unlockedAt: isoOrNull(value.unlockedAt) ?? ceremonySeenAt,
      ceremonySeenAt,
    };
  } catch {
    return emptyRecord;
  }
}

export function serialiseRecord(record: EntranceRecord): string {
  return JSON.stringify({ version: VERSION, ...record });
}

/**
 * localStorage-backed record. Storage can be unavailable (private browsing,
 * quota, eviction); failures degrade to time-only behaviour, never an error.
 */
export function browserEntranceStorage(): EntranceStorage {
  return {
    load() {
      try {
        return parseRecord(window.localStorage.getItem(ENTRANCE_RECORD_KEY));
      } catch {
        return emptyRecord;
      }
    },
    save(record) {
      try {
        window.localStorage.setItem(
          ENTRANCE_RECORD_KEY,
          serialiseRecord(record),
        );
      } catch {
        // Time-derived state still works; the record is a convenience.
      }
    },
  };
}

/** In-memory record for development previews and tests. */
export function memoryEntranceStorage(
  initial: EntranceRecord = emptyRecord,
): EntranceStorage {
  let record = initial;
  return {
    load: () => record,
    save: (next) => {
      record = next;
    },
  };
}
