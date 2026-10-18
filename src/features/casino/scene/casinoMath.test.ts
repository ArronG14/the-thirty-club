import { describe, expect, it } from 'vitest';
import { REEL_LENGTH } from '../domain/slots';
import { POCKETS } from '../domain/roulette';
import {
  ballState,
  cameraPose,
  catmullRom,
  finalStop,
  fovFor,
  planReel,
  planSpin,
  pocketAngle,
  pocketUnder,
  POCKET_STEP,
  reelPosition,
  reelTotalSeconds,
  SHOTS,
  viaFor,
  wheelAngle,
} from './casinoMath';

describe('roulette spin plan', () => {
  it('lands the ball in the chosen pocket, for every pocket and any start angle', () => {
    for (const reduced of [false, true]) {
      for (let pocket = 0; pocket < POCKETS; pocket += 1) {
        for (const wheelStart of [0, 1.3, 5.9, 40]) {
          const plan = planSpin({ pocket, wheelStart, reducedMotion: reduced });
          for (const after of [0, 0.01, 1.5]) {
            const t = plan.ballSeconds + after;
            const ball = ballState(plan, t);
            expect(ball.settled).toBe(true);
            expect(pocketUnder(ball.phi, wheelAngle(plan, t))).toBe(pocket);
          }
        }
      }
    }
  });

  it('keeps the ball locked in the pocket while the wheel coasts to rest', () => {
    const plan = planSpin({
      pocket: 11,
      wheelStart: 0.4,
      reducedMotion: false,
    });
    for (let t = plan.ballSeconds; t <= plan.wheelSeconds + 2; t += 0.37) {
      const ball = ballState(plan, t);
      expect(pocketUnder(ball.phi, wheelAngle(plan, t))).toBe(11);
    }
  });

  it('is continuous at the moment the ball settles', () => {
    const plan = planSpin({ pocket: 20, wheelStart: 2, reducedMotion: false });
    const before = ballState(plan, plan.ballSeconds - 1e-6);
    const after = ballState(plan, plan.ballSeconds);
    expect(Math.abs(before.phi - after.phi)).toBeLessThan(1e-3);
    expect(Math.abs(before.radius - after.radius)).toBeLessThan(1e-6);
  });

  it('sends the ball against the wheel and slows both', () => {
    const plan = planSpin({ pocket: 5, wheelStart: 0, reducedMotion: false });
    // Wheel angle grows (counter-clockwise); ball angle grows the other way.
    expect(wheelAngle(plan, 3)).toBeGreaterThan(wheelAngle(plan, 1));
    const a = ballState(plan, 1).phi;
    const b = ballState(plan, 1.5).phi;
    const c = ballState(plan, 6).phi;
    const d = ballState(plan, 6.5).phi;
    expect(b - a).toBeGreaterThan(0);
    expect(b - a).toBeGreaterThan(d - c);
    const wheelFast = wheelAngle(plan, 1.5) - wheelAngle(plan, 1);
    const wheelSlow = wheelAngle(plan, 9.5) - wheelAngle(plan, 9);
    expect(wheelFast).toBeGreaterThan(wheelSlow);
    expect(wheelSlow).toBeGreaterThanOrEqual(0);
  });

  it('drops from the track into the pockets', () => {
    const plan = planSpin({ pocket: 2, wheelStart: 0, reducedMotion: false });
    expect(ballState(plan, 0).radius).toBeGreaterThan(0.38);
    expect(ballState(plan, plan.ballSeconds).radius).toBeCloseTo(0.245, 5);
  });

  it('maps pocket angles onto the wheel evenly', () => {
    expect(pocketAngle(1)).toBeCloseTo(POCKET_STEP);
    expect(pocketUnder(pocketAngle(7), 0)).toBe(7);
    expect(pocketUnder(-1e-9, 0)).toBe(0);
  });
});

