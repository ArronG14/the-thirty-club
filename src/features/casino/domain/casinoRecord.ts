/**
 * The casino's own device record: chips, how many spins have been played
 * (which addresses the scripted outcomes) and the sound preference. Prizes
 * live in the shared prize ledger, not here. Versioned and defensive, like
 * the ledger: anything unreadable degrades to a fresh record.
 */
import { CHIPS } from '../config/casinoRules';

export const CASINO_RECORD_KEY = 'thirty-club:casino';
export const CASINO_SCHEMA_VERSION = 1;

export interface CasinoRecord {
  chips: number;
  spins: { roulette: number; slots: number };
  /** Times the lobby has been entered; the first is a grander welcome. */
  visits: number;
  soundOn: boolean;
}

export interface CasinoStorage {
  load(): CasinoRecord;
  save(record: CasinoRecord): void;
}

export const freshCasino: CasinoRecord = {
  chips: CHIPS.starting,
  spins: { roulette: 0, slots: 0 },
  visits: 0,
  soundOn: true,
};

const count = (value: unknown): number =>
  typeof value === 'number' && Number.isFinite(value) && value >= 0
    ? Math.floor(value)
    : 0;

export function parseCasino(raw: string | null): CasinoRecord {
  if (!raw) return freshCasino;
  try {
    const data: unknown = JSON.parse(raw);
    if (typeof data !== 'object' || data === null || Array.isArray(data))
      return freshCasino;
    const value = data as Record<string, unknown>;
    if (value.version !== CASINO_SCHEMA_VERSION) return freshCasino;
    const spins = (value.spins ?? {}) as Record<string, unknown>;
    return {
      chips:
        typeof value.chips === 'number' &&
        Number.isFinite(value.chips) &&
        value.chips >= 0
          ? Math.floor(value.chips)
          : CHIPS.starting,
      spins: { roulette: count(spins.roulette), slots: count(spins.slots) },
      visits: count(value.visits),
      soundOn: value.soundOn !== false,
    };
  } catch {
    return freshCasino;
  }
}

export function serialiseCasino(record: CasinoRecord): string {
  return JSON.stringify({ version: CASINO_SCHEMA_VERSION, ...record });
}

export function browserCasinoStorage(): CasinoStorage {
  return {
    load() {
      try {
        return parseCasino(window.localStorage.getItem(CASINO_RECORD_KEY));
      } catch {
        return freshCasino;
      }
    },
    save(record) {
      try {
        window.localStorage.setItem(CASINO_RECORD_KEY, serialiseCasino(record));
      } catch {
        // The session continues from memory.
      }
    },
  };
}

export function memoryCasinoStorage(
  initial: CasinoRecord = freshCasino,
): CasinoStorage {
  let record = initial;
  return {
    load: () => record,
    save: (next) => {
      record = next;
    },
  };
}
