import type { EntranceRecord } from './entranceRecord';
import type { TimePhase } from './countdown';

/**
 * Presentation-independent entrance sequence.
 *
 * locked ─▶ final-minute ─▶ unlocking ─▶ opening ─▶ foyer
 *                               ▲            ▲         │
 *   (late arrival) awaiting-entry ─ enter ───┘         │
 *                               └──────── replay ──────┘
 */
export type EntranceStage =
  | 'locked'
  | 'final-minute'
  | 'unlocking'
  | 'awaiting-entry'
  | 'opening'
  | 'foyer';

export interface EntranceState {
  stage: EntranceStage;
  /** True when the foyer was reached through the ceremony this session. */
  welcomed: boolean;
}

export type EntranceEvent =
  | { type: 'time'; phase: TimePhase }
  | { type: 'advance' }
  | { type: 'enter' }
  | { type: 'replay' };

export function initialEntranceState(
  phase: TimePhase,
  record: EntranceRecord,
): EntranceState {
  if (record.ceremonySeenAt) return { stage: 'foyer', welcomed: false };
  // A recorded unlock wins over the clock so a corrected or rolled-back
  // device clock never relocks the doors.
  if (record.unlockedAt || phase === 'open') {
    return { stage: 'awaiting-entry', welcomed: false };
  }
  return { stage: phase, welcomed: false };
}

export function entranceReducer(
  state: EntranceState,
  event: EntranceEvent,
): EntranceState {
  switch (event.type) {
    case 'time': {
      if (state.stage !== 'locked' && state.stage !== 'final-minute') {
        return state;
      }
      const stage = event.phase === 'open' ? 'unlocking' : event.phase;
      return stage === state.stage ? state : { ...state, stage };
    }
    case 'advance':
      if (state.stage === 'unlocking') return { ...state, stage: 'opening' };
      if (state.stage === 'opening') return { stage: 'foyer', welcomed: true };
      return state;
    case 'enter':
      return state.stage === 'awaiting-entry'
        ? { ...state, stage: 'opening' }
        : state;
    case 'replay':
      return state.stage === 'foyer' ? { ...state, stage: 'unlocking' } : state;
  }
}

export function isUnlocked(stage: EntranceStage): boolean {
  return stage !== 'locked' && stage !== 'final-minute';
}

export interface CeremonyTimeline {
  unlockingMs: number;
  openingMs: number;
}

/** Reduced motion keeps the narrative beats but removes the travel. */
export function ceremonyTimeline(reducedMotion: boolean): CeremonyTimeline {
  return reducedMotion
    ? { unlockingMs: 1200, openingMs: 900 }
    : { unlockingMs: 2600, openingMs: 4600 };
}

export function nextRecord(
  record: EntranceRecord,
  state: EntranceState,
  nowIso: string,
): EntranceRecord {
  let next = record;
  if (isUnlocked(state.stage) && !next.unlockedAt) {
    next = { ...next, unlockedAt: nowIso };
  }
  if (state.stage === 'foyer' && state.welcomed && !next.ceremonySeenAt) {
    next = { ...next, ceremonySeenAt: nowIso };
  }
  return next;
}
