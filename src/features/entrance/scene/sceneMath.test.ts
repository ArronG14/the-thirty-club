import { describe, expect, it } from 'vitest';
import {
  advanceDrum,
  boltRetraction,
  cameraTravel,
  doorSwing,
  drumOffsetFor,
  fitFov,
  judgeFrameTime,
  qualitySettings,
  smoothstepTowards,
} from './sceneMath';

const visibleDigit = (offset: number) => {
  const wrapped = ((offset % 1) + 1) % 1;
  return Math.round(9 - wrapped * 10 + 10) % 10;
};

describe('counter drums', () => {
  it('maps each figure to its tenth of the strip', () => {
    for (let d = 0; d < 10; d += 1) {
      expect(visibleDigit(drumOffsetFor(d))).toBe(d);
    }
  });

  it('always rolls forward, including through the wrap', () => {
    let goal = drumOffsetFor(3);
    goal = advanceDrum(goal, 3, 2);
    expect(visibleDigit(goal)).toBe(2);
    goal = advanceDrum(goal, 2, 1);
    goal = advanceDrum(goal, 1, 0);
    const beforeWrap = goal;
    goal = advanceDrum(goal, 0, 9); // seconds 00 → 59 on the units drum
    expect(goal).toBeCloseTo(beforeWrap + 0.1);
    expect(visibleDigit(goal)).toBe(9);
    // Tens of seconds 0 → 5 rolls five steps forward, never backwards.
    expect(advanceDrum(0.9, 0, 5)).toBeCloseTo(1.4);
  });

  it('holds still when the figure is unchanged', () => {
    expect(advanceDrum(0.4, 5, 5)).toBe(0.4);
  });

  it('eases towards the goal without overshooting', () => {
    const v = smoothstepTowards(0, 1, 1 / 60);
    expect(v).toBeGreaterThan(0);
    expect(v).toBeLessThan(1);
    expect(smoothstepTowards(0, 1, 1)).toBe(1);
  });
});

describe('ceremony curves', () => {
  it('opens the doors from closed to fully open within the opening beat', () => {
    expect(doorSwing(0)).toBe(0);
    expect(doorSwing(1.7)).toBeCloseTo(0.5);
    expect(doorSwing(3.4)).toBe(1);
    expect(doorSwing(10)).toBe(1);
  });

  it('only travels through the doorway once they are mostly open', () => {
    expect(cameraTravel(2)).toBe(0);
    expect(cameraTravel(4.6)).toBe(1);
    // Travel completes within the 4.6 s opening stage of the timeline.
    expect(2.3 + 2.3).toBeLessThanOrEqual(4.6);
  });

  it('withdraws the bolt during the unlocking beat', () => {
    expect(boltRetraction(0)).toBe(0);
    expect(boltRetraction(1.05)).toBe(1);
  });
});

describe('framing and quality', () => {
  it('widens the lens on narrow portrait screens, within limits', () => {
    const phone = fitFov(390 / 844, 5.6);
    const desktop = fitFov(1280 / 800, 5.6);
    expect(phone).toBeGreaterThan(desktop);
    expect(phone).toBeLessThanOrEqual(56);
    expect(desktop).toBeGreaterThanOrEqual(34);
  });

  it('steps quality down before giving up', () => {
    expect(judgeFrameTime(16.7, 0)).toBe('keep');
    expect(judgeFrameTime(30, 0)).toBe('lower');
    expect(judgeFrameTime(30, 1)).toBe('lower');
    // At the lowest tier a slow scene still plays; only an unwatchable one
    // gives up.
    expect(judgeFrameTime(30, 2)).toBe('keep');
    expect(judgeFrameTime(33.4, 2)).toBe('keep');
    expect(judgeFrameTime(250, 2)).toBe('fallback');
  });

  it('sheds the expensive passes first and caps the pixel ratio', () => {
    expect(qualitySettings(0, 3)).toEqual({
      pixelRatio: 2,
      reflections: true,
      shadows: true,
      bloom: true,
    });
    expect(qualitySettings(1, 3).reflections).toBe(false);
    expect(qualitySettings(2, 3)).toMatchObject({
      pixelRatio: 1.2,
      shadows: false,
    });
    expect(qualitySettings(0, 1).pixelRatio).toBe(1);
  });
});
