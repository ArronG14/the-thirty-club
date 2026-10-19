/**
 * The Butler's words for the Correspondence Desk, in one place. The server
 * sends these (netlify/backend/correspondence.ts) and the Owner Console
 * shows which one a letter will use. Arron never writes them per letter.
 * Editing a template here changes every future SMS; already queued
 * messages keep the words they were queued with.
 */

/** The canonical address of the club, included in every invitation. */
export const CLUB_LINK = 'https://30.ag14.co';

export const LETTER_TIMEZONES = ['Europe/London', 'America/Jamaica'] as const;
export type LetterTimezone = (typeof LETTER_TIMEZONES)[number];

export const TIMEZONE_LABELS: Record<LetterTimezone, string> = {
  'Europe/London': 'London (UK time)',
  'America/Jamaica': 'Jamaica',
};

export type InvitationSlot = 'morning' | 'afternoon' | 'evening' | 'night';

export const INVITATION_TEMPLATES: Record<InvitationSlot, string> = {
  morning: `Good morning, Madam. Forgive the interruption, but a fresh piece of correspondence has arrived for your attention. I trust your morning is unfolding splendidly. Your letter awaits within The Thirty Club. ${CLUB_LINK}`,
  afternoon: `Good afternoon, Madam. I do hope the day has been treating you kindly. A letter has arrived bearing your name, and I thought it only proper to inform you. ${CLUB_LINK}`,
  evening: `Good evening, Madam. I trust you've enjoyed a most agreeable day. A little correspondence has arrived for you. I shall leave it in your care within The Thirty Club. ${CLUB_LINK}`,
  night: `Madam, forgive the rather late interruption. A letter has arrived, though I assure you there is no urgency. It shall await your convenience within The Thirty Club. ${CLUB_LINK}`,
};

/** Sent to Alise, once per letter, when she thanks the Butler. */
export const THANKS_RESPONSE =
  'Madam, how exceedingly kind of you. Though I must insist, there is no need for thanks. The pleasure of serving you is entirely mine. I remain, as ever, at your service. Your Butler.';

/**
 * Sent to Arron when Alise has a word with the Butler. `{message}` is her
 * exact message and `{title}` the letter's title; the server fills both.
 */
export const ARRON_NOTIFICATION =
  'THE THIRTY CLUB — A message from Madam Alise: {message}. Correspondence: {title}.';

/** Longest message Alise may send through "Butler, A Word". */
export const REPLY_MAX_LENGTH = 1000;
/** Longest letter body; keeps every save inside the API's 16 KB request limit. */
export const LETTER_BODY_MAX_LENGTH = 8000;

/**
 * Which invitation a delivery instant earns, by the hour in the letter's
 * own time zone: morning 05:00–11:59, afternoon 12:00–16:59, evening
 * 17:00–21:59, night 22:00–04:59. The database applies the same rule
 * (`ttc_letter_slot`); a test keeps the two in step.
 */
export function invitationSlot(
  instant: string | number | Date,
  timezone: string,
): InvitationSlot {
  const hour = Number(
    new Intl.DateTimeFormat('en-GB', {
      timeZone: timezone,
      hour: '2-digit',
      hourCycle: 'h23',
    }).format(new Date(instant)),
  );
  if (hour >= 5 && hour <= 11) return 'morning';
  if (hour >= 12 && hour <= 16) return 'afternoon';
  if (hour >= 17 && hour <= 21) return 'evening';
  return 'night';
}

/**
 * Sent to Arron when Alise rings for the Butler and leaves a request that
 * is not tied to a letter. `{message}` is her exact request.
 */
export const ARRON_REQUEST_NOTIFICATION =
  'THE THIRTY CLUB — Madam Alise rang for the Butler: {message}. Reply from the Butler’s Office.';

/** Longest Butler SMS Arron may write (one outbox message). */
export const BUTLER_SMS_MAX_LENGTH = 1600;
