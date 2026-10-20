import type { EntranceRecord } from './entranceRecord';
import type { TimePhase } from './countdown';

/**
 * Presentation-independent entrance sequence.
 *
 * locked ─▶ final-minute ─▶ unlocking ─▶ opening ─▶ foyer
 *                 │             ▲   ▲        ▲         │
 *                 ▼             │   │        │         │
 *        awaiting-credential ───┘   │        │         │
 *              (card presented)     │        │         │
 *   (late arrival) awaiting-entry ──┼─ enter ┘         │
 *                                   └──── replay ──────┘
 *
 * The birthday establishes eligibility; the membership card completes the
 * ceremony (ADR-012). Without the card, midnight leads to
 * `awaiting-credential` rather than opening the doors.
 */
export type EntranceStage =
  | 'locked'
  | 'final-minute'
  | 'awaiting-credential'
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
  /** `member`: the membership card has been presented on this device. */
  | { type: 'time'; phase: TimePhase; member: boolean }
  /** The card was presented just now, while the doors were waiting. */
  | { type: 'credential' }
  | { type: 'advance' }
  | { type: 'enter' }
  | { type: 'replay' }
  /** The server says she is already a member (admitted on another device). */
  | { type: 'admitted' };

export interface EntranceStart {
  phase: TimePhase;
  record: EntranceRecord;
  /** The membership card has been presented on this device. */
  member: boolean;
  /** It was presented moments ago (arriving from the card's link). */
  presentedNow?: boolean;
}

export function initialEntranceState({
  phase,
  record,
  member,
  presentedNow = false,
}: EntranceStart): EntranceState {
  if (record.ceremonySeenAt) return { stage: 'foyer', welcomed: false };
  // A recorded unlock wins over the clock so a corrected or rolled-back
  // device clock never relocks the doors.
  if (record.unlockedAt) return { stage: 'awaiting-entry', welcomed: false };
  if (phase !== 'open') return { stage: phase, welcomed: false };
  if (!member) return { stage: 'awaiting-credential', welcomed: false };
  // Arriving from the card itself: the ceremony plays at once.
  return {
    stage: presentedNow ? 'unlocking' : 'awaiting-entry',
    welcomed: false,
  };
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
      const stage =
        event.phase !== 'open'
          ? event.phase
          : event.member
            ? 'unlocking'
            : 'awaiting-credential';
      return stage === state.stage ? state : { ...state, stage };
    }
    case 'credential':
      return state.stage === 'awaiting-credential'
        ? { ...state, stage: 'unlocking' }
        : state;
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
    case 'admitted':
      // Never interrupt a ceremony in progress; otherwise straight in.
      return state.stage === 'unlocking' ||
        state.stage === 'opening' ||
        state.stage === 'foyer'
        ? state
        : { stage: 'foyer', welcomed: false };
  }
}

/** The doors themselves are unlocked (not merely eligible to be). */
export function isUnlocked(stage: EntranceStage): boolean {
  return (
    stage !== 'locked' &&
    stage !== 'final-minute' &&
    stage !== 'awaiting-credential'
  );
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
