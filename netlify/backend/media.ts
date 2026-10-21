import type { Session } from '../../src/shared/concierge/types.ts';
import {
  BIRTHDAY_FILM_OPENS_AT,
  isMediaId,
  mediaReference,
  type MediaId,
  type MediaTicket,
} from '../../src/shared/media/contract.ts';
import { BackendError, type Database } from './database.ts';
import { withJourneyTemplates } from './journey.ts';
import type { MediaObjects } from './mediaObjects.ts';
import { objectUrl, presign, s3Config, type S3Config } from './s3Presign.ts';

/**
 * Protected films (ADR-026, ADR-027): `GET /api/v1/media/<id>` returns a
 * ticket, a signed URL to a PRIVATE storage object (Cloudflare R2 when
 * MEDIA_S3_* is configured, else Supabase Storage), only to a session that
 * may see the film now. The browser never holds a permanent address, the
 * bucket has no public access, and the object names carry an unguessable
 * folder as a second line of defence.
 *
 * - Owner: always (to check the upload and rehearse playback on his phone).
 * - Birthday film: her member session, the Screening Room ADMITTED (the
 *   `birthday-screening` milestone, 00:00 Jamaica), and the server's clock
 *   at or after 24 Oct 00:00 Jamaica.
 * - Nyla's film: her member session and a Casino entitlement whose prize
 *   snapshot carries this film's reference (the third spin of the
 *   `casino-afternoon-spins` batch). Watching again costs nothing.
 *
 * Signed URLs serve HTTP byte ranges, so seeking works
 * and only what is watched is downloaded. A URL that expires during a long
 * pause is replaced by asking again; the page does that itself.
 */
interface MediaRule {
  /** Earliest server instant a member may receive a ticket. */
  opensAt: string | null;
  ttlSeconds: number;
  /** Whether a smaller print exists (the TEST film stands in for both). */
  lighter: boolean;
}

/**
 * When and for how long. Where the files are lives in mediaObjects.ts,
 * which only the Netlify function passes in (this module is also bundled
 * into the browser's TEST rehearsal office, which only ever simulates).
 */
export const MEDIA_RULES: Record<MediaId, MediaRule> = {
  'birthday-film': {
    opensAt: BIRTHDAY_FILM_OPENS_AT,
    // Long enough for a 15-minute film with pauses; the page renews it.
    ttlSeconds: 4 * 3600,
    lighter: true,
  },
  'nyla-film': { opensAt: null, ttlSeconds: 4 * 3600, lighter: false },
};

/** TEST rehearsal and local development: no storage, the test film. */
const SIMULATED_FILM = '/media/screening/screening-test-5s.mp4';

async function requireEntitled(
  id: MediaId,
  session: Session,
  db: Database,
): Promise<void> {
  if (session.role === 'owner') return;
  if (session.role !== 'member' || !session.memberId)
    throw new BackendError('forbidden');
  if (id === 'birthday-film') {
    const journey = await db.action<{
      now: string;
      admissions: { roomId: string; state: string }[];
    }>(
      session.memberId,
      'member',
      'journey-state',
      // As GET /journey: anything due (the midnight invitation) fires first.
      withJourneyTemplates({}),
    );
    const admitted = journey.admissions.some(
      (a) => a.roomId === 'screening-room' && a.state === 'admitted',
    );
    if (!admitted) throw new BackendError('forbidden');
    const opensAt = MEDIA_RULES[id].opensAt;
    if (opensAt && Date.parse(journey.now) < Date.parse(opensAt))
      throw new BackendError('not-open');
    return;
  }
  const wallet = await db.action<{
    entitlements: { prize?: { videoUrl?: string | null } | null }[];
  }>(session.memberId, 'member', 'voucher-list');
  if (
    !wallet.entitlements.some((e) => e.prize?.videoUrl === mediaReference(id))
  )
    throw new BackendError('forbidden');
}

async function sign(
  env: NodeJS.ProcessEnv,
  send: typeof fetch,
  bucket: string,
  object: string,
  ttlSeconds: number,
): Promise<string> {
  const base = env.SUPABASE_URL?.replace(/\/$/, '');
  const key = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!base || !key) throw new BackendError('not-configured');
  const response = await send(
    `${base}/storage/v1/object/sign/${bucket}/${object}`,
    {
      method: 'POST',
      headers: {
        apikey: key,
        authorization: `Bearer ${key}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({ expiresIn: ttlSeconds }),
      signal: AbortSignal.timeout(8000),
    },
  );
  const data = (await response.json().catch(() => ({}))) as {
    signedURL?: string;
    statusCode?: string;
  };
  // A missing object (not uploaded yet) reads as "being prepared".
  if (!response.ok || typeof data.signedURL !== 'string') {
    if (response.status === 400 || response.status === 404)
      throw new BackendError('not-configured');
    throw new BackendError('server');
  }
  return `${base}/storage/v1${data.signedURL}`;
}

/**
 * R2 (or any S3-compatible service): signing is local, so first ask the
 * storage whether the object is there — a missing one reads "being
 * prepared", never a broken URL. If that question cannot be answered (a
 * slow or failing check), the ticket is still issued: she is entitled, and
 * the player's own Retry covers a storage outage.
 */
async function signS3(
  config: S3Config,
  send: typeof fetch,
  bucket: string,
  object: string,
  ttlSeconds: number,
  at: Date,
): Promise<string> {
  const url = objectUrl(config, bucket, object);
  const probe = await send(
    await presign({ config, url, method: 'HEAD', expiresIn: 60, now: at }),
    { method: 'HEAD', signal: AbortSignal.timeout(5000) },
  ).catch(() => null);
  if (probe?.status === 404) throw new BackendError('not-configured');
  return presign({ config, url, expiresIn: ttlSeconds, now: at });
}

export async function mediaTicket({
  id,
  session,
  db,
  env,
  storage,
  send = fetch,
  now = Date.now,
}: {
  id: string;
  session: Session;
  db: Database;
  env: NodeJS.ProcessEnv;
  /** The bucket and object paths (server only); absent → not configured. */
  storage?: { bucket: string; objects: MediaObjects } | undefined;
  send?: typeof fetch;
  now?: () => number;
}): Promise<MediaTicket> {
  if (!isMediaId(id)) throw new BackendError('not-found');
  await requireEntitled(id, session, db);
  const rule = MEDIA_RULES[id];
  const expiresAt = new Date(now() + rule.ttlSeconds * 1000).toISOString();
  if (env.MEDIA_SIMULATED === 'true') {
    // Unique per ticket, like a signed URL: a renewed ticket really is a
    // new address (and no media cache can stand in for the network).
    const ticket = `${SIMULATED_FILM}?ticket=${now().toString(36)}`;
    return {
      id,
      url: ticket,
      lighterUrl: rule.lighter ? `${ticket}&print=lighter` : null,
      expiresAt,
      simulated: true,
    };
  }
  if (!storage) throw new BackendError('not-configured');
  const object = storage.objects[id];
  const s3 = s3Config(env);
  const at = new Date(now());
  const signOne = (path: string) =>
    s3
      ? signS3(s3, send, storage.bucket, path, rule.ttlSeconds, at)
      : sign(env, send, storage.bucket, path, rule.ttlSeconds);
  const [url, lighterUrl] = await Promise.all([
    signOne(object.standard),
    object.lighter
      ? signOne(object.lighter).catch(() => null)
      : Promise.resolve(null),
  ]);
  return { id, url, lighterUrl, expiresAt, simulated: false };
}
