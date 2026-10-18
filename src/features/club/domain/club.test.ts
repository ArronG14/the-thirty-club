import { describe, expect, it } from 'vitest';
import {
  inductMember,
  isOpen,
  markAnnounced,
  nextOpening,
  recommendedRoom,
  roomViews,
  settleUnlocks,
  unannounced,
} from './clubState';
import {
  CONCIERGE_LINES,
  conciergeLine,
  INDUCTION,
  loungeBriefing,
  preparingLine,
} from './loungeScript';
import {
  emptyMembership,
  memoryMembershipStorage,
  parseMembership,
  serialiseMembership,
  stampRoom,
  type MembershipRecord,
} from './membershipRecord';
import { findRoom, ROOMS, type RoomDefinition } from './rooms';
import {
  formatClubTime,
  instantInZone,
  ROOM_SCHEDULE,
  zoneOffsetMs,
} from './schedule';

const at = (iso: string) => Date.parse(iso);
// 10:00 on the birthday in Kingston is 15:00 UTC.
const MORNING = at('2026-10-24T09:00:00-05:00');
const AFTERNOON = at('2026-10-24T15:00:00-05:00');
const NIGHT = at('2026-10-24T21:00:00-05:00');
const BEFORE = at('2026-10-24T00:30:00-05:00');

function member(now: number): MembershipRecord {
  return inductMember(emptyMembership, now);
}

describe('Jamaica schedule', () => {
  it('reads wall-clock times in America/Jamaica (UTC−5, no DST)', () => {
    expect(new Date(instantInZone(ROOM_SCHEDULE.casino)).toISOString()).toBe(
      '2026-10-24T19:00:00.000Z',
    );
    expect(zoneOffsetMs(at('2026-10-24T12:00:00Z'), 'America/Jamaica')).toBe(
      -5 * 3_600_000,
    );
  });

  it('formats opening times as a clock in Jamaica reads them', () => {
    expect(formatClubTime(instantInZone(ROOM_SCHEDULE.casino))).toBe('2 pm');
    expect(
      formatClubTime(instantInZone({ date: '2026-10-24', time: '18:30' })),
    ).toBe('6:30 pm');
  });

  it('keeps every scheduled unlock within the birthday', () => {
    for (const time of Object.values(ROOM_SCHEDULE)) {
      expect(time.date).toBe('2026-10-24');
    }
  });
});

describe('room registry', () => {
  it('lists the six confirmed spaces with stable ids and no secret chamber', () => {
    expect(ROOMS.map((room) => room.id)).toEqual([
      'entrance',
      'lounge',
      'screening-room',
      'casino',
      'gift-vault',
      'privileges',
    ]);
    expect(new Set(ROOMS.map((room) => room.path)).size).toBe(ROOMS.length - 1);
    expect(findRoom('secret-chamber')).toBeUndefined();
  });

  it('marks only the rooms that exist in this build as built', () => {
    expect(ROOMS.filter((room) => room.built).map((room) => room.id)).toEqual([
      'entrance',
      'lounge',
      'screening-room',
      'casino',
    ]);
  });

  it('gives every destination butler lines addressed to Alise alone', () => {
    const lines = ROOMS.flatMap((room) =>
      room.butler ? Object.values(room.butler) : [],
    );
    expect(lines.length).toBeGreaterThan(0);
    for (const line of [...lines, ...INDUCTION.flatMap((b) => b.lines)]) {
      expect(line).not.toMatch(/Mrs|Khera/);
    }
  });
});

