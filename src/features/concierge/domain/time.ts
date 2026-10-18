/**
 * Explicit-zone time for the concierge. Every instant the concierge acts on
 * is a wall clock in a named IANA zone: the device's own zone is never used,
 * because Alise flies from London to Jamaica in the middle of the journey.
 */
import { instantInZone, type WallClock } from '../../club/domain/schedule.ts';

export const UK_ZONE = 'Europe/London';
export const JAMAICA_ZONE = 'America/Jamaica';

export interface ZonedWallClock extends WallClock {
  zone: string;
}

export function instantOf(at: ZonedWallClock): number {
  return instantInZone(at, at.zone);
}

const ZONE_NAMES: Record<string, string> = {
  [UK_ZONE]: 'UK time',
  [JAMAICA_ZONE]: 'Jamaica time',
};

/** "2 pm" or "6:30 pm" on a clock in `zone`. */
export function clockTime(instant: number, zone: string): string {
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

/** "Thursday 22 October" on a calendar in `zone`. */
export function calendarDay(instant: number, zone: string): string {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: zone,
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  })
    .format(new Date(instant))
    .replace(',', '');
}

/** "Thursday 22 October, 2 pm UK time". */
export function describeInstant(instant: number, zone: string): string {
  const name = ZONE_NAMES[zone] ?? zone;
  return `${calendarDay(instant, zone)}, ${clockTime(instant, zone)} ${name}`;
}

/** "22 OCT" for stamps and boards. */
export function stampDate(instant: number, zone: string): string {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: zone,
    day: '2-digit',
    month: 'short',
  })
    .format(new Date(instant))
    .toUpperCase();
}

/** "THU 14:00" for the departures board. */
export function boardTime(instant: number, zone: string): string {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: zone,
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(new Date(instant));
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? '';
  return `${get('weekday').toUpperCase()} ${get('hour')}:${get('minute')}`;
}

export interface Countdown {
  days: number;
  hours: number;
  minutes: number;
}

/** Whole minutes remaining (rounded up), clamped at zero. */
export function countdown(now: number, target: number): Countdown {
  const minutes = Math.ceil(Math.max(0, target - now) / 60_000);
  return {
    days: Math.floor(minutes / 1440),
    hours: Math.floor((minutes % 1440) / 60),
    minutes: minutes % 60,
  };
}

/** "2 days, 4 hours" / "3 hours, 12 minutes" / "under a minute". */
export function describeCountdown(now: number, target: number): string {
  const left = target - now;
  if (left <= 0) return 'now';
  if (left < 60_000) return 'under a minute';
  const { days, hours, minutes } = countdown(now, target);
  const part = (n: number, unit: string) => `${n} ${unit}${n === 1 ? '' : 's'}`;
  if (days > 0) return [part(days, 'day'), part(hours, 'hour')].join(', ');
  if (hours > 0)
    return [part(hours, 'hour'), part(minutes, 'minute')].join(', ');
  return part(minutes, 'minute');
}

/** The hour (0–23) on a clock in `zone`. */
export function hourInZone(instant: number, zone: string): number {
  return Number(
    new Intl.DateTimeFormat('en-GB', {
      timeZone: zone,
      hour: '2-digit',
      hourCycle: 'h23',
    }).format(new Date(instant)),
  );
}

/** "Good afternoon" for the time of day in `zone`. */
export function greetingIn(instant: number, zone: string): string {
  const hour = hourInZone(instant, zone);
  if (hour >= 5 && hour < 12) return 'Good morning';
  if (hour >= 12 && hour < 18) return 'Good afternoon';
  return 'Good evening';
}
