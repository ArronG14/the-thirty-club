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

describe('opening instant (midnight in Jamaica, ADR-012)', () => {
  it.each([
    'Europe/London',
    'America/Jamaica',
    'America/Los_Angeles',
    'Asia/Kolkata',
    'Pacific/Kiritimati',
    'UTC',
  ])('is 05:00 UTC on 24 October whatever the device zone (%s)', (zone) => {
    process.env.TZ = zone;
    expect(new Date(openingInstant()).toISOString()).toBe(
      '2026-10-24T05:00:00.000Z',
    );
  });

  it('does not move when the device changes time zone (e.g. after a flight)', () => {
    process.env.TZ = 'Europe/London';
    const london = openingInstant();
    process.env.TZ = 'America/Jamaica';
    expect(openingInstant()).toBe(london);
  });

  it('a phone still on London time counts the same final minute as Jamaica', () => {
    const instant = Date.parse('2026-10-24T04:59:30Z');
    for (const zone of ['Europe/London', 'America/Jamaica']) {
      process.env.TZ = zone;
      expect(timePhase(instant, openingInstant())).toBe('final-minute');
      expect(remainingUntil(instant, openingInstant()).seconds).toBe(30);
    }
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