describe('membership record', () => {
  it('round-trips through storage', () => {
    const record = stampRoom(
      member(MORNING),
      'screening-room',
      'visitedAt',
      new Date(MORNING).toISOString(),
    );
    expect(parseMembership(serialiseMembership(record))).toEqual(record);
  });

  it('degrades to an empty membership when corrupt or from another version', () => {
    expect(parseMembership(null)).toEqual(emptyMembership);
    expect(parseMembership('{not json')).toEqual(emptyMembership);
    expect(parseMembership('[]')).toEqual(emptyMembership);
    expect(
      parseMembership(JSON.stringify({ version: 2, inductedAt: '2026' })),
    ).toEqual(emptyMembership);
  });

  it('drops unknown rooms and invalid stamps rather than trusting them', () => {
    const parsed = parseMembership(
      JSON.stringify({
        version: 1,
        inductedAt: 'yesterday',
        rooms: {
          'secret-chamber': { unlockedAt: '2026-10-24T05:00:00Z' },
          casino: { unlockedAt: 'soon', visitedAt: '2026-10-24T20:00:00Z' },
        },
      }),
    );
    expect(parsed).toEqual({
      inductedAt: null,
      rooms: { casino: { visitedAt: '2026-10-24T20:00:00Z' } },
    });
  });

  it('never overwrites a first stamp', () => {
    const first = stampRoom(emptyMembership, 'casino', 'visitedAt', 'a');
    expect(stampRoom(first, 'casino', 'visitedAt', 'b')).toBe(first);
  });

  it('keeps an in-memory copy for previews and tests', () => {
    const storage = memoryMembershipStorage();
    storage.save(member(MORNING));
    expect(storage.load().inductedAt).not.toBeNull();
  });
});

describe('room availability', () => {
  const screening = findRoom('screening-room')!;
  const casino = findRoom('casino')!;

  it('opens the screening room with the membership, not before', () => {
    expect(isOpen(screening, MORNING, emptyMembership)).toBe(false);
    expect(isOpen(screening, MORNING, member(MORNING))).toBe(true);
  });

  it('opens scheduled rooms at their Jamaica time and says when', () => {
    const record = member(BEFORE);
    const views = roomViews(MORNING, record);
    const casinoView = views.find((v) => v.room.id === 'casino')!;
    expect(casinoView.open).toBe(false);
    expect(casinoView.opensAt).toBe(instantInZone(ROOM_SCHEDULE.casino));
    expect(isOpen(casino, AFTERNOON, record)).toBe(true);
  });

  it('keeps scheduled rooms shut to anyone who has not presented the membership', () => {
    // A direct link at 3 pm cannot skip the membership ceremony (ADR-012).
    expect(isOpen(casino, AFTERNOON, emptyMembership)).toBe(false);
    expect(isOpen(casino, AFTERNOON, member(BEFORE))).toBe(true);
  });

  it('never relocks a room once seen open, even if the clock goes back', () => {
    const settled = settleUnlocks(member(BEFORE), AFTERNOON);
    expect(settled.rooms.casino?.unlockedAt).toBeDefined();
    expect(isOpen(casino, BEFORE, settled)).toBe(true);
  });

  it('records the screening room as unlocked at the moment of induction', () => {
    const record = member(MORNING);
    expect(record.rooms['screening-room']?.unlockedAt).toBe(record.inductedAt);
    expect(inductMember(record, NIGHT)).toBe(record);
  });

  it('offers a way in only to rooms that are open and built', () => {
    const views = roomViews(NIGHT, member(MORNING));
    for (const view of views) {
      expect(view.enterable).toBe(view.open && view.room.built);
    }
    expect(views.find((v) => v.room.id === 'screening-room')!.enterable).toBe(
      true,
    );
  });

  it('recommends the earliest open room not yet completed', () => {
    let record = member(MORNING);
    expect(recommendedRoom(roomViews(MORNING, record))?.room.id).toBe(
      'screening-room',
    );
    record = stampRoom(record, 'screening-room', 'completedAt', 'x');
    // Privileges opens at 10 am; the casino not until 2 pm.
    expect(recommendedRoom(roomViews(MORNING, record))).toBeNull();
    expect(nextOpening(roomViews(MORNING, record))?.room.id).toBe('privileges');
    expect(recommendedRoom(roomViews(AFTERNOON, record))?.room.id).toBe(
      'casino',
    );
  });

  it('honours a registry injected for future rooms', () => {
    const built: RoomDefinition[] = ROOMS.map((room) =>
      room.id === 'screening-room' ? { ...room, built: true } : room,
    );
    const view = roomViews(MORNING, member(MORNING), built).find(
      (v) => v.room.id === 'screening-room',
    )!;
    expect(view.enterable).toBe(true);
  });
});

