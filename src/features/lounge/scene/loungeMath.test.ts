import { describe, expect, it } from 'vitest';
import {
  approach,
  arrivalExposure,
  arrivalProgress,
  flicker,
  shotFov,
  SHOTS,
} from './loungeMath';

describe('lounge camera', () => {
  it('widens the vertical view on a portrait phone and clamps it', () => {
    const portrait = shotFov(390 / 844, 7, SHOTS.room.halfWidth);
    const landscape = shotFov(844 / 390, 7, SHOTS.room.halfWidth);
    expect(portrait).toBeGreaterThan(landscape);
    expect(portrait).toBeLessThanOrEqual(74);
    expect(landscape).toBeGreaterThanOrEqual(38);
  });

  it('eases the arrival in from the doorway and settles', () => {
    expect(arrivalProgress(0)).toBe(0);
    expect(arrivalProgress(2)).toBeGreaterThan(0.5);
    expect(arrivalProgress(10)).toBe(1);
    expect(arrivalExposure(0)).toBeGreaterThan(arrivalExposure(1));
    expect(arrivalExposure(1)).toBe(1);
  });

  it('approaches a goal without overshooting, whatever the frame time', () => {
    expect(approach(0, 1, 0)).toBe(0);
    expect(approach(0, 1, 0.05)).toBeGreaterThan(0);
    expect(approach(0, 1, 100)).toBeLessThanOrEqual(1);
  });

  it('keeps firelight within a gentle band, calmer under reduced motion', () => {
    let lo = Infinity;
    let hi = -Infinity;
    let calmLo = Infinity;
    let calmHi = -Infinity;
    for (let t = 0; t < 60; t += 0.01) {
      lo = Math.min(lo, flicker(t));
      hi = Math.max(hi, flicker(t));
      calmLo = Math.min(calmLo, flicker(t, true));
      calmHi = Math.max(calmHi, flicker(t, true));
    }
    expect(lo).toBeGreaterThan(0.7);
    expect(hi).toBeLessThan(1.2);
    expect(calmHi - calmLo).toBeLessThan((hi - lo) / 2);
  });
});
