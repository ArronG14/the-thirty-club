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

const start = (
  phase: 'locked' | 'final-minute' | 'open',
  record = emptyRecord,
  member = true,
  presentedNow = false,
) => initialEntranceState({ phase, record, member, presentedNow });

describe('initial entrance state', () => {
  it('starts locked or in the final minute from the clock', () => {
    expect(start('locked').stage).toBe('locked');
    expect(start('final-minute').stage).toBe('final-minute');
    expect(start('locked', emptyRecord, false).stage).toBe('locked');
  });

  it('greets a late member at unlocked doors rather than replaying midnight', () => {
    expect(start('open')).toEqual({ stage: 'awaiting-entry', welcomed: false });
  });

  it('keeps the doors closed after midnight until the card is presented', () => {
    expect(start('open', emptyRecord, false)).toEqual({
      stage: 'awaiting-credential',
      welcomed: false,
    });
  });

  it('plays the ceremony at once when arriving from the card', () => {
    expect(start('open', emptyRecord, true, true).stage).toBe('unlocking');
    // Before midnight the card alone opens nothing.
    expect(start('locked', emptyRecord, true, true).stage).toBe('locked');
  });

  it('does not relock when the device clock moves backwards after unlock', () => {
    const record = { unlockedAt: seen, ceremonySeenAt: null };
    expect(start('locked', record).stage).toBe('awaiting-entry');
    expect(start('locked', record, false).stage).toBe('awaiting-entry');
  });

  it('returns members who have entered straight to the foyer', () => {
    const record = { unlockedAt: seen, ceremonySeenAt: seen };
    expect(start('locked', record)).toEqual({
      stage: 'foyer',
      welcomed: false,
    });
  });
});

describe('entrance transitions', () => {
  const locked: EntranceState = { stage: 'locked', welcomed: false };

  it('runs the live midnight ceremony automatically', () => {
    let state = run(locked, {
      type: 'time',
      phase: 'final-minute',
      member: true,
    });
    expect(state.stage).toBe('final-minute');
    state = run(state, { type: 'time', phase: 'open', member: true });
    expect(state.stage).toBe('unlocking');
    state = run(state, { type: 'advance' });
    expect(state.stage).toBe('opening');
    state = run(state, { type: 'advance' });
    expect(state).toEqual({ stage: 'foyer', welcomed: true });
  });

  it('jumps from locked to unlocking if the tab slept through the final minute', () => {
    expect(
      run(locked, { type: 'time', phase: 'open', member: true }).stage,
    ).toBe('unlocking');
  });

  it('waits at midnight for the card, then opens when it is presented', () => {
    let state = run(locked, { type: 'time', phase: 'open', member: false });
    expect(state.stage).toBe('awaiting-credential');
    state = run(state, { type: 'time', phase: 'open', member: false });
    expect(state.stage).toBe('awaiting-credential');
    expect(run(state, { type: 'enter' })).toBe(state);
    state = run(state, { type: 'credential' });
    expect(state.stage).toBe('unlocking');
    state = run(state, { type: 'advance' }, { type: 'advance' });
    expect(state).toEqual({ stage: 'foyer', welcomed: true });
  });

  it('ignores a presented card at any other stage', () => {
    expect(run(locked, { type: 'credential' })).toBe(locked);
  });

  it('ignores the clock once the doors are unlocked', () => {
    for (const stage of [
      'unlocking',
      'awaiting-entry',
      'opening',
      'foyer',
    ] as const) {
      const state: EntranceState = { stage, welcomed: false };
      expect(run(state, { type: 'time', phase: 'locked', member: true })).toBe(
        state,
      );
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

  it('records nothing while locked or waiting for the card', () => {
    expect(
      nextRecord(emptyRecord, { stage: 'final-minute', welcomed: false }, seen),
    ).toBe(emptyRecord);
    expect(
      nextRecord(
        emptyRecord,
        { stage: 'awaiting-credential', welcomed: false },
        seen,
      ),
    ).toBe(emptyRecord);
  });
});
