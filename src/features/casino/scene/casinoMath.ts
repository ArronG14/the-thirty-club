/**
 * Pure maths for the casino scene: camera shots and paths, the roulette
 * spin plan and the reel spin plan. No three.js, so it is unit-testable and
 * is where the "animation agrees with the engine" guarantees are proved.
 */
import { POCKETS } from '../domain/roulette';
import { REEL_LENGTH } from '../domain/slots';

export type Vec3 = readonly [number, number, number];
export type Station = 'lobby' | 'roulette' | 'slots';

const TAU = Math.PI * 2;
const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

/* ---------------------------------------------------------------- */
/* Camera                                                            */
/* ---------------------------------------------------------------- */

export interface Shot {
  eye: Vec3;
  look: Vec3;
  /** Half-width (m) kept in frame at the look point's distance. */
  halfWidth: number;
  /** Half-height (m) always kept in frame, which governs landscape. */
  halfHeight: number;
}

/**
 * Room: x ±4, z −5 … 5.6, ceiling 4.4. Roulette table centred at
 * (−1.4, −1.2); slot machine at (2.3, −3.9) facing the room.
 */
export const SHOTS: Record<Station, Shot> = {
  lobby: {
    eye: [-0.3, 1.75, 5.3],
    look: [-0.3, 1.15, -2.4],
    halfWidth: 3.4,
    halfHeight: 2.4,
  },
  roulette: {
    eye: [-1.4, 2.6, -0.7],
    look: [-1.4, 0.8, -1.6],
    halfWidth: 0.62,
    halfHeight: 0.8,
  },
  slots: {
    eye: [2.3, 1.62, -1.5],
    look: [2.3, 1.12, -3.9],
    halfWidth: 1.0,
    halfHeight: 1.05,
  },
};

/**
 * Landscape framings. The wheel and the machine are centred on their own
 * height rather than hung from the top of a tall portrait frame.
 */
export const LANDSCAPE_SHOTS: Partial<Record<Station, Shot>> = {
  roulette: {
    eye: [-1.4, 2.45, -0.95],
    look: [-1.4, 0.95, -1.85],
    halfWidth: 0.9,
    halfHeight: 0.62,
  },
  slots: {
    eye: [2.3, 1.75, -1.5],
    look: [2.3, 1.5, -3.9],
    halfWidth: 1.0,
    halfHeight: 1.4,
  },
};

/** The shot for a station at this aspect ratio. */
export function shotFor(station: Station, aspect: number): Shot {
  return (aspect > 1.2 && LANDSCAPE_SHOTS[station]) || SHOTS[station];
}

/** Intermediate eye positions, chosen in open floor and above furniture. */
export const VIA: Record<Exclude<Station, 'lobby'>, readonly Vec3[]> = {
  roulette: [
    [-0.4, 1.95, 2.5],
    [-1.2, 2.3, 0.9],
  ],
  slots: [
    [1.5, 1.8, 2.5],
    [2.15, 1.7, 0.5],
  ],
};

/** Seconds a station-to-station camera move takes. */
export const TRAVEL_SECONDS = 2.5;

export const easeInOutCubic = (t: number) =>
  t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/** Catmull-Rom through `points`, parameter u ∈ [0, 1] over the whole path. */
export function catmullRom(points: readonly Vec3[], u: number): Vec3 {
  const n = points.length - 1;
  if (n <= 0) return points[0]!;
  const f = clamp01(u) * n;
  const i = Math.min(n - 1, Math.floor(f));
  const t = f - i;
  const p0 = points[Math.max(0, i - 1)]!;
  const p1 = points[i]!;
  const p2 = points[i + 1]!;
  const p3 = points[Math.min(n, i + 2)]!;
  const axis = (k: 0 | 1 | 2): number => {
    const a = p0[k];
    const b = p1[k];
    const c = p2[k];
    const d = p3[k];
    return (
      0.5 *
      (2 * b +
        (-a + c) * t +
        (2 * a - 5 * b + 4 * c - d) * t * t +
        (-a + 3 * b - 3 * c + d) * t * t * t)
    );
  };
  return [axis(0), axis(1), axis(2)];
}

export interface CameraPose {
  eye: Vec3;
  look: Vec3;
  halfWidth: number;
  halfHeight: number;
}

/**
 * Pose on a move from `from` to `to`, `progress` in [0, 1] (unEased). The
 * eye follows the waypoints; the look point leads slightly so the camera
 * turns before it arrives.
 */
