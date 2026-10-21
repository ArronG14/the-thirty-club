/**
 * Protected films (ADR-026). A film the club must not reveal early is never
 * a public address: the page holds only its reference, `/api/v1/media/<id>`,
 * and asks the server for a short-lived ticket. The server checks that this
 * session may see it (and when), then signs a URL to a private storage
 * object. Shared by the browser and netlify/backend/media.ts.
 */

export const MEDIA_IDS = ['birthday-film', 'nyla-film'] as const;
export type MediaId = (typeof MEDIA_IDS)[number];

const PREFIX = '/api/v1/media/';

/** The reference a page or a prize snapshot holds instead of a URL. */
export const mediaReference = (id: MediaId) => `${PREFIX}${id}`;

export const isMediaId = (value: unknown): value is MediaId =>
  typeof value === 'string' && (MEDIA_IDS as readonly string[]).includes(value);

/** The protected film a source refers to, or null for an ordinary URL. */
export function protectedMediaId(
  src: string | null | undefined,
): MediaId | null {
  if (!src?.startsWith(PREFIX)) return null;
  const id = src.slice(PREFIX.length);
  return isMediaId(id) ? id : null;
}

/** `GET /api/v1/media/<id>`. */
export interface MediaTicket {
  id: MediaId;
  /** Signed, expiring URL of the standard print (H.264/AAC, fast start). */
  url: string;
  /** A smaller print for a weak connection, when one exists. */
  lighterUrl: string | null;
  /** When `url` and `lighterUrl` stop working; ask again before then. */
  expiresAt: string;
  /** TEST rehearsal or local development: the five-second test film. */
  simulated: boolean;
}

/** 00:00 on 24 October 2026 in Jamaica (UTC−5, no daylight saving). */
export const BIRTHDAY_FILM_OPENS_AT = '2026-10-24T05:00:00.000Z';
