/**
 * First-visit verification: a purely theatrical overlay. It authenticates
 * nothing, requests no camera and stores one flag so it plays once.
 */
import { canRender3D } from '../entrance/scene/canRender3D';
import { ownerActive } from '../owner/session';

export const VERIFIED_KEY = 'thirty-club:first-visit-verified';
/** `/?verify=replay` replays the sequence (testing and owner reset). */
export const REPLAY_PARAM = 'verify';
/** Readiness never blocks the visitor longer than this. */
export const READINESS_CAP_MS = 10_000;

export interface VisitStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

function browserStorage(): VisitStorage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

/** Replay requested: forget completion and tidy the address bar. */
export function consumeReplayRequest(
  storage: VisitStorage | null = browserStorage(),
): boolean {
  const params = new URLSearchParams(window.location.search);
  if (params.get(REPLAY_PARAM) !== 'replay') return false;
  try {
    storage?.removeItem(VERIFIED_KEY);
    params.delete(REPLAY_PARAM);
    const query = params.toString();
    window.history.replaceState(
      window.history.state,
      '',
      window.location.pathname +
        (query ? `?${query}` : '') +
        window.location.hash,
    );
  } catch {
    /* storage or history unavailable: play anyway */
  }
  return true;
}

/**
 * Plays on the entrance only, on a first visit. Owner rehearsals bypass it
 * (unless replayed), so they and the time locks behave exactly as before.
 * With unreadable storage the sequence is skipped rather than repeated.
 */
export function shouldPlayVerification(
  storage: VisitStorage | null = browserStorage(),
  owner: boolean = ownerActive,
): boolean {
  if (window.location.pathname !== '/') return false;
  const replay = consumeReplayRequest(storage);
  if (owner && !replay) return false;
  if (replay) return true;
  if (!storage) return false;
  try {
    return storage.getItem(VERIFIED_KEY) === null;
  } catch {
    return false;
  }
}

export function markVerified(
  storage: VisitStorage | null = browserStorage(),
): void {
  try {
    storage?.setItem(VERIFIED_KEY, new Date().toISOString());
  } catch {
    /* nothing to remember with */
  }
}

/**
 * Resolves when the entrance is ready to be revealed: fonts and (where the
 * 3D scene is used) its chunk. Failures count as ready; the cap bounds it.
 */
export function entranceReady(
  loaders: readonly (() => Promise<unknown>)[] = defaultLoaders(),
  capMs = READINESS_CAP_MS,
): Promise<void> {
  const settled = Promise.all(
    loaders.map((load) => {
      try {
        return load().catch(() => undefined);
      } catch {
        return Promise.resolve();
      }
    }),
  ).then(() => undefined);
  const cap = new Promise<void>((resolve) => setTimeout(resolve, capMs));
  return Promise.race([settled, cap]);
}

function defaultLoaders(): (() => Promise<unknown>)[] {
  const loaders: (() => Promise<unknown>)[] = [];
  if (typeof document !== 'undefined' && document.fonts?.ready) {
    loaders.push(() => document.fonts.ready);
  }
  if (canRender3D())
    loaders.push(() => import('../entrance/scene/EntranceCanvas'));
  return loaders;
}
