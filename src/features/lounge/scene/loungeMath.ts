/**
 * Pure helpers for the lounge camera and light. No three.js imports, so
 * they are unit-testable.
 */

export type LoungeFocus =
  | 'room'
  | 'hearth'
  | 'screening'
  | 'directory'
  /** Walking her towards the screening-room doorway (the escort). */
  | 'escort';

export interface Shot {
  position: [number, number, number];
  look: [number, number, number];
  /** Half-width (m) kept in frame at the look point's distance. */
  halfWidth: number;
}

/**
 * Camera framings. `room` is a three-quarter view from beside the left
 * sofa: the fire, the champagne and, beyond, the curtained doorway to the
 * Private Screening Room, so the next destination is always in sight.
 */
export const SHOTS: Record<LoungeFocus, Shot> = {
  room: {
    position: [-1.2, 1.45, 2.2],
    look: [0.7, 1.1, -4.6],
    halfWidth: 2.3,
  },
  hearth: {
    position: [0, 1.55, 0.6],
    look: [0, 0.78, -4.6],
    halfWidth: 1.6,
  },
  screening: {
    position: [0.25, 1.55, 0.4],
    look: [1.98, 1.3, -4.6],
    halfWidth: 1.5,
  },
  directory: {
    position: [-0.7, 1.58, 0.9],
    look: [-1.98, 1.55, -4.6],
    halfWidth: 1.4,
  },
  escort: {
    position: [1.05, 1.5, -1.6],
    look: [1.98, 1.3, -4.6],
    halfWidth: 0.85,
  },
};

/** Where the camera stands as the entrance doors hand over. */
export const ARRIVAL: [number, number, number] = [0, 1.55, 6.4];

/**
 * Vertical field of view (degrees) that keeps `halfWidth` metres in frame
 * at `distance`. Portrait screens get a tall view of floor and ceiling.
 */
export function shotFov(aspect: number, distance: number, halfWidth: number) {
  const horizontalHalf = Math.atan(halfWidth / distance);
  const fov =
    (2 * Math.atan(Math.tan(horizontalHalf) / aspect) * 180) / Math.PI;
  return Math.min(74, Math.max(38, fov));
}

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

/** Arrival dolly from the doorway to the room shot: 0 → 1, eased out. */
export function arrivalProgress(elapsed: number, duration = 4.2): number {
  const t = clamp01(elapsed / duration);
  return 1 - Math.pow(1 - t, 3);
}

/** Exposure during arrival: still dazzled by the doorway, then settling. */
export function arrivalExposure(progress: number): number {
  return 1 + (1 - progress) * 1.4;
}

/**
 * Firelight: a few incommensurate sines, so it never visibly loops.
 * Returns roughly 0.75–1.15. Reduced motion calms it to a slow breath.
 */
export function flicker(t: number, reducedMotion = false): number {
  if (reducedMotion) return 0.95 + 0.05 * Math.sin(t * 0.8);
  return (
    0.95 +
    0.09 * Math.sin(t * 7.3) +
    0.06 * Math.sin(t * 12.9 + 1.7) +
    0.05 * Math.sin(t * 3.1 + 0.4)
  );
}

/** Frame-rate independent exponential approach. */
export function approach(
  current: number,
  goal: number,
  dt: number,
  rate = 2.2,
) {
  return current + (goal - current) * (1 - Math.exp(-rate * dt));
}
