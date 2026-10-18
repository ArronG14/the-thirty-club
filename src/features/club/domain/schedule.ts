/**
 * When the birthday's later rooms open. Every hour here is PROVISIONAL and
 * awaits owner confirmation (task D02); change them here and nowhere else.
 *
 * Scheduled unlocks use Jamaica wall-clock time, where the birthday is
 * spent, regardless of the device's zone. (The entrance deliberately keeps
 * device-local midnight; see ADR-006.)
 */

export const CLUB_TIME_ZONE = 'America/Jamaica';

export interface WallClock {
  /** ISO calendar date, e.g. '2026-10-24'. */
  date: string;
  /** 24-hour time, e.g. '14:00'. */
  time: string;
}

export const ROOM_SCHEDULE = {
  privileges: { date: '2026-10-24', time: '10:00' },
  casino: { date: '2026-10-24', time: '14:00' },
  'gift-vault': { date: '2026-10-24', time: '18:00' },
} as const satisfies Record<string, WallClock>;

/** UTC offset of `zone` at `instant`, in milliseconds (east positive). */
export function zoneOffsetMs(instant: number, zone: string): number {
  const whole = Math.floor(instant / 1000) * 1000;
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: zone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(new Date(whole));
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((part) => part.type === type)?.value ?? 0);
  const asUtc = Date.UTC(
    get('year'),
    get('month') - 1,
    get('day'),
    get('hour'),
    get('minute'),
    get('second'),
  );
  return asUtc - whole;
}

/** The instant at which `zone`'s wall clock reads `at`. */
export function instantInZone(at: WallClock, zone = CLUB_TIME_ZONE): number {
  const [year = 0, month = 1, day = 1] = at.date.split('-').map(Number);
  const [hour = 0, minute = 0] = at.time.split(':').map(Number);
  const naive = Date.UTC(year, month - 1, day, hour, minute);
  const first = naive - zoneOffsetMs(naive, zone);
  // A second pass settles instants near an offset change.
  return naive - zoneOffsetMs(first, zone);
}

/** "2 pm" or "2:30 pm", as read on a clock in the club's zone. */
export function formatClubTime(instant: number, zone = CLUB_TIME_ZONE) {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: zone,
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  })
    .format(new Date(instant))
    .replace(':00', '')
    .replace(/\s/g, ' ')
    .toLowerCase();
}