describe('the butler in the lounge', () => {
  it('invites Alise to the screening room straight after her induction', () => {
    const record = member(MORNING);
    const briefing = loungeBriefing({
      views: roomViews(MORNING, record),
      record,
      hour: 0,
      arrival: 'induction',
    });
    expect(briefing.kind).toBe('invitation');
    expect(briefing.destination?.room.id).toBe('screening-room');
    expect(briefing.lines).toEqual([
      'Before we begin the festivities, Alise, a number of rather important people have requested an audience with you. They are waiting in the Private Screening Room. I have asked them to behave.',
    ]);
    expect(briefing.introduces).toEqual(['screening-room']);
  });

  it('greets a returning member briefly and does not repeat the introduction', () => {
    const record = markAnnounced(member(MORNING), ['screening-room'], 'x');
    const briefing = loungeBriefing({
      views: roomViews(MORNING, record),
      record,
      hour: 21,
      arrival: 'return',
    });
    expect(briefing.kind).toBe('reminder');
    expect(briefing.lines[0]).toBe('Good evening, Alise. Welcome back.');
    expect(briefing.lines.join(' ')).not.toMatch(/Before we begin/);
    expect(briefing.introduces).toEqual([]);
  });

  it('announces rooms that opened since he last spoke, exactly once', () => {
    let record = markAnnounced(member(MORNING), ['screening-room'], 'x');
    const views = roomViews(NIGHT, record);
    const briefing = loungeBriefing({
      views,
      record,
      hour: 21,
      arrival: 'present',
    });
    expect(briefing.introduces).toEqual(['casino', 'gift-vault', 'privileges']);
    expect(briefing.lines).toContain(
      'A small announcement, Alise: the Grand Casino has opened its doors.',
    );
    record = markAnnounced(record, briefing.introduces, 'y');
    expect(unannounced(roomViews(NIGHT, record), record)).toEqual([]);
  });

  it('promises the later rooms when nothing is open to recommend', () => {
    const record = stampRoom(
      markAnnounced(member(MORNING), ['screening-room'], 'x'),
      'screening-room',
      'completedAt',
      'y',
    );
    const early = at('2026-10-24T08:00:00-05:00');
    expect(
      loungeBriefing({
        views: roomViews(early, record),
        record,
        hour: 8,
        arrival: 'return',
      }).kind,
    ).toBe('later');
  });

  it('closes the evening once every room is complete', () => {
    let record = member(MORNING);
    for (const room of ROOMS) {
      record = stampRoom(record, room.id, 'completedAt', 'z');
      record = stampRoom(record, room.id, 'announcedAt', 'z');
    }
    expect(
      loungeBriefing({
        views: roomViews(NIGHT, record),
        record,
        hour: 23,
        arrival: 'return',
      }).kind,
    ).toBe('complete');
  });

  it('rings through his concierge lines in order, then cycles', () => {
    expect(conciergeLine(0)).toBe(CONCIERGE_LINES[0]);
    expect(conciergeLine(CONCIERGE_LINES.length)).toBe(CONCIERGE_LINES[0]);
    for (let i = 0; i < CONCIERGE_LINES.length; i += 1) {
      expect(conciergeLine(i)).not.toBe(conciergeLine(i + 1));
      expect(conciergeLine(i)).not.toMatch(/Mrs|Khera/);
    }
    expect(preparingLine('The Grand Casino')).toMatch(/^The Grand Casino is/);
  });
});
