/**
 * Room access from the journey (ADR-020). Pure: no React, no storage.
 *
 * The server decides admissions. The device keeps a small cache so that a
 * room she has been admitted to stays open on a hotel network that drops
 * out; the cache can only ever remember what the server confirmed, and an
 * invitation is never accepted offline.
 */
import {
  ADMISSION_ROOMS,
  isAdmissionRoom,
  type AdmissionRoomId,
  type AdmissionState,
  type MemberAdmission,
  type MemberJourney,
} from '../../../shared/journey/contract';

export type RoomAccess = Record<AdmissionRoomId, AdmissionState>;

export interface JourneySnapshot {
  rooms: RoomAccess;
  /** Letters of Admission waiting to be accepted, oldest first. */
  pending: MemberAdmission[];
}

export const LOCKED_EVERYWHERE: RoomAccess = Object.fromEntries(
  ADMISSION_ROOMS.map((room) => [room, 'locked']),
) as RoomAccess;

export const EMPTY_SNAPSHOT: JourneySnapshot = {
  rooms: LOCKED_EVERYWHERE,
  pending: [],
};

export function snapshotOf(journey: MemberJourney): JourneySnapshot {
  const rooms = { ...LOCKED_EVERYWHERE };
  const pending: MemberAdmission[] = [];
  for (const admission of journey.admissions) {
    if (!isAdmissionRoom(admission.roomId)) continue;
    rooms[admission.roomId] = admission.state;
    if (admission.state === 'invited' && admission.letter)
      pending.push(admission);
  }
  pending.sort((a, b) => Date.parse(a.invitedAt) - Date.parse(b.invitedAt));
  return { rooms, pending };
}

/** An accepted admission, applied locally while the server confirms it. */
export function admit(
  snapshot: JourneySnapshot,
  room: AdmissionRoomId,
): JourneySnapshot {
  return {
    rooms: { ...snapshot.rooms, [room]: 'admitted' },
    pending: snapshot.pending.filter((p) => p.roomId !== room),
  };
}

/* ---------- The device cache ---------- */

export const JOURNEY_CACHE_KEY = 'thirty-club:journey';

interface CacheRecord {
  version: 1;
  admitted: AdmissionRoomId[];
  pending: MemberAdmission[];
}

export function serialise(snapshot: JourneySnapshot): string {
  const record: CacheRecord = {
    version: 1,
    admitted: ADMISSION_ROOMS.filter(
      (room) => snapshot.rooms[room] === 'admitted',
    ),
    pending: snapshot.pending,
  };
  return JSON.stringify(record);
}

/** Corrupt, foreign or missing records read as nothing remembered. */
export function deserialise(raw: string | null): JourneySnapshot | null {
  if (!raw) return null;
  try {
    const record = JSON.parse(raw) as Partial<CacheRecord>;
    if (record.version !== 1 || !Array.isArray(record.admitted)) return null;
    const rooms = { ...LOCKED_EVERYWHERE };
    for (const room of record.admitted)
      if (isAdmissionRoom(room)) rooms[room] = 'admitted';
    const pending = Array.isArray(record.pending)
      ? record.pending.filter(
          (p) =>
            p &&
            isAdmissionRoom(p.roomId) &&
            rooms[p.roomId] !== 'admitted' &&
            typeof p.letter?.title === 'string',
        )
      : [];
    for (const p of pending) rooms[p.roomId] = 'invited';
    return { rooms, pending };
  } catch {
    return null;
  }
}
