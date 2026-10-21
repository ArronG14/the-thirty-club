/**
 * THE ONE PLACE THE BIRTHDAY FILM IS CONFIGURED.
 *
 * The Private Screening Room shows one continuous film: the owner's CapCut
 * edit (cinematic introduction, the guests' messages, cinematic ending).
 * Replacing the film never touches the room's playback logic:
 *
 *   1. Export the MP4 (H.264 + AAC, fast start; see
 *      docs/SCREENING_ROOM_IMPLEMENTATION.md for the CapCut settings).
 *   2. Put it at public/media/screening/<file>.mp4, or host it elsewhere
 *      over HTTPS (needed above GitHub's 100 MB file limit).
 *   3. Fill in BIRTHDAY_FILM below, run the checks, commit and push.
 *
 * Until BIRTHDAY_FILM is set, Alise (LIVE) sees an honest "being prepared"
 * screen with no Watch Movie button. Rehearsals (Dev Mode / TEST) and the
 * local development server use the five-second TEST_FILM instead, clearly
 * labelled as a test.
 */

export interface ScreeningFilm {
  /** Stable id. Changing it starts resume positions afresh. */
  id: string;
  /** What the film is called in the room. */
  title: string;
  /** Same-origin path (e.g. /media/screening/film.mp4) or an https:// URL. */
  src: string;
  /** Always MP4 (H.264 + AAC) for iPhone Safari. */
  type: 'video/mp4';
  /** Optional still for the native player before the first frame. */
  poster?: string;
  /** Optional WebVTT captions (same rules as `src`). */
  captions?: string;
  /** Optional, for display before the metadata loads. */
  durationSeconds?: number;
  /** A test film is never presented to Alise. */
  kind: 'test' | 'birthday';
}

/** The poster on the cinema screen. */
export const SCREENING_POSTER = {
  presenter: 'The Thirty Club presents',
  title: 'Thirty Years of Alise',
  subtitle: 'A Private Birthday Screening',
} as const;

/** TEMPORARY rehearsal film: five seconds, countdown and chime. */
export const TEST_FILM: ScreeningFilm = {
  id: 'screening-test-5s',
  title: 'Screening test — 5 seconds',
  src: '/media/screening/screening-test-5s.mp4',
  type: 'video/mp4',
  durationSeconds: 5,
  kind: 'test',
};

/**
 * The final birthday film. `null` until the owner supplies the CapCut
 * export. Example once it exists:
 *
 *   export const BIRTHDAY_FILM: ScreeningFilm | null = {
 *     id: 'thirty-years-of-alise-v1',
 *     title: 'Thirty Years of Alise',
 *     src: '/media/screening/thirty-years-of-alise-v1.mp4',
 *     type: 'video/mp4',
 *     kind: 'birthday',
 *   };
 */
export const BIRTHDAY_FILM: ScreeningFilm | null = null;

/**
 * OR the screening as separate reels, played in this order (ADR-024): each
 * guest's message as its own MP4, no CapCut assembly needed. When at least
 * one valid reel is listed it replaces BIRTHDAY_FILM. Between reels the
 * room shows "Next — <title>"; her tap starts it (iPhone needs the tap).
 * A reel with an invalid source is skipped; one that fails to load offers
 * the next. Example:
 *
 *   export const BIRTHDAY_REELS: readonly ScreeningFilm[] = [
 *     { id: 'reel-01-introduction', title: 'An introduction',
 *       src: '/media/screening/01-introduction.mp4', type: 'video/mp4',
 *       kind: 'birthday' },
 *     { id: 'reel-02-mum', title: 'A message from Mum',
 *       src: 'https://…/02-mum.mp4', type: 'video/mp4', kind: 'birthday' },
 *   ];
 */
export const BIRTHDAY_REELS: readonly ScreeningFilm[] = [];

/** Where a film may be served from. */
export function filmSourceProblem(film: ScreeningFilm): string | null {
  for (const path of [film.src, film.poster, film.captions]) {
    if (path === undefined) continue;
    const local = path.startsWith('/') && !path.startsWith('//');
    if (!local && !path.startsWith('https://'))
      return `"${path}" must be a same-origin path or an https:// URL`;
  }
  if (!film.id.trim() || !film.src.trim())
    return 'The film needs an id and a source';
  return null;
}

/**
 * The film this page may present. LIVE gets only a valid birthday film;
 * a rehearsal falls back to the test film so the owner can rehearse the
 * whole journey before the real film exists.
 */
export function resolveFilm(
  rehearsal: boolean,
  birthday: ScreeningFilm | null = BIRTHDAY_FILM,
): ScreeningFilm | null {
  const real =
    birthday && birthday.kind === 'birthday' && !filmSourceProblem(birthday)
      ? birthday
      : null;
  if (real) return real;
  return rehearsal ? TEST_FILM : null;
}

/**
 * The programme this page may present, in order: the valid birthday reels,
 * else the single birthday film, else (rehearsal only) the test film.
 */
export function resolveProgramme(
  rehearsal: boolean,
  reels: readonly ScreeningFilm[] = BIRTHDAY_REELS,
  birthday: ScreeningFilm | null = BIRTHDAY_FILM,
): ScreeningFilm[] {
  const valid = reels.filter(
    (reel) => reel.kind === 'birthday' && !filmSourceProblem(reel),
  );
  if (valid.length > 0) return valid;
  const one = resolveFilm(rehearsal, birthday);
  return one ? [one] : [];
}
