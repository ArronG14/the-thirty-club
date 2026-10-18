/**
 * Persistence for the prize ledger: one versioned localStorage record that
 * the Gift Vault will read. Non-authoritative, like the rest of the device
 * state (ADR-003): it records what the device has shown, and a real
 * redemption authority is still an open question.
 *
 * Loading is defensive. Anything unreadable degrades to an empty ledger;
 * individual malformed grants are dropped; a grant is never downgraded.
 */
import { emptyLedger, type PrizeLedger } from './ledger';
import type { RewardGrant } from './rewards';

export const PRIZE_LEDGER_KEY = 'thirty-club:prizes';
export const PRIZE_SCHEMA_VERSION = 1;

export interface PrizeStorage {
  load(): PrizeLedger;
  save(ledger: PrizeLedger): void;
}

/**
 * Upgrades stored data one version at a time. `MIGRATIONS[n]` converts a
 * version-n payload into version n + 1. There are none yet because the
 * schema has never changed; the mechanism is exercised by tests.
 */
export type Migration = (
  data: Record<string, unknown>,
) => Record<string, unknown>;
export const MIGRATIONS: Readonly<Record<number, Migration>> = {};

export function migrate(
  data: Record<string, unknown>,
  current = PRIZE_SCHEMA_VERSION,
  migrations: Readonly<Record<number, Migration>> = MIGRATIONS,
): Record<string, unknown> | null {
  let version = data.version;
  let value = data;
  if (typeof version !== 'number' || !Number.isInteger(version)) return null;
  // A record written by a newer build is not understood; do not guess.
  if (version > current || version < 1) return null;
  while (version < current) {
    const step = migrations[version];
    if (!step) return null;
    value = step(value);
    version += 1;
    value = { ...value, version };
  }
  return value;
}

const iso = (value: unknown): string | null =>
  typeof value === 'string' && !Number.isNaN(Date.parse(value)) ? value : null;

function parseGrant(id: string, value: unknown): RewardGrant | null {
  if (typeof value !== 'object' || value === null) return null;
  const source = value as Record<string, unknown>;
  const awardedAt = iso(source.awardedAt);
  if (!awardedAt) return null;
  const claimedAt = iso(source.claimedAt);
  // "Claimed" without a timestamp is untrustworthy, so it reads as unclaimed.
  if (source.status === 'claimed' && claimedAt)
    return { rewardId: id, awardedAt, status: 'claimed', claimedAt };
  return { rewardId: id, awardedAt, status: 'unclaimed' };
}

export function parseLedger(
  raw: string | null,
  knownRewardIds?: ReadonlySet<string>,
): PrizeLedger {
  if (!raw) return emptyLedger;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed))
      return emptyLedger;
    const data = migrate(parsed as Record<string, unknown>);
    if (!data) return emptyLedger;
    const counters: Record<string, number> = {};
    if (typeof data.counters === 'object' && data.counters !== null) {
      for (const [key, value] of Object.entries(data.counters)) {
        if (typeof value === 'number' && Number.isFinite(value) && value > 0)
          counters[key] = Math.floor(value);
      }
    }
    const grants: Record<string, RewardGrant> = {};
    if (typeof data.grants === 'object' && data.grants !== null) {
      for (const [id, value] of Object.entries(data.grants)) {
        // Rewards unknown to this build are dropped rather than trusted.
        if (knownRewardIds && !knownRewardIds.has(id)) continue;
        const grant = parseGrant(id, value);
        if (grant) grants[id] = grant;
      }
    }
    return { counters, grants };
  } catch {
    return emptyLedger;
  }
}

export function serialiseLedger(ledger: PrizeLedger): string {
  return JSON.stringify({ version: PRIZE_SCHEMA_VERSION, ...ledger });
}

export function browserPrizeStorage(
  knownRewardIds?: ReadonlySet<string>,
): PrizeStorage {
  return {
    load() {
      try {
        return parseLedger(
          window.localStorage.getItem(PRIZE_LEDGER_KEY),
          knownRewardIds,
        );
      } catch {
        return emptyLedger;
      }
    },
    save(ledger) {
      try {
        window.localStorage.setItem(PRIZE_LEDGER_KEY, serialiseLedger(ledger));
      } catch {
        // The session continues from memory.
      }
    },
  };
}

/** In-memory ledger for development previews and tests. */
export function memoryPrizeStorage(
  initial: PrizeLedger = emptyLedger,
): PrizeStorage {
  let ledger = initial;
  return {
    load: () => ledger,
    save: (next) => {
      ledger = next;
    },
  };
}
