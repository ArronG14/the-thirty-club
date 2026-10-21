import type { MediaId } from '../../src/shared/media/contract.ts';

/**
 * SERVER ONLY (ADR-026). Where the protected films are stored. Imported by
 * the Netlify function (netlify/functions/api.ts), the upload tool and the
 * backend tests — never by media.ts or api.ts, because the TEST rehearsal
 * office bundles those into the browser. The bucket is private either way;
 * the unguessable folders are a second line of defence, so they must not
 * appear in any public file.
 */
export const MEDIA_BUCKET = 'ttc-media';

export interface MediaObject {
  /** Path in the bucket of the standard print. */
  standard: string;
  /** Path of the smaller print for a weak connection, if any. */
  lighter: string | null;
}
export type MediaObjects = Record<MediaId, MediaObject>;

export const MEDIA_OBJECTS: MediaObjects = {
  'birthday-film': {
    standard:
      'films/595d8e68f808c62c0178b3d642cc03d6/thirty-club-birthday-film-1080p.mp4',
    lighter:
      'films/595d8e68f808c62c0178b3d642cc03d6/thirty-club-birthday-film-720p.mp4',
  },
  'nyla-film': {
    standard:
      'films/56dd02b80e64c0dc5f7c5a8a90581e6a/nyla-casino-surprise-1080x1920.mp4',
    lighter: null,
  },
};
