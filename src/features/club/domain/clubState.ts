/**
 * Derives where Alise may go from the registry, the clock and her record.
 * Pure: no React, no storage, no time of its own.
 */
import type { MembershipRecord } from './membershipRecord';
import { stampRoom } from './membershipRecord';
import { ROOMS, type RoomDefinition, type RoomId } from './rooms';

export interface RoomView {
  room: RoomDefinition;
  open: boolean;
  /** When a locked room opens, if known. */
  opensAt: number | null;
  visited: boolean;
  completed: boolean;
  /** Open, built and reachable: the only state that offers a way in. */
  enterable: boolean;
}

export function isOpen(
  room: RoomDefinition,
  now: number,
  record: MembershipRecord,
): boolean {
  // Once open, always open: a recorded unlock wins over a rolled-back clock.
  if (record.rooms[room.id]?.unlockedAt) return true;
  switch (room.unlock.kind) {
    case 'always':
      return true;
    case 'membership':
      return record.inductedAt !== null;
    case 'scheduled':
      return now >= room.unlock.at;
  }
}

export function roomViews(
  now: number,
  record: MembershipRecord,
  rooms: readonly RoomDefinition[] = ROOMS,
): RoomView[] {
  return rooms.map((room) => {
    const open = isOpen(room, now, record);
    const progress = record.rooms[room.id];
    return {
      room,
      open,
      opensAt:
        !open && room.unlock.kind === 'scheduled' ? room.unlock.at : null,
      visited: Boolean(progress?.visitedAt),
      completed: Boolean(progress?.completedAt),
      enterable: open && room.built,
    };
  });
}

/** Records every room now open so it can never relock. */
export function recordUnlocks(
  record: MembershipRecord,
  views: readonly RoomView[],
  nowIso: string,
): MembershipRecord {
  return views.reduce(
    (next, view) =>
      view.open && view.room.sequence !== null
        ? stampRoom(next, view.room.id, 'unlockedAt', nowIso)
        : next,
    record,
  );
}

const bySequence = (a: RoomView, b: RoomView) =>
  (a.room.sequence ?? Infinity) - (b.room.sequence ?? Infinity);

/** The next room of the evening: the earliest open one not yet finished. */
export function recommendedRoom(views: readonly RoomView[]): RoomView | null {
  return (
    views
      .filter((v) => v.room.sequence !== null && v.open && !v.completed)
      .sort(bySequence)[0] ?? null
  );
}

/** The soonest room still to open, for "later today" guidance. */
export function nextOpening(views: readonly RoomView[]): RoomView | null {
  return (
    views
      .filter((v) => v.opensAt !== null)
      .sort((a, b) => a.opensAt! - b.opensAt!)[0] ?? null
  );
}

/** Open rooms of the evening the butler has not yet introduced. */
export function unannounced(
  views: readonly RoomView[],
  record: MembershipRecord,
): RoomView[] {
  return views
    .filter(
      (v) =>
        v.open &&
        v.room.sequence !== null &&
        !record.rooms[v.room.id]?.announcedAt,
    )
    .sort(bySequence);
}

export function markAnnounced(
  record: MembershipRecord,
  rooms: readonly RoomId[],
  nowIso: string,
): MembershipRecord {
  return rooms.reduce(
    (next, id) => stampRoom(next, id, 'announcedAt', nowIso),
    record,
  );
}

/** The record with every currently open room stamped as unlocked. */
export function settleUnlocks(
  record: MembershipRecord,
  now: number,
): MembershipRecord {
  return recordUnlocks(
    record,
    roomViews(now, record),
    new Date(now).toISOString(),
  );
}

/** Presents the membership: idempotent, and opens membership rooms. */
export function inductMember(
  record: MembershipRecord,
  now: number,
): MembershipRecord {
  if (record.inductedAt) return record;
  return settleUnlocks(
    { ...record, inductedAt: new Date(now).toISOString() },
    now,
  );
}