describe('reel plans', () => {
  it('finish exactly on the requested stop, from any start', () => {
    for (const reduced of [false, true]) {
      for (let reel = 0; reel < 3; reel += 1) {
        for (let start = 0; start < REEL_LENGTH; start += 1) {
          for (let stop = 0; stop < REEL_LENGTH; stop += 1) {
            const plan = planReel({
              start,
              stop,
              reel,
              reducedMotion: reduced,
            });
            expect(finalStop(plan)).toBe(stop);
            const end = reelPosition(plan, reelTotalSeconds(plan) + 1);
            expect(end).toBe(plan.start + plan.travel);
            expect(((end % REEL_LENGTH) + REEL_LENGTH) % REEL_LENGTH).toBe(
              stop,
            );
          }
        }
      }
    }
  });

  it('always turns forward (no reversing) and never exceeds a readable speed', () => {
    const plan = planReel({ start: 3, stop: 8, reel: 2, reducedMotion: false });
    let last = reelPosition(plan, 0);
    let fastest = 0;
    const dt = 1 / 60;
    for (let t = dt; t <= plan.delay + plan.seconds; t += dt) {
      const p = reelPosition(plan, t);
      expect(p).toBeGreaterThanOrEqual(last - 1e-9);
      fastest = Math.max(fastest, (p - last) / dt);
      last = p;
    }
    expect(fastest).toBeLessThan(26);
    expect(fastest).toBeGreaterThan(8);
  });

  it('stops the reels one after another', () => {
    const plans = [0, 1, 2].map((reel) =>
      planReel({ start: 0, stop: 4, reel, reducedMotion: false }),
    );
    const ends = plans.map((p) => p.delay + p.seconds);
    expect(ends[0]!).toBeLessThan(ends[1]!);
    expect(ends[1]!).toBeLessThan(ends[2]!);
    expect(ends[1]! - ends[0]!).toBeGreaterThan(0.4);
  });

  it('settles with only a slight overshoot', () => {
    const plan = planReel({ start: 0, stop: 5, reel: 0, reducedMotion: false });
    const target = plan.start + plan.travel;
    let max = 0;
    for (
      let t = plan.delay + plan.seconds;
      t < reelTotalSeconds(plan);
      t += 0.005
    )
      max = Math.max(max, Math.abs(reelPosition(plan, t) - target));
    expect(max).toBeLessThan(0.08);
  });
});

describe('camera', () => {
  it('starts and ends exactly on the shots', () => {
    const via = viaFor('lobby', 'roulette');
    const a = cameraPose(SHOTS.lobby, SHOTS.roulette, via, 0);
    const b = cameraPose(SHOTS.lobby, SHOTS.roulette, via, 1);
    expect(a.eye).toEqual(SHOTS.lobby.eye);
    for (let i = 0; i < 3; i += 1) {
      expect(b.eye[i]).toBeCloseTo(SHOTS.roulette.eye[i]!, 6);
      expect(b.look[i]).toBeCloseTo(SHOTS.roulette.look[i]!, 6);
    }
    expect(b.halfWidth).toBeCloseTo(SHOTS.roulette.halfWidth);
  });

  it('eases: slow at both ends, never leaving the room', () => {
    const via = viaFor('lobby', 'slots');
    const at = (p: number) => cameraPose(SHOTS.lobby, SHOTS.slots, via, p).eye;
    const dist = (a: readonly number[], b: readonly number[]) =>
      Math.hypot(a[0]! - b[0]!, a[1]! - b[1]!, a[2]! - b[2]!);
    expect(dist(at(0.02), at(0))).toBeLessThan(dist(at(0.52), at(0.5)));
    expect(dist(at(1), at(0.98))).toBeLessThan(dist(at(0.52), at(0.5)));
    for (let p = 0; p <= 1; p += 0.02) {
      const [x, y, z] = at(p);
      expect(Math.abs(x)).toBeLessThan(3.6);
      expect(y).toBeGreaterThan(1.2);
      expect(y).toBeLessThan(3.2);
      expect(z).toBeGreaterThan(-4.5);
      expect(z).toBeLessThan(5.5);
    }
  });

  it('returns by the same route it left', () => {
    const out = viaFor('lobby', 'roulette');
    const back = viaFor('roulette', 'lobby');
    expect([...back].reverse()).toEqual([...out]);
    expect(viaFor('lobby', 'lobby')).toEqual([]);
  });

  it('interpolates a single point and a straight run', () => {
    expect(catmullRom([[1, 2, 3]], 0.5)).toEqual([1, 2, 3]);
    const mid = catmullRom(
      [
        [0, 0, 0],
        [2, 0, 0],
      ],
      0.5,
    );
    expect(mid[0]).toBeCloseTo(1);
  });

  it('gives portrait a taller field of view than landscape, clamped', () => {
    expect(fovFor(0.46, 5, 2.5)).toBeGreaterThan(fovFor(1.8, 5, 2.5));
    expect(fovFor(0.2, 1, 5)).toBe(84);
    expect(fovFor(3, 20, 0.1)).toBe(34);
  });
});
