import { describe, expect, it } from 'vitest';
import {
  ceremonyTimeline,
  entranceReducer,
  initialEntranceState,
  nextRecord,
  type EntranceEvent,
  type EntranceState,
} from './entranceMachine';
import { emptyRecord } from './entranceRecord';

const seen = '2026-10-24T00:00:05.000Z';

function run(state: EntranceState, ...events: EntranceEvent[]) {
  return events.reduce(entranceReducer, state);
}

describe('initial entrance state', () => {
  it('starts locked or in the final minute from the clock', () => {
    expect(initialEntranceState('locked', emptyRecord).stage).toBe('locked');
    expect(initialEntranceState('final-minute', emptyRecord).stage).toBe(
      'final-minute',
    );
  });

  it('greets a late arrival at unlocked doors rather than replaying midnight', () => {
    expect(initialEntranceState('open', emptyRecord)).toEqual({
      stage: 'awaiting-entry',
      welcomed: false,
    });
  });

  it('does not relock when the device clock moves backwards after unlock', () => {
    const record = { unlockedAt: seen, ceremonySeenAt: null };
    expect(initialEntranceState('locked', record).stage).toBe('awaiting-entry');
  });

  it('returns members who have entered straight to the foyer', () => {
    const record = { unlockedAt: seen, ceremonySeenAt: seen };
    expect(initialEntranceState('locked', record)).toEqual({
      stage: 'foyer',
      welcomed: false,
    });
  });
});

describe('entrance transitions', () => {
  const locked: EntranceState = { stage: 'locked', welcomed: false };

  it('runs the live midnight ceremony automatically', () => {
    let state = run(locked, { type: 'time', phase: 'final-minute' });
    expect(state.stage).toBe('final-minute');
    state = run(state, { type: 'time', phase: 'open' });
    expect(state.stage).toBe('unlocking');
    state = run(state, { type: 'advance' });
    expect(state.stage).toBe('opening');
    state = run(state, { type: 'advance' });
    expect(state).toEqual({ stage: 'foyer', welcomed: true });
  });

  it('jumps from locked to unlocking if the tab slept through the final minute', () => {
    expect(run(locked, { type: 'time', phase: 'open' }).stage).toBe(
      'unlocking',
    );
  });

  it('ignores the clock once the doors are unlocked', () => {
    for (const stage of [
      'unlocking',
      'awaiting-entry',
      'opening',
      'foyer',
    ] as const) {
      const state: EntranceState = { stage, welcomed: false };
      expect(run(state, { type: 'time', phase: 'locked' })).toBe(state);
    }
  });

  it('waits for the member to enter after a late arrival', () => {
    const waiting: EntranceState = {
      stage: 'awaiting-entry',
      welcomed: false,
    };
    expect(run(waiting, { type: 'advance' })).toBe(waiting);
    expect(run(waiting, { type: 'enter' }).stage).toBe('opening');
  });

  it('ignores entry and replay requests while locked', () => {
    expect(run(locked, { type: 'enter' }, { type: 'replay' })).toBe(locked);
  });

  it('replays the ceremony from the foyer on request', () => {
    const foyer: EntranceState = { stage: 'foyer', welcomed: false };
    const replayed = run(
      foyer,
      { type: 'replay' },
      { type: 'advance' },
      { type: 'advance' },
    );
    expect(replayed).toEqual({ stage: 'foyer', welcomed: true });
  });
});

describe('ceremony timing', () => {
  it('keeps reduced motion brief and full motion cinematic', () => {
    const full = ceremonyTimeline(false);
    const reduced = ceremonyTimeline(true);
    expect(reduced.unlockingMs + reduced.openingMs).toBeLessThan(
      full.unlockingMs + full.openingMs,
    );
    expect(reduced.openingMs).toBeLessThanOrEqual(1000);
  });
});

describe('device record', () => {
  it('records the unlock once and the ceremony once', () => {
    const unlocking = nextRecord(
      emptyRecord,
      { stage: 'unlocking', welcomed: false },
      seen,
    );
    expect(unlocking).toEqual({ unlockedAt: seen, ceremonySeenAt: null });
    expect(
      nextRecord(
        unlocking,
        { stage: 'opening', welcomed: false },
        '2026-10-25T00:00:00.000Z',
      ),
    ).toBe(unlocking);
    expect(
      nextRecord(unlocking, { stage: 'foyer', welcomed: true }, seen),
    ).toEqual({ unlockedAt: seen, ceremonySeenAt: seen });
  });

  it('records nothing while locked', () => {
    expect(
      nextRecord(emptyRecord, { stage: 'final-minute', welcomed: false }, seen),
    ).toBe(emptyRecord);
  });
});
