import { CASINO_ASSETS } from '../config/casinoAssets';

export const SEEN_KEY = 'thirty-club:casino-film-seen';

/** True while an optional entrance film is configured and not yet seen. */
export function shouldPlayEntranceFilm(reducedMotion: boolean): boolean {
  if (reducedMotion || !CASINO_ASSETS.entranceVideo.src) return false;
  try {
    return window.sessionStorage.getItem(SEEN_KEY) !== '1';
  } catch {
    return true;
  }
}
