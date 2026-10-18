import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Clock } from '../entrance/domain/environment';
import {
  inductMember,
  markAnnounced,
  roomViews,
  settleUnlocks,
} from './domain/clubState';
import {
  stampRoom,
  type MembershipRecord,
  type MembershipStorage,
} from './domain/membershipRecord';
import type { RoomId } from './domain/rooms';

/** Scheduled rooms open on the hour; checking twice a minute is plenty. */
const RECHECK_MS = 30_000;

/**
 * Membership and room availability for this device. Composes the clock
 * and the persisted record; every rule lives in the pure domain.
 */
export function useClub({
  clock,
  membership,
}: {
  clock: Clock;
  membership: MembershipStorage;
}) {
  const [now, setNow] = useState(() => clock.now());
  const [record, setRecord] = useState<MembershipRecord>(() =>
    settleUnlocks(membership.load(), clock.now()),
  );
  const saved = useRef<MembershipRecord | null>(null);

  // Re-evaluate the schedule periodically and whenever the page returns.
  // Once a room is open it stays open, whatever the clock says later.
  useEffect(() => {
    const refresh = () => {
      if (document.visibilityState === 'hidden') return;
      const current = clock.now();
      setNow(current);
      setRecord((r) => settleUnlocks(r, current));
    };
    const timer = setInterval(refresh, RECHECK_MS);
    document.addEventListener('visibilitychange', refresh);
    window.addEventListener('pageshow', refresh);
    window.addEventListener('focus', refresh);
    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', refresh);
      window.removeEventListener('pageshow', refresh);
      window.removeEventListener('focus', refresh);
    };
  }, [clock]);

  useEffect(() => {
    if (record === saved.current) return;
    saved.current = record;
    membership.save(record);
  }, [membership, record]);

  const views = useMemo(() => roomViews(now, record), [now, record]);

  const induct = useCallback(() => {
    const current = clock.now();
    setNow(current);
    setRecord((r) => inductMember(r, current));
  }, [clock]);

  const introduce = useCallback(
    (rooms: readonly RoomId[]) => {
      if (rooms.length === 0) return;
      const at = new Date(clock.now()).toISOString();
      setRecord((r) => markAnnounced(r, rooms, at));
    },
    [clock],
  );

  const visit = useCallback(
    (room: RoomId) => {
      const at = new Date(clock.now()).toISOString();
      setRecord((r) => stampRoom(r, room, 'visitedAt', at));
    },
    [clock],
  );

  const complete = useCallback(
    (room: RoomId) => {
      const at = new Date(clock.now()).toISOString();
      setRecord((r) => stampRoom(r, room, 'completedAt', at));
    },
    [clock],
  );

  return {
    complete,
    now,
    record,
    views,
    inducted: record.inductedAt !== null,
    induct,
    introduce,
    visit,
  };
}

export type ClubModel = ReturnType<typeof useClub>;