export function cameraPose(
  from: Shot,
  to: Shot,
  via: readonly Vec3[],
  progress: number,
): CameraPose {
  const eased = easeInOutCubic(clamp01(progress));
  const lead = easeInOutCubic(clamp01(progress * 1.15));
  const eye = catmullRom([from.eye, ...via, to.eye], eased);
  return {
    eye,
    look: [
      lerp(from.look[0], to.look[0], lead),
      lerp(from.look[1], to.look[1], lead),
      lerp(from.look[2], to.look[2], lead),
    ],
    halfWidth: lerp(from.halfWidth, to.halfWidth, eased),
    halfHeight: lerp(from.halfHeight, to.halfHeight, eased),
  };
}

/** The waypoints between two stations; moves always pass through none. */
export function viaFor(from: Station, to: Station): readonly Vec3[] {
  if (from === 'lobby' && to !== 'lobby') return VIA[to];
  if (to === 'lobby' && from !== 'lobby') return [...VIA[from]].reverse();
  return [];
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

/**
 * Vertical fov (degrees) keeping `halfWidth` metres in frame horizontally
 * and `halfHeight` vertically at `distance`. Portrait is governed by the
 * width, landscape by the height.
 */
export function fovFor(
  aspect: number,
  distance: number,
  halfWidth: number,
  halfHeight = 0,
) {
  const horizontalHalf = Math.atan(halfWidth / distance);
  const byWidth =
    (2 * Math.atan(Math.tan(horizontalHalf) / aspect) * 180) / Math.PI;
  const byHeight = (2 * Math.atan(halfHeight / distance) * 180) / Math.PI;
  return Math.min(84, Math.max(34, byWidth, byHeight));
}

/* ---------------------------------------------------------------- */
/* Roulette                                                          */
/* ---------------------------------------------------------------- */

/** Angle between neighbouring pockets. */
export const POCKET_STEP = TAU / POCKETS;

/**
 * Angles are measured clockwise from "away from the camera" (−z) as seen
 * from above, which is the order the numbers run round a real wheel. The
 * wheel group rotates about +Y by α; that carries a pocket's world angle
 * from φ to φ − α (counter-clockwise), and the ball runs clockwise.
 */
export const pocketAngle = (pocket: number) => pocket * POCKET_STEP;

/** Which pocket lies under world angle `phi` when the wheel is at `alpha`. */
export function pocketUnder(phi: number, alpha: number): number {
  const raw = Math.round((phi + alpha) / POCKET_STEP);
  return ((raw % POCKETS) + POCKETS) % POCKETS;
}

export const WHEEL = {
  /** Radius of the ball track at the rim, and of the pocket centres. */
  trackRadius: 0.385,
  pocketRadius: 0.245,
  ballRadius: 0.022,
  /** The head (pockets) is flat out to here; the ball track then rises. */
  headRadius: 0.355,
  rimRadius: 0.4,
  trackSlope: 1.2,
} as const;

/** Height of the bowl surface above the pocket floor at radius `r`. */
export const trackHeight = (r: number) =>
  Math.max(0, r - WHEEL.headRadius) * WHEEL.trackSlope;

export interface SpinPlan {
  /** Index on the wheel (0…36), NOT the number. */
  pocket: number;
  wheelStart: number;
  /** Ball flight time; it is locked into the pocket from here on. */
  ballSeconds: number;
  /** The wheel keeps turning, slowing, for this long. */
  wheelSeconds: number;
  wheelTravel: number;
  ballTravel: number;
}

export function planSpin(args: {
  pocket: number;
  wheelStart: number;
  reducedMotion: boolean;
}): SpinPlan {
  const { pocket, wheelStart, reducedMotion } = args;
  return reducedMotion
    ? {
        pocket,
        wheelStart,
        ballSeconds: 1.8,
        wheelSeconds: 2.6,
        wheelTravel: TAU * 0.9,
        ballTravel: TAU * 1.4,
      }
    : {
        pocket,
        wheelStart,
        ballSeconds: 8.2,
        wheelSeconds: 10.6,
        wheelTravel: TAU * 3.6,
        ballTravel: TAU * 6.3,
      };
}

export const wheelAngle = (plan: SpinPlan, t: number) => {
  const u = clamp01(t / plan.wheelSeconds);
  return plan.wheelStart + plan.wheelTravel * (1 - Math.pow(1 - u, 3));
};

export interface BallState {
  /** World angle of the ball. */
  phi: number;
  radius: number;
  /** Height above the pocket floor. */
  lift: number;
  settled: boolean;
}

const smooth = (t: number) => t * t * (3 - 2 * t);

/**
 * Where the ball is `t` seconds after launch. Until `ballSeconds` it runs
 * clockwise on the track, decelerating, then drops and hops into the
 * pocket; from then on it rides the pocket. The two halves agree exactly
 * at the join, so the ball ends in `plan.pocket` by construction.
 */
export function ballState(plan: SpinPlan, t: number): BallState {
  const end = pocketAngle(plan.pocket) - wheelAngle(plan, plan.ballSeconds);
  if (t >= plan.ballSeconds) {
    return {
      phi: pocketAngle(plan.pocket) - wheelAngle(plan, t),
      radius: WHEEL.pocketRadius,
      lift: 0,
      settled: true,
    };
  }
  const s = clamp01(t / plan.ballSeconds);
  const phi = end - plan.ballTravel * Math.pow(1 - s, 2.2);
  const fall = smooth(clamp01((s - 0.55) / 0.35));
  const radius = lerp(WHEEL.trackRadius, WHEEL.pocketRadius, fall);
  const hopT = clamp01((s - 0.9) / 0.1);
  const hop =
    s > 0.9 ? 0.016 * Math.abs(Math.sin(hopT * Math.PI * 2.5)) * (1 - hopT) : 0;
  // Rolling on the sloped track, the ball sits higher the further out it is.
  return { phi, radius, lift: trackHeight(radius) + hop, settled: false };
}

/* ---------------------------------------------------------------- */
/* Reels                                                             */
/* ---------------------------------------------------------------- */

export interface ReelPlan {
  /** Strip index the reel starts on (an integer). */
  start: number;
  /** Strip index that finishes on the payline. */
  stop: number;
  /** Symbols travelled: ≡ stop − start (mod REEL_LENGTH). */
  travel: number;
  seconds: number;
  /** Seconds to wait before this reel begins to turn. */
  delay: number;
}

const RAMP_UP = 0.12;
const RAMP_DOWN = 0.3;
/** Fraction of full-speed travel covered by the velocity profile. */
const PROFILE_AREA = 1 - (RAMP_UP + RAMP_DOWN) / 2;

export function planReel(args: {
  start: number;
  stop: number;
  reel: number;
  reducedMotion: boolean;
}): ReelPlan {
  const { start, stop, reel, reducedMotion } = args;
  const seconds = reducedMotion ? 0.8 + reel * 0.3 : 2.1 + reel * 0.6;
  const speed = reducedMotion ? 7 : 15; // symbols per second at full speed
  const wanted = speed * seconds * PROFILE_AREA;
  const remainder =
    (((stop - start) % REEL_LENGTH) + REEL_LENGTH) % REEL_LENGTH;
  const turns = Math.max(1, Math.round((wanted - remainder) / REEL_LENGTH));
  return {
    start,
    stop,
    travel: turns * REEL_LENGTH + remainder,
    seconds,
    delay: reducedMotion ? 0 : reel * 0.08,
  };
}

function profile(u: number): number {
  const a = RAMP_UP;
  const d = RAMP_DOWN;
  if (u <= 0) return 0;
  if (u < a) return (u * u) / (2 * a);
  if (u <= 1 - d) return a / 2 + (u - a);
  const x = Math.min(u, 1) - (1 - d);
  return a / 2 + (1 - d - a) + x - (x * x) / (2 * d);
}

/** Total seconds for a reel including its settle. */
export const reelTotalSeconds = (plan: ReelPlan) =>
  plan.delay + plan.seconds + 0.5;

/**
 * Position of a reel in symbol units, `t` seconds after the spin began.
 * Accelerates, runs, decelerates, overshoots a hair and settles; exactly
 * `start + travel` (an integer ≡ stop) from the end of the settle on.
 */
export function reelPosition(plan: ReelPlan, t: number): number {
  const local = t - plan.delay;
  if (local <= 0) return plan.start;
  const u = clamp01(local / plan.seconds);
  const base =
    u >= 1
      ? plan.start + plan.travel
      : plan.start + (plan.travel * profile(u)) / PROFILE_AREA;
  if (local <= plan.seconds) return base;
  const tau = local - plan.seconds;
  return (
    base + 0.07 * Math.sin(tau * 22) * Math.exp(-tau * 9) * (tau < 0.5 ? 1 : 0)
  );
}

/** The strip index on the payline once the reel has stopped. */
export const finalStop = (plan: ReelPlan) =>
  (((plan.start + plan.travel) % REEL_LENGTH) + REEL_LENGTH) % REEL_LENGTH;
