/**
 * Pure geometry and timing for the Gift Vault chamber: no three.js, so it
 * is unit-tested. The chamber is a D-shaped rotunda: a curved bank of
 * deposit boxes at the back (an arc around the origin) and a straight front
 * wall pierced by the monumental round vault door.
 */
export type Vec3 = readonly [number, number, number];

export const TAU = Math.PI * 2;
export const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const easeInOutCubic = (t: number) =>
  t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2;
export const easeOutCubic = (t: number) => 1 - (1 - t) ** 3;
const span = (t: number, from: number, to: number) =>
  clamp01((t - from) / (to - from));

/* ---------------------------------------------------------------- */
/* The bank of boxes                                                 */
/* ---------------------------------------------------------------- */

export const BANK = {
  /** Radius of the box faces from the chamber's centre, metres. */
  radius: 3.4,
  columns: 13,
  rows: 5,
  /** Angle between neighbouring columns. */
  step: (11 * Math.PI) / 180,
  /** Height of the plinth under the lowest row. */
  base: 0.44,
  rowHeight: 0.46,
  /** Recess from the face to the back of each compartment. */
  depth: 0.46,
  doorWidth: 0.56,
  doorHeight: 0.4,
} as const;

/** The row at eye height; Alise's compartments start here. */
export const EYE_ROW = 2;

export interface Cell {
  column: number;
  row: number;
}

export interface CellFrame {
  /** Centre of the door face. */
  centre: Vec3;
  /** Unit vector from the face towards the chamber. */
  normal: Vec3;
  /** Rotation about Y that turns a +Z-facing door to face the chamber. */
  yaw: number;
}

export function columnAngle(column: number): number {
  return (column - (BANK.columns - 1) / 2) * BANK.step;
}

export function rowCentre(row: number): number {
  return BANK.base + BANK.rowHeight * (row + 0.5);
}

export function cellFrame({ column, row }: Cell): CellFrame {
  const a = columnAngle(column);
  return {
    centre: [
      BANK.radius * Math.sin(a),
      rowCentre(row),
      -BANK.radius * Math.cos(a),
    ],
    normal: [-Math.sin(a), 0, Math.cos(a)],
    yaw: -a,
  };
}

/** Columns ordered from the centre outwards: 6, 5, 7, 4, 8, … */
export function columnsFromCentre(): number[] {
  const mid = (BANK.columns - 1) / 2;
  const out = [mid];
  for (let d = 1; d <= mid; d += 1) out.push(mid - d, mid + d);
  return out;
}

/**
 * Places `count` private compartments: the eye-level row first, centred,
 * then the rows just above and below. Everything else is a decorative box.
 */
export function assignCells(count: number): Cell[] {
  const rows = [EYE_ROW, EYE_ROW - 1, EYE_ROW + 1, EYE_ROW + 2, EYE_ROW - 2];
  const cells: Cell[] = [];
  for (const row of rows) {
    for (const column of columnsFromCentre()) {
      if (cells.length === count) return sortCells(cells);
      cells.push({ column, row });
    }
  }
  return sortCells(cells);
}

/** Reading order (left to right, top row first), so numbers run naturally. */
function sortCells(cells: Cell[]): Cell[] {
  return [...cells].sort((a, b) => b.row - a.row || a.column - b.column);
}

export const BANK_CAPACITY = BANK.columns * BANK.rows;

/* ---------------------------------------------------------------- */
/* Camera                                                            */
/* ---------------------------------------------------------------- */

export interface Shot {
  eye: Vec3;
  look: Vec3;
  /** Metres that must stay in frame either side of `look`. */
  halfWidth: number;
  halfHeight: number;
}

/** The straight wall with the vault door, in front of the camera's start. */
export const FRONT_Z = 1.95;
export const PORTAL = { radius: 1.22, y: 1.5, wall: 0.85 } as const;

export function entryShot(aspect: number): Shot {
  return {
    eye: [0, 1.52, FRONT_Z + PORTAL.wall + 2.6],
    look: [0, 1.42, -1.2],
    halfWidth: aspect < 0.8 ? 1.15 : 1.6,
    halfHeight: 1.0,
  };
}

export function chamberShot(aspect: number): Shot {
  const portrait = aspect < 0.8;
  return {
    eye: [0, 1.64, portrait ? 1.45 : 1.25],
    look: [0, 1.36, -BANK.radius],
    halfWidth: portrait ? 1.45 : 2.9,
    halfHeight: portrait ? 0 : 1.25,
  };
}

const add = (a: Vec3, b: Vec3, k = 1): Vec3 => [
  a[0] + b[0] * k,
  a[1] + b[1] * k,
  a[2] + b[2] * k,
];

/** Standing before one compartment. */
export function focusShot(frame: CellFrame, aspect: number): Shot {
  const portrait = aspect < 0.8;
  return {
    eye: add(add(frame.centre, frame.normal, portrait ? 1.55 : 1.2), [
      0,
      portrait ? 0.02 : 0.12,
      0,
    ]),
    // In portrait the Butler's card covers the lower half of the screen, so
    // the compartment sits high in the frame.
    look: add(frame.centre, [0, portrait ? -0.3 : -0.02, 0]),
    halfWidth: portrait ? 0.48 : 0.75,
    halfHeight: 0.42,
  };
}

/** Leaning in to the open compartment and its envelope. */
export function insideShot(frame: CellFrame, aspect: number): Shot {
  const portrait = aspect < 0.8;
  return {
    eye: add(
      add(frame.centre, frame.normal, portrait ? 0.78 : 0.62),
      [0, 0.16, 0],
    ),
    look: add(add(frame.centre, frame.normal, -0.22), [0, -0.08, 0]),
    halfWidth: portrait ? 0.27 : 0.42,
    halfHeight: 0.24,
  };
}

