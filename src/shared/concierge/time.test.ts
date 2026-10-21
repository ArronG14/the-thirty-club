import { describe, expect, it } from 'vitest';
import { instantToWall, wallTimeToInstant } from './time';
describe('explicit timezone scheduling', () => {
  it('resolves the approved London and Jamaica dates to exact UTC instants', () => {
    expect(wallTimeToInstant('2026-10-22T14:00', 'Europe/London')).toBe(
      '2026-10-22T13:00:00.000Z',
    );
    expect(wallTimeToInstant('2026-10-24T00:00', 'America/Jamaica')).toBe(
      '2026-10-24T05:00:00.000Z',
    );
    expect(wallTimeToInstant('2026-10-24T14:00', 'America/Jamaica')).toBe(
      '2026-10-24T19:00:00.000Z',
    );
  });
  it('rejects nonexistent and repeated London times', () => {
    expect(() =>
      wallTimeToInstant('2026-03-29T01:30', 'Europe/London'),
    ).toThrow('does not exist');
    expect(() =>
      wallTimeToInstant('2026-10-25T01:30', 'Europe/London'),
    ).toThrow('occurs twice');
  });
  it('round-trips wall times and rejects invalid calendar dates and zones', () => {
    expect(instantToWall('2026-10-24T19:00:00Z', 'America/Jamaica')).toBe(
      '2026-10-24T14:00',
    );
    expect(() =>
      wallTimeToInstant('2026-02-31T10:00', 'Europe/London'),
    ).toThrow();
    expect(() =>
      wallTimeToInstant('2026-10-24T14:00', 'invented/zone'),
    ).toThrow();
  });
});

describe('the birthday week across zones and the UK clock change (ADR-023)', () => {
  it('converts UK wall times on either side of 25 October', () => {
    expect(wallTimeToInstant('2026-10-21T19:00', 'Europe/London')).toBe(
      '2026-10-21T18:00:00.000Z',
    );
    expect(wallTimeToInstant('2026-10-22T09:00', 'Europe/London')).toBe(
      '2026-10-22T08:00:00.000Z',
    );
    // After BST ends (25 Oct 02:00 → 01:00), London is UTC again.
    expect(wallTimeToInstant('2026-10-26T09:00', 'Europe/London')).toBe(
      '2026-10-26T09:00:00.000Z',
    );
    expect(instantToWall('2026-10-25T00:30:00.000Z', 'Europe/London')).toBe(
      '2026-10-25T01:30',
    );
    expect(instantToWall('2026-10-25T01:30:00.000Z', 'Europe/London')).toBe(
      '2026-10-25T01:30',
    );
  });

  it('keeps Jamaica at UTC−5 all week (no daylight saving)', () => {
    for (const day of ['23', '24', '25', '26'])
      expect(wallTimeToInstant(`2026-10-${day}T00:00`, 'America/Jamaica')).toBe(
        `2026-10-${day}T05:00:00.000Z`,
      );
    expect(wallTimeToInstant('2026-10-24T16:00', 'America/Jamaica')).toBe(
      '2026-10-24T21:00:00.000Z',
    );
  });
});
