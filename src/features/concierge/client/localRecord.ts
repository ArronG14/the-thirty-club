/**
 * The device's copy of the concierge: the last state the service reported
 * (so the lounge renders offline), which seals Alise has broken, and any
 * redemption waiting for a connection. Non-authoritative: the service's
 * records decide what is redeemed.
 */
import { isPrivilegeId, type PrivilegeId } from '../domain/catalogue';
import type { ConciergeState } from '../domain/contract';
import { realmKey } from './sessionStore';

const VERSION = 1;

/** A redemption Alise asked for that has not reached the service yet. */
export interface PendingIntent {
  idempotencyKey: string;
  choice?: string;
  note?: string;
  createdAt: string;
}

export interface ConciergeRecord {
  state: ConciergeState | null;
  /** Seals broken on this device. */
  opened: PrivilegeId[];
  pending: Partial<Record<PrivilegeId, PendingIntent>>;
  /** The boarding-pass ceremony has played on this device. */
  boardedAt: string | null;
  /** Membership recognised by the service or offline, without a session. */
  membershipAt: string | null;
}

export interface ConciergeStorage {
  load(): ConciergeRecord;
  save(record: ConciergeRecord): void;
}

export const emptyConciergeRecord: ConciergeRecord = {
  state: null,
  opened: [],
  pending: {},
  boardedAt: null,
  membershipAt: null,
};

function iso(value: unknown): string | null {
  return typeof value === 'string' && !Number.isNaN(Date.parse(value))
    ? value
    : null;
}

function parseState(value: unknown): ConciergeState | null {
  if (typeof value !== 'object' || value === null) return null;
  const state = value as ConciergeState;
  return typeof state.now === 'number' &&
    typeof state.schedule === 'object' &&
    state.schedule !== null &&
    typeof state.schedule.departureOpensAt === 'number' &&
    typeof state.redemptions === 'object' &&
    typeof state.activations === 'object'
    ? state
    : null;
}

export function parseConciergeRecord(raw: string | null): ConciergeRecord {
  if (!raw) return emptyConciergeRecord;
  try {
    const data = JSON.parse(raw) as Record<string, unknown>;
    if (data.version !== VERSION) return emptyConciergeRecord;
    const pending: ConciergeRecord['pending'] = {};
    if (typeof data.pending === 'object' && data.pending !== null) {
      for (const [id, value] of Object.entries(data.pending)) {
        if (!isPrivilegeId(id) || typeof value !== 'object' || !value) continue;
        const intent = value as Record<string, unknown>;
        if (typeof intent.idempotencyKey !== 'string') continue;
        pending[id] = {
          idempotencyKey: intent.idempotencyKey,
          createdAt: iso(intent.createdAt) ?? new Date(0).toISOString(),
          ...(typeof intent.choice === 'string'
            ? { choice: intent.choice }
            : {}),
          ...(typeof intent.note === 'string' ? { note: intent.note } : {}),
        };
      }
    }
    return {
      state: parseState(data.state),
      opened: Array.isArray(data.opened)
        ? data.opened.filter(isPrivilegeId)
        : [],
      pending,
      boardedAt: iso(data.boardedAt),
      membershipAt: iso(data.membershipAt),
    };
  } catch {
    return emptyConciergeRecord;
  }
}

export function browserConciergeStorage(): ConciergeStorage {
  const key = () => realmKey('concierge');
  return {
    load() {
      try {
        return parseConciergeRecord(window.localStorage.getItem(key()));
      } catch {
        return emptyConciergeRecord;
      }
    },
    save(record) {
      try {
        window.localStorage.setItem(
          key(),
          JSON.stringify({ version: VERSION, ...record }),
        );
      } catch {
        // The page carries on from memory.
      }
    },
  };
}

export function memoryConciergeStorage(
  initial: ConciergeRecord = emptyConciergeRecord,
): ConciergeStorage {
  let record = initial;
  return {
    load: () => record,
    save: (next) => {
      record = next;
    },
  };
}
