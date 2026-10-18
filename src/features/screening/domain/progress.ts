import { progressStorage } from '../../owner/session';
import type { VideoMessage } from './videoMessages';

export const SCREENING_KEY = 'thirty-club:screening';
export interface ScreeningProgress {
  started: boolean;
  lastId: string | null;
  watched: string[];
  positions: Record<string, number>;
  entranceSeen: boolean;
}
export const freshProgress = (): ScreeningProgress => ({
  started: false,
  lastId: null,
  watched: [],
  positions: {},
  entranceSeen: false,
});
export function parseProgress(
  raw: string | null,
  messages: readonly VideoMessage[],
): ScreeningProgress {
  const empty = freshProgress();
  try {
    const value: unknown = JSON.parse(raw ?? 'null');
    if (!value || typeof value !== 'object') return empty;
    const data = value as Record<string, unknown>;
    if (data.version !== 1) return empty;
    const ids = new Set(messages.map((m) => m.id));
    const positions: Record<string, number> = {};
    if (data.positions && typeof data.positions === 'object') {
      for (const [id, position] of Object.entries(data.positions)) {
        if (
          ids.has(id) &&
          typeof position === 'number' &&
          Number.isFinite(position) &&
          position >= 0
        )
          positions[id] = position;
      }
    }
    return {
      started: data.started === true,
      lastId:
        typeof data.lastId === 'string' && ids.has(data.lastId)
          ? data.lastId
          : null,
      watched: Array.isArray(data.watched)
        ? [
            ...new Set(
              data.watched.filter(
                (id): id is string => typeof id === 'string' && ids.has(id),
              ),
            ),
          ]
        : [],
      positions,
      entranceSeen: data.entranceSeen === true,
    };
  } catch {
    return empty;
  }
}
export function loadProgress(
  messages: readonly VideoMessage[],
): ScreeningProgress {
  try {
    return parseProgress(progressStorage.getItem(SCREENING_KEY), messages);
  } catch {
    return freshProgress();
  }
}
export function saveProgress(progress: ScreeningProgress): boolean {
  try {
    progressStorage.setItem(
      SCREENING_KEY,
      JSON.stringify({ version: 1, ...progress }),
    );
    return true;
  } catch {
    return false;
  }
}
export type ProgressAction =
  | { type: 'select'; id: string }
  | { type: 'position'; id: string; seconds: number }
  | { type: 'ended'; id: string }
  | { type: 'entrance-seen' };
export function progressReducer(
  state: ScreeningProgress,
  action: ProgressAction,
): ScreeningProgress {
  switch (action.type) {
    case 'select':
      return { ...state, started: true, lastId: action.id };
    case 'position':
      return {
        ...state,
        positions: {
          ...state.positions,
          [action.id]: Math.max(
            0,
            Number.isFinite(action.seconds) ? action.seconds : 0,
          ),
        },
      };
    case 'ended':
      return {
        ...state,
        watched: [...new Set([...state.watched, action.id])],
        positions: { ...state.positions, [action.id]: 0 },
      };
    case 'entrance-seen':
      return { ...state, entranceSeen: true };
  }
}
export function resumeIndex(
  messages: readonly VideoMessage[],
  progress: ScreeningProgress,
): number {
  return Math.max(
    0,
    messages.findIndex((m) => m.id === progress.lastId),
  );
}
export function adjacentIndex(
  index: number,
  direction: -1 | 1,
  count: number,
): number {
  return Math.max(0, Math.min(count - 1, index + direction));
}
export function collectionComplete(
  messages: readonly VideoMessage[],
  progress: ScreeningProgress,
): boolean {
  return (
    messages.length > 0 &&
    messages.every((m) => progress.watched.includes(m.id))
  );
}
