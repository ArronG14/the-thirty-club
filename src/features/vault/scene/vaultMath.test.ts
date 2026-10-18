import { describe, expect, it } from 'vitest';
import {
  assignCells,
  BANK,
  BANK_CAPACITY,
  cellFrame,
  chamberShot,
  detentAt,
  DIAL_DETENTS,
  DIAL_TURNS,
  EYE_ROW,
  focusShot,
  fovFor,
  OPENING,
  openingPose,
  OPENING_REDUCED,
  TAU,
} from './vaultMath';

describe('the bank of boxes', () => {
  it('puts the first compartments at eye level, centred', () => {
    const cells = assignCells(3);
    expect(cells.every((c) => c.row === EYE_ROW)).toBe(true);
    expect(cells.map((c) => c.column)).toEqual([5, 6, 7]);
  });

  it('never assigns the same cell twice and fills outwards', () => {
    const cells = assignCells(30);
    const keys = new Set(cells.map((c) => `${c.column}:${c.row}`));
    expect(keys.size).toBe(30);
    expect(assignCells(BANK_CAPACITY + 5)).toHaveLength(BANK_CAPACITY);
  });

  it('turns every door to face the centre of the chamber', () => {
    for (let column = 0; column < BANK.columns; column += 1) {
      const f = cellFrame({ column, row: 0 });
      const toCentre = [-f.centre[0], -f.centre[2]];
      const len = Math.hypot(toCentre[0]!, toCentre[1]!);
      expect(f.normal[0]).toBeCloseTo(toCentre[0]! / len, 6);
      expect(f.normal[2]).toBeCloseTo(toCentre[1]! / len, 6);
      // A +Z door rotated by yaw has normal (sin yaw, 0, cos yaw).
      expect(Math.sin(f.yaw)).toBeCloseTo(f.normal[0], 6);
      expect(Math.cos(f.yaw)).toBeCloseTo(f.normal[2], 6);
      expect(Math.hypot(f.centre[0], f.centre[2])).toBeCloseTo(BANK.radius, 6);
    }
  });
});

describe('camera', () => {
  it('frames a compartment from in front of it', () => {
    const f = cellFrame({ column: 2, row: EYE_ROW });
    const shot = focusShot(f, 0.46);
    const toEye = [shot.eye[0] - f.centre[0], shot.eye[2] - f.centre[2]];
    expect(toEye[0]! * f.normal[0] + toEye[1]! * f.normal[2]).toBeGreaterThan(
      1,
    );
  });

  it('keeps fields of view within a lens a phone can show without distortion', () => {
    for (const aspect of [0.46, 0.75, 1.33, 2.16]) {
      const s = chamberShot(aspect);
      const d = Math.hypot(
        s.eye[0] - s.look[0],
        s.eye[1] - s.look[1],
        s.eye[2] - s.look[2],
      );
      const fov = fovFor(aspect, d, s.halfWidth, s.halfHeight);
      expect(fov).toBeGreaterThanOrEqual(30);
      expect(fov).toBeLessThanOrEqual(78);
    }
  });
});

describe('the opening ceremony', () => {
  it('runs in order: travel, dial, bolts, a pause, the door, the push', () => {
    const at = (t: number) => openingPose(t, false);
    expect(at(0)).toMatchObject({ travel: 0, bolts: 0, door: 0, push: 0 });
    expect(at(OPENING.travel).travel).toBe(1);
    expect(at(OPENING.dialFrom).dial).toBeCloseTo(0, 6);
    expect(at(OPENING.dialTo).dial).toBeCloseTo(-DIAL_TURNS * TAU, 6);
    expect(at(OPENING.dialTo).bolts).toBe(0);
    expect(at(OPENING.boltsTo).bolts).toBe(1);
    expect(at(OPENING.pauseTo).door).toBe(0);
    expect(at(OPENING.doorTo).door).toBeCloseTo(1, 6);
    expect(at(OPENING.pushTo).push).toBe(1);
    expect(at(OPENING.total - 0.01).done).toBe(false);
    expect(at(OPENING.total).done).toBe(true);
  });

  it('never moves backwards', () => {
    let last = openingPose(0, false);
    for (let t = 0.05; t <= OPENING.total; t += 0.05) {
      const p = openingPose(t, false);
      for (const k of ['travel', 'bolts', 'door', 'interior', 'push'] as const)
        expect(p[k]).toBeGreaterThanOrEqual(last[k] - 1e-9);
      expect(p.dial).toBeLessThanOrEqual(last.dial + 1e-9);
      last = p;
    }
  });

  it('is brief and still under reduced motion', () => {
    const p = openingPose(0, true);
    expect(p).toMatchObject({ travel: 1, door: 1, dial: 0, done: false });
    expect(openingPose(OPENING_REDUCED.total, true).done).toBe(true);
  });

  it('skips the mechanism for a compartment that is already open', () => {
    const p = openingPose(0, false, true);
    expect(p.door).toBe(1);
    expect(p.bolts).toBe(1);
    expect(openingPose(10, false, true).done).toBe(true);
  });

  it('clicks once per detent', () => {
    expect(detentAt(0)).toBe(0);
    expect(detentAt(-TAU)).toBe(DIAL_DETENTS);
  });
});
