/**
 * The Butler in the Private Screening Room. Scripted (no AI); each moment
 * speaks once. All wording is PROVISIONAL until the owner approves it.
 */
import type { ScreeningStatus } from './screeningRecord';

export const SCREENING_LINES = {
  /** First visit: the full introduction. */
  introduction:
    'Madam, a number of distinguished guests have requested the opportunity to address you on this rather special occasion. I have taken the liberty of arranging a private screening.',
  /** Any later visit. */
  welcomeBack:
    'Welcome back, Madam. Your private screening is ready whenever you wish.',
  /** A later visit after leaving part-way through. */
  welcomeBackResume:
    'Welcome back, Madam. I have kept your place, should you wish to continue.',
  /** The film's first natural end. */
  closing:
    'I trust you enjoyed your private screening, Madam. The theatre shall remain at your disposal should you wish to revisit it.',
  /** Any later natural end. */
  encore: 'An encore, Madam. The theatre remains entirely at your disposal.',
  /** Between reels of a programme (PROPOSED, ADR-024). */
  nextReel: 'There is more, Madam. Whenever you are ready.',
  /** A reel could not be loaded; the next is offered (PROPOSED). */
  reelUnavailable:
    'My apologies, Madam — that reel seems to have gone astray. Shall we continue?',
  /** She left the film before its end. */
  paused: 'Of course, Madam. I have kept your place.',
  /**
   * The film could not be streamed and is being shown another way (the
   * owner's own copy, ADR-026). PROPOSED. It claims no viewing.
   */
  elsewhere:
    'Very good, Madam. The film shall be shown by other means this evening. The theatre remains at your disposal, and the film will be here whenever you wish to return to it.',
  /** LIVE, before the owner has configured the film. */
  preparing:
    'Madam, the projectionist is making his final preparations. Your screening will be ready very shortly.',
} as const;

/** What he says as she sits down. */
export function arrivalLine({
  hasFilm,
  introduced,
  status,
}: {
  hasFilm: boolean;
  introduced: boolean;
  status: ScreeningStatus;
}): string {
  if (!hasFilm) return SCREENING_LINES.preparing;
  if (!introduced) return SCREENING_LINES.introduction;
  return status === 'interrupted'
    ? SCREENING_LINES.welcomeBackResume
    : SCREENING_LINES.welcomeBack;
}

/** What he says when the film ends by itself. */
export const endLine = (firstCompletion: boolean) =>
  firstCompletion ? SCREENING_LINES.closing : SCREENING_LINES.encore;
