/**
 * The device's memory of Alise's membership and her progress through the
 * club. Non-authoritative: it decides what the butler says and which rooms
 * stay open, never what anyone has won. Prizes and redemptions will need
 * server records (ADR-003).
 */
import { isRoomId, type RoomId } from './rooms';

export const MEMBERSHIP_RECORD_KEY = 'thirty-club:membership';
const VERSION = 1;

export interface RoomProgress {
  /** First seen open; a recorded unlock survives a clock set backwards. */
  unlockedAt?: string;
  /** The butler has introduced it, so he won't announce it again. */
  announcedAt?: string;
  visitedAt?: string;
  completedAt?: string;
}

export interface MembershipRecord {
  /** The membership ceremony was completed. */
  inductedAt: string | null;
  rooms: Partial<Record<RoomId, RoomProgress>>;
}

export interface MembershipStorage {
  load(): MembershipRecord;
  save(record: MembershipRecord): void;
}

export const emptyMembership: MembershipRecord = {
  inductedAt: null,
  rooms: {},
};

const PROGRESS_KEYS = [
  'unlockedAt',
  'announcedAt',
  'visitedAt',
  'completedAt',
] as const;

function isoOrUndefined(value: unknown): string | undefined {
  return typeof value === 'string' && !Number.isNaN(Date.parse(value))
    ? value
    : undefined;
}

function parseProgress(value: unknown): RoomProgress | null {
  if (typeof value !== 'object' || value === null) return null;
  const source = value as Record<string, unknown>;
  const progress: RoomProgress = {};
  for (const key of PROGRESS_KEYS) {
    const stamp = isoOrUndefined(source[key]);
    if (stamp) progress[key] = stamp;
  }
  return progress;
}

export function parseMembership(raw: string | null): MembershipRecord {
  if (!raw) return emptyMembership;
  try {
    const data: unknown = JSON.parse(raw);
    if (typeof data !== 'object' || data === null) return emptyMembership;
    const value = data as Record<string, unknown>;
    if (value.version !== VERSION) return emptyMembership;
    const rooms: MembershipRecord['rooms'] = {};
    if (typeof value.rooms === 'object' && value.rooms !== null) {
      for (const [id, entry] of Object.entries(value.rooms)) {
        // Rooms unknown to this build are dropped rather than trusted.
        if (!isRoomId(id)) continue;
        const progress = parseProgress(entry);
        if (progress) rooms[id] = progress;
      }
    }
    return { inductedAt: isoOrUndefined(value.inductedAt) ?? null, rooms };
  } catch {
    return emptyMembership;
  }
}

export function serialiseMembership(record: MembershipRecord): string {
  return JSON.stringify({ version: VERSION, ...record });
}

/** Stamps `key` for `room` unless it is already recorded. */
export function stampRoom(
  record: MembershipRecord,
  room: RoomId,
  key: keyof RoomProgress,
  nowIso: string,
): MembershipRecord {
  if (record.rooms[room]?.[key]) return record;
  return {
    ...record,
    rooms: {
      ...record.rooms,
      [room]: { ...record.rooms[room], [key]: nowIso },
    },
  };
}

/**
 * localStorage-backed record. Unavailable or full storage degrades to an
 * in-session membership: the ceremony may replay later, nothing breaks.
 */
export function browserMembershipStorage(): MembershipStorage {
  return {
    load() {
      try {
        return parseMembership(
          window.localStorage.getItem(MEMBERSHIP_RECORD_KEY),
        );
      } catch {
        return emptyMembership;
      }
    },
    save(record) {
      try {
        window.localStorage.setItem(
          MEMBERSHIP_RECORD_KEY,
          serialiseMembership(record),
        );
      } catch {
        // The session continues from memory.
      }
    },
  };
}

/** In-memory record for development previews and tests. */
export function memoryMembershipStorage(
  initial: MembershipRecord = emptyMembership,
): MembershipStorage {
  let record = initial;
  return {
    load: () => record,
    save: (next) => {
      record = next;
    },
  };
}