/**
 * Vertical field of view (degrees) keeping `halfWidth` in frame across and
 * `halfHeight` vertically at `distance`.
 */
export function fovFor(
  aspect: number,
  distance: number,
  halfWidth: number,
  halfHeight = 0,
): number {
  const byWidth =
    (2 * Math.atan(halfWidth / distance / aspect) * 180) / Math.PI;
  const byHeight = (2 * Math.atan(halfHeight / distance) * 180) / Math.PI;
  return Math.min(78, Math.max(30, byWidth, byHeight));
}

export function distance(a: Vec3, b: Vec3): number {
  return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
}

/** Blends two shots; the look leads the eye slightly, like a camera operator. */
export function blendShot(from: Shot, to: Shot, t: number): Shot {
  const e = easeInOutCubic(clamp01(t));
  const l = easeInOutCubic(clamp01(t * 1.2));
  return {
    eye: [
      lerp(from.eye[0], to.eye[0], e),
      lerp(from.eye[1], to.eye[1], e),
      lerp(from.eye[2], to.eye[2], e),
    ],
    look: [
      lerp(from.look[0], to.look[0], l),
      lerp(from.look[1], to.look[1], l),
      lerp(from.look[2], to.look[2], l),
    ],
    halfWidth: lerp(from.halfWidth, to.halfWidth, e),
    halfHeight: lerp(from.halfHeight, to.halfHeight, e),
  };
}

export function approach(
  current: number,
  goal: number,
  dt: number,
  rate = 2.2,
) {
  return current + (goal - current) * (1 - Math.exp(-rate * dt));
}

/* ---------------------------------------------------------------- */
/* The opening ceremony                                              */
/* ---------------------------------------------------------------- */

/** Seconds from the turn of the key. */
export const OPENING = {
  travel: 1.6,
  dialFrom: 1.5,
  dialTo: 3.1,
  boltsTo: 3.75,
  pauseTo: 4.35,
  doorTo: 6.15,
  pushFrom: 5.1,
  pushTo: 7.0,
  total: 7.4,
} as const;

/** The reduced-motion ceremony: no travel or spin, a short cross-fade. */
export const OPENING_REDUCED = { total: 1.1 } as const;

/** Turns of the combination dial during the ceremony. */
export const DIAL_TURNS = 2.75;
/** Clicks per turn of the dial (a sound and a detent each). */
export const DIAL_DETENTS = 24;
/** The resting angle of an open compartment door (radians). */
export const DOOR_OPEN = 1.85;

export interface OpeningPose {
  /** Camera travel to the compartment, 0–1. */
  travel: number;
  /** Dial rotation, radians (negative: clockwise from the front). */
  dial: number;
  /** Bolts withdrawn, 0–1. */
  bolts: number;
  /** Seam light around the door, 0–1. */
  seam: number;
  /** Door swing, 0–1 of DOOR_OPEN. */
  door: number;
  /** Warm light inside the compartment, 0–1. */
  interior: number;
  /** Camera push from the door to the envelope, 0–1. */
  push: number;
  done: boolean;
}

/**
 * Where every moving part is `t` seconds after the key turns. `again`
 * (a compartment already opened) skips the mechanism: the door is already
 * open, and the camera simply travels in.
 */
export function openingPose(
  t: number,
  reduced: boolean,
  again = false,
): OpeningPose {
  if (reduced) {
    const done = t >= OPENING_REDUCED.total;
    return {
      travel: 1,
      dial: 0,
      bolts: 1,
      seam: 0,
      door: 1,
      interior: 1,
      push: 1,
      done,
    };
  }
  if (again) {
    const travel = easeInOutCubic(span(t, 0, OPENING.travel));
    const push = easeInOutCubic(
      span(t, OPENING.travel * 0.8, OPENING.travel + 1.6),
    );
    return {
      travel,
      dial: 0,
      bolts: 1,
      seam: 0,
      door: 1,
      interior: 1,
      push,
      done: t >= OPENING.travel + 1.8,
    };
  }
  const dialT = span(t, OPENING.dialFrom, OPENING.dialTo);
  const doorT = span(t, OPENING.pauseTo, OPENING.doorTo);
  // The door hesitates, then swings: heavy steel on good hinges.
  const door =
    doorT < 0.08
      ? doorT * 0.25
      : easeInOutCubic((doorT - 0.08) / 0.92) * 0.98 + 0.02;
  return {
    travel: easeInOutCubic(span(t, 0, OPENING.travel)),
    dial: -easeInOutCubic(dialT) * DIAL_TURNS * TAU,
    bolts: easeOutCubic(span(t, OPENING.dialTo + 0.05, OPENING.boltsTo)),
    seam:
      span(t, OPENING.boltsTo, OPENING.pauseTo) *
      (1 - span(t, OPENING.doorTo - 0.6, OPENING.doorTo + 0.4)),
    door: clamp01(door),
    interior: easeInOutCubic(
      span(t, OPENING.pauseTo + 0.3, OPENING.doorTo + 0.3),
    ),
    push: easeInOutCubic(span(t, OPENING.pushFrom, OPENING.pushTo)),
    done: t >= OPENING.total,
  };
}

/** Detent index the dial has reached (for sound). */
export function detentAt(dial: number): number {
  return Math.floor((Math.abs(dial) / TAU) * DIAL_DETENTS);
}

/** Slow breathing of a prepared compartment's seam light, 0.55–1. */
export function readyBreath(t: number, reduced: boolean): number {
  if (reduced) return 0.8;
  return 0.775 + 0.225 * Math.sin((t * TAU) / 3.4);
}
