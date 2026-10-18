/**
 * Pure helpers for the real-time entrance. No three.js imports, so they
 * are unit-testable and safe to load in the main bundle.
 */

/** Vertical field of view (degrees) keeping `halfWidth` metres in frame. */
export function fitFov(
  aspect: number,
  distance: number,
  halfWidth = 1.4,
): number {
  const fov = (2 * Math.atan(halfWidth / (distance * aspect)) * 180) / Math.PI;
  return Math.min(56, Math.max(34, fov));
}

/**
 * Counter drums show one tenth of a 0–9 strip. The offset only ever grows,
 * so every change rolls forward like a real wheel (9 → 0 included). The
 * texture wraps, so the visible figure is `offset mod 1`.
 */
export function drumOffsetFor(digit: number): number {
  return (9 - digit) / 10;
}

export function advanceDrum(goal: number, shown: number, next: number): number {
  if (shown === next) return goal;
  const steps = (((shown - next) % 10) + 10) % 10;
  return goal + steps / 10;
}

export function smoothstepTowards(
  current: number,
  goal: number,
  dt: number,
  rate = 9,
): number {
  return current + (goal - current) * Math.min(1, dt * rate);
}

const easeInOutCubic = (t: number) =>
  t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

/** Door swing: 0 closed → 1 fully open (≈100° inward), over `duration` s. */
export function doorSwing(elapsed: number, duration = 3.4): number {
  return easeInOutCubic(clamp01(elapsed / duration));
}

/** Camera travel through the doorway after the doors are mostly open. */
export function cameraTravel(
  elapsed: number,
  start = 2.3,
  duration = 2.3,
): number {
  const t = clamp01((elapsed - start) / duration);
  return t * t * t;
}

/** Bolt retraction in the time-lock during the unlocking beat. */
export function boltRetraction(
  elapsed: number,
  delay = 0.35,
  duration = 0.7,
): number {
  return easeInOutCubic(clamp01((elapsed - delay) / duration));
}

export type QualityTier = 0 | 1 | 2;

export interface QualitySettings {
  pixelRatio: number;
  reflections: boolean;
  shadows: boolean;
  bloom: boolean;
}

export function qualitySettings(
  tier: QualityTier,
  devicePixelRatio: number,
): QualitySettings {
  const dpr = Math.max(1, devicePixelRatio);
  switch (tier) {
    case 0:
      return {
        pixelRatio: Math.min(dpr, 2),
        reflections: true,
        shadows: true,
        bloom: true,
      };
    case 1:
      return {
        pixelRatio: Math.min(dpr, 1.5),
        reflections: false,
        shadows: true,
        bloom: true,
      };
    case 2:
      return {
        pixelRatio: Math.min(dpr, 1.2),
        reflections: false,
        shadows: false,
        bloom: true,
      };
  }
}

/** Below this frame rate (sustained) a tier steps down. */
export const MIN_SUSTAINED_FPS = 40;

/**
 * A mean frame interval beyond this (under 5 fps) at the lowest tier is a
 * device that cannot show a moving scene at all.
 */
export const UNWATCHABLE_FRAME_MS = 200;

/**
 * Given the mean frame interval of a measurement window, decide what to do:
 * keep the tier, step down, or (only when even the lowest tier is
 * unwatchable) give up and return to the poster. A scene that merely misses
 * 40 fps at the lowest tier keeps running: a 30 fps cinematic entrance beats
 * a still image, and a refresh cap (Low Power Mode) is not a failure.
 */
export function judgeFrameTime(
  meanMs: number,
  tier: QualityTier,
): 'keep' | 'lower' | 'fallback' {
  if (meanMs <= 1000 / MIN_SUSTAINED_FPS) return 'keep';
  if (tier < 2) return 'lower';
  return meanMs > UNWATCHABLE_FRAME_MS ? 'fallback' : 'keep';
}
