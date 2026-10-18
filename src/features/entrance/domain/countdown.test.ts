import { afterEach, describe, expect, it } from 'vitest';
import {
  anticipation,
  describeRemaining,
  msUntilNextTick,
  openingInstant,
  remainingUntil,
  timePhase,
} from './countdown';

const originalTz = process.env.TZ;
afterEach(() => {
  process.env.TZ = originalTz;
});

const SECOND = 1000;
const MINUTE = 60 * SECOND;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

describe('opening instant (device-local midnight)', () => {
  it.each([
    ['Europe/London', '2026-10-23T23:00:00.000Z'], // BST, UTC+1
    ['America/Jamaica', '2026-10-24T05:00:00.000Z'], // EST all year, UTC−5
    ['America/Los_Angeles', '2026-10-24T07:00:00.000Z'], // PDT, UTC−7
    ['Asia/Kolkata', '2026-10-23T18:30:00.000Z'], // UTC+5:30
    ['Pacific/Kiritimati', '2026-10-23T10:00:00.000Z'], // UTC+14
    ['UTC', '2026-10-24T00:00:00.000Z'],
  ])('is 00:00 on 24 October in %s', (zone, utc) => {
    process.env.TZ = zone;
    const instant = new Date(openingInstant());
    expect(instant.toISOString()).toBe(utc);
    expect(instant.getFullYear()).toBe(2026);
    expect(instant.getMonth()).toBe(9);
    expect(instant.getDate()).toBe(24);
    expect(instant.getHours()).toBe(0);
    expect(instant.getMinutes()).toBe(0);
  });

  it('follows the device when it changes time zone (e.g. after a flight)', () => {
    process.env.TZ = 'Europe/London';
    const london = openingInstant();
    process.env.TZ = 'America/Jamaica';
    const jamaica = openingInstant();
    expect(jamaica - london).toBe(6 * HOUR);
  });

  it('is open in London while Jamaica is still counting the final minute', () => {
    const instant = Date.parse('2026-10-24T04:59:30Z');
    process.env.TZ = 'Europe/London';
    expect(timePhase(instant, openingInstant())).toBe('open');
    process.env.TZ = 'America/Jamaica';
    expect(timePhase(instant, openingInstant())).toBe('final-minute');
    expect(remainingUntil(instant, openingInstant()).seconds).toBe(30);
  });
});

describe('remaining time', () => {
  const target = Date.UTC(2026, 9, 24);

  it('breaks the interval into days, hours, minutes and seconds', () => {
    const now = target - (6 * DAY + 3 * HOUR + 4 * MINUTE + 5 * SECOND);
    expect(remainingUntil(now, target)).toEqual({
      totalMs: 6 * DAY + 3 * HOUR + 4 * MINUTE + 5 * SECOND,
      days: 6,
      hours: 3,
      minutes: 4,
      seconds: 5,
    });
  });

  it('rounds partial seconds up so zero is only shown at the target', () => {
    expect(remainingUntil(target - 1, target).seconds).toBe(1);
    expect(remainingUntil(target - 999, target).seconds).toBe(1);
    expect(remainingUntil(target - 1001, target).seconds).toBe(2);
    expect(remainingUntil(target - 59_001, target)).toMatchObject({
      minutes: 1,
      seconds: 0,
    });
  });

  it('never goes negative once the date has passed', () => {
    for (const late of [0, 1, SECOND, DAY, 400 * DAY]) {
      expect(remainingUntil(target + late, target)).toEqual({
        totalMs: 0,
        days: 0,
        hours: 0,
        minutes: 0,
        seconds: 0,
      });
    }
  });

  it('is a pure function of the clock, so resumed sessions catch up', () => {
    const asleepAt = target - 3 * DAY;
    const wokeAt = asleepAt + 2 * DAY + 5 * HOUR;
    expect(remainingUntil(wokeAt, target)).toMatchObject({
      days: 0,
      hours: 19,
      minutes: 0,
      seconds: 0,
    });
  });

  it('describes the time in words for assistive technology', () => {
    expect(
      describeRemaining({
        totalMs: 0,
        days: 1,
        hours: 0,
        minutes: 2,
        seconds: 1,
      }),
    ).toBe('1 day, 0 hours, 2 minutes, 1 second');
  });
});

describe('phases and anticipation', () => {
  const target = Date.UTC(2026, 9, 24);

  it('locks, enters the final minute at sixty seconds, opens at zero', () => {
    expect(timePhase(target - MINUTE - 1, target)).toBe('locked');
    expect(timePhase(target - MINUTE, target)).toBe('final-minute');
    expect(timePhase(target - 1, target)).toBe('final-minute');
    expect(timePhase(target, target)).toBe('open');
    expect(timePhase(target + DAY, target)).toBe('open');
  });

  it('warms from 0 to 1 across the final minute only', () => {
    expect(anticipation(target - 2 * MINUTE, target)).toBe(0);
    expect(anticipation(target - MINUTE, target)).toBe(0);
    expect(anticipation(target - 30 * SECOND, target)).toBeCloseTo(0.5);
    expect(anticipation(target, target)).toBe(1);
  });

  it('schedules ticks on the countdown’s own second boundaries', () => {
    expect(msUntilNextTick(target - 5_250, target)).toBe(250);
    expect(msUntilNextTick(target - 5_000, target)).toBe(1000);
    expect(msUntilNextTick(target + 10, target)).toBe(1000);
  });
});
