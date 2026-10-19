/**
 * What the club remembers about the Private Screening Room, on this
 * device: whether she has been in, whether the Butler has given his full
 * introduction, where an interrupted screening stopped, and whether the
 * film has ever reached its natural end. Pure; no React.
 *
 * Local, non-authoritative convenience state (ADR-003): it grants nothing.
 * Guests use localStorage; Dev Mode rehearsals use the owner's tab storage
 * (`progressStorage`), so a rehearsal never touches Alise's record.
 */
import { progressStorage } from '../../owner/session';

export const SCREENING_KEY = 'thirty-club:screening';
const VERSION = 2;

export interface ScreeningRecord {
  /** First time she sat down in the room. */
  enteredAt: string | null;
  /** The Butler's full first-visit introduction has been given. */
  introducedAt: string | null;
  /** Playback starts, every one counted (replays included). */
  plays: number;
  /** The film has reached its natural end at least once. */
  completedAt: string | null;
  completions: number;
  /** Where an interrupted screening stopped, for this film only. */
  resume: { filmId: string; seconds: number } | null;
}

export const freshRecord = (): ScreeningRecord => ({
  enteredAt: null,
  introducedAt: null,
  plays: 0,
  completedAt: null,
  completions: 0,
  resume: null,
});

const stamp = (value: unknown): string | null =>
  typeof value === 'string' && !Number.isNaN(Date.parse(value)) ? value : null;
const count = (value: unknown): number =>
  typeof value === 'number' && Number.isInteger(value) && value >= 0
    ? value
    : 0;

/**
 * Version 1 records belonged to the retired message collection and never
 * held a real film, so they (and anything corrupt) read as a fresh room.
 */
export function parseRecord(raw: string | null): ScreeningRecord {
  try {
    const value: unknown = JSON.parse(raw ?? 'null');
    if (!value || typeof value !== 'object') return freshRecord();
    const data = value as Record<string, unknown>;
    if (data.version !== VERSION) return freshRecord();
    const resume = data.resume as Record<string, unknown> | null | undefined;
    return {
      enteredAt: stamp(data.enteredAt),
      introducedAt: stamp(data.introducedAt),
      plays: count(data.plays),
      completedAt: stamp(data.completedAt),
      completions: count(data.completions),
      resume:
        resume &&
        typeof resume.filmId === 'string' &&
        typeof resume.seconds === 'number' &&
        Number.isFinite(resume.seconds) &&
        resume.seconds > 0
          ? { filmId: resume.filmId, seconds: resume.seconds }
          : null,
    };
  } catch {
    return freshRecord();
  }
}

export function loadRecord(): ScreeningRecord {
  try {
    return parseRecord(progressStorage.getItem(SCREENING_KEY));
  } catch {
    return freshRecord();
  }
}

/** False when storage refused the write (the room still works). */
export function saveRecord(record: ScreeningRecord): boolean {
  try {
    progressStorage.setItem(
      SCREENING_KEY,
      JSON.stringify({ version: VERSION, ...record }),
    );
    return true;
  } catch {
    return false;
  }
}

/** A resume point closer than this to either end is not worth offering. */
export const RESUME_MARGIN_SECONDS = 1;

export type ScreeningAction =
  | { type: 'enter'; at: string }
  | { type: 'introduced'; at: string }
  | { type: 'start'; at: string }
  | { type: 'position'; filmId: string; seconds: number; duration: number }
  | { type: 'complete'; at: string };

export function screeningReducer(
  state: ScreeningRecord,
  action: ScreeningAction,
): ScreeningRecord {
  switch (action.type) {
    case 'enter':
      return state.enteredAt ? state : { ...state, enteredAt: action.at };
    case 'introduced':
      return state.introducedAt ? state : { ...state, introducedAt: action.at };
    case 'start':
      return { ...state, plays: state.plays + 1 };
    case 'position': {
      const { seconds, duration } = action;
      const meaningful =
        Number.isFinite(seconds) &&
        seconds >= RESUME_MARGIN_SECONDS &&
        (!Number.isFinite(duration) ||
          duration <= 0 ||
          seconds <= duration - RESUME_MARGIN_SECONDS);
      const resume = meaningful ? { filmId: action.filmId, seconds } : null;
      if (
        resume?.filmId === state.resume?.filmId &&
        resume?.seconds === state.resume?.seconds
      )
        return state;
      return { ...state, resume };
    }
    case 'complete':
      return {
        ...state,
        completedAt: state.completedAt ?? action.at,
        completions: state.completions + 1,
        resume: null,
      };
  }
}

/**
 * The room's stored state. `started` means a screening began but stopped
 * too early to keep a place; `interrupted` keeps one. Playback in progress
 * is the room's live phase, and a returning visitor is `returning()`: she
 * had already been in before this visit.
 */
export type ScreeningStatus =
  'never-entered' | 'entered' | 'started' | 'interrupted' | 'completed';

export function resumeSeconds(
  record: ScreeningRecord,
  filmId: string,
): number | null {
  return record.resume?.filmId === filmId ? record.resume.seconds : null;
}

export function screeningStatus(
  record: ScreeningRecord,
  filmId: string,
): ScreeningStatus {
  if (resumeSeconds(record, filmId) !== null) return 'interrupted';
  if (record.completedAt) return 'completed';
  if (record.plays > 0) return 'started';
  if (record.enteredAt) return 'entered';
  return 'never-entered';
}

export const returning = (atLoad: ScreeningRecord) => atLoad.enteredAt !== null;
