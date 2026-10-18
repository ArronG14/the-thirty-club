import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { openingInstant, timePhase } from '../domain/countdown';
import { resolveDevPreview } from './devPreview';

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(2026, 9, 17, 20, 0, 0));
});
afterEach(() => {
  vi.useRealTimers();
  window.localStorage.clear();
});

describe('development preview', () => {
  it('is inactive without a recognised preview parameter', () => {
    expect(resolveDevPreview('')).toBeNull();
    expect(resolveDevPreview('?preview=vault')).toBeNull();
    expect(resolveDevPreview('?other=lounge')).toBeNull();
    expect(resolveDevPreview('?preview=foyer')).toBeNull();
  });

  it.each([
    ['locked', 'locked'],
    ['midnight', 'final-minute'],
    ['arrival', 'open'],
    ['induction', 'open'],
    ['lounge', 'open'],
    ['evening', 'open'],
  ] as const)('starts %s in the %s phase', (mode, phase) => {
    const env = resolveDevPreview(`?preview=${mode}`);
    expect(env?.preview).toBe(mode);
    expect(timePhase(env!.clock.now(), openingInstant())).toBe(phase);
  });

  it('starts the final-minute preview just before the light begins', () => {
    const env = resolveDevPreview('?preview=final-minute')!;
    expect(timePhase(env.clock.now(), openingInstant())).toBe('locked');
    vi.advanceTimersByTime(4_000);
    expect(timePhase(env.clock.now(), openingInstant())).toBe('final-minute');
  });

  it('runs a shifted clock that still ticks in real time', () => {
    const env = resolveDevPreview('?preview=midnight')!;
    const start = env.clock.now();
    vi.advanceTimersByTime(8_000);
    expect(env.clock.now() - start).toBe(8_000);
    expect(timePhase(env.clock.now(), openingInstant())).toBe('open');
  });

  it('uses in-memory storage and never touches the real record', () => {
    const env = resolveDevPreview('?preview=lounge')!;
    expect(env.storage.load().ceremonySeenAt).not.toBeNull();
    expect(env.membership.load().inductedAt).not.toBeNull();
    env.storage.save({ unlockedAt: null, ceremonySeenAt: null });
    env.membership.save({ inductedAt: null, rooms: {} });
    expect(window.localStorage.length).toBe(0);
    expect(resolveDevPreview('?preview=arrival')!.storage.load()).toEqual({
      unlockedAt: null,
      ceremonySeenAt: null,
    });
  });
});
