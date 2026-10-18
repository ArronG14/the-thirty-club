/**
 * Countdown domain. Pure functions only: every value is derived from an
 * absolute timestamp, never from a decremented counter, so background tabs,
 * resumed sessions and device sleep cannot drift the display.
 */

import { instantInZone } from '../../club/domain/schedule';

export const OPENING_DATE = { year: 2026, monthIndex: 9, day: 24 } as const;
export const FINAL_MINUTE_MS = 60_000;

const SECOND = 1000;
const MINUTE = 60 * SECOND;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/** The birthday is spent in Jamaica; its midnight is the club's. */
export const OPENING_ZONE = 'America/Jamaica';

/**
 * Midnight at the start of 24 October 2026 in Jamaica (05:00 UTC), whatever
 * zone the device is set to. Amended from device-local midnight by ADR-012:
 * a phone still on London time would otherwise have opened the doors at
 * 6 pm on Friday, Jamaica time.
 */
export function openingInstant(): number {
  const { year, monthIndex, day } = OPENING_DATE;
  return instantInZone(
    {
      date: `${year}-${String(monthIndex + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`,
      time: '00:00',
    },
    OPENING_ZONE,
  );
}

export interface Remaining {
  totalMs: number;
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
}

/**
 * Remaining time, clamped at zero. Seconds round up so the display reads
 * 00:00:01 during the final second and only reaches 00:00:00 at the target,
 * matching how a mechanical countdown is read.
 */
export function remainingUntil(now: number, target: number): Remaining {
  const totalMs = Math.max(0, target - now);
  const wholeSeconds = Math.ceil(totalMs / SECOND);
  return {
    totalMs,
    days: Math.floor(wholeSeconds / (DAY / SECOND)),
    hours: Math.floor((wholeSeconds % (DAY / SECOND)) / (HOUR / SECOND)),
    minutes: Math.floor((wholeSeconds % (HOUR / SECOND)) / (MINUTE / SECOND)),
    seconds: wholeSeconds % (MINUTE / SECOND),
  };
}

export type TimePhase = 'locked' | 'final-minute' | 'open';

export function timePhase(now: number, target: number): TimePhase {
  const left = target - now;
  if (left <= 0) return 'open';
  if (left <= FINAL_MINUTE_MS) return 'final-minute';
  return 'locked';
}

/** 0 → 1 across the final minute; drives the warming light. */
export function anticipation(now: number, target: number): number {
  const left = target - now;
  if (left >= FINAL_MINUTE_MS) return 0;
  if (left <= 0) return 1;
  return 1 - left / FINAL_MINUTE_MS;
}

/** Milliseconds until the next whole-second boundary of the countdown. */
export function msUntilNextTick(now: number, target: number): number {
  const left = target - now;
  if (left <= 0) return SECOND;
  const remainder = left % SECOND;
  return remainder === 0 ? SECOND : remainder;
}

export function pad(value: number, width = 2): string {
  return String(value).padStart(width, '0');
}

export function describeRemaining({
  days,
  hours,
  minutes,
  seconds,
}: Remaining): string {
  const part = (n: number, unit: string) => `${n} ${unit}${n === 1 ? '' : 's'}`;
  return [
    part(days, 'day'),
    part(hours, 'hour'),
    part(minutes, 'minute'),
    part(seconds, 'second'),
  ].join(', ');
}
