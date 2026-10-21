// @vitest-environment node
/**
 * Protected films (ADR-026), through the real `/api/v1` handlers over every
 * real migration (PGlite), with a fake Supabase Storage that records each
 * signing request:
 *
 * - the birthday film: her session, the Screening Room admitted, and the
 *   server's clock at 00:00 Jamaica on 24 October (never UK midnight);
 * - Nyla's film: only after the third spin of the afternoon (second)
 *   session; never in the first; replayable without a spin; one award;
 *   the first session's drinks untouched;
 * - the owner at any time; signed, expiring URLs to a private bucket; an
 *   absent upload reads "being prepared"; TEST answers with the test film.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { MediaTicket } from '../../src/shared/media/contract.ts';
import { createBackendApi } from './api.ts';
import { hashToken, newToken } from './auth.ts';
import { BackendError, rpcFor, type Database } from './database.ts';
import { MEDIA_RULES } from './media.ts';
import { MEDIA_BUCKET, MEDIA_OBJECTS } from './mediaObjects.ts';

const MIGRATIONS = resolve('supabase/migrations');
const rewriteClock = (sql: string) =>
  sql.replace(/(?<![\w.])now\(\)/g, 'public.ttc_sim_now()');

const SUPABASE_URL = 'https://project.supabase.co';
const SERVICE_KEY = 'service-role-key-for-tests-only';
const ENV = {
  SUPABASE_URL,
  SUPABASE_SERVICE_ROLE_KEY: SERVICE_KEY,
  SMS_SENDING_ENABLED: 'false',
};
const NYLA = '/api/v1/media/nyla-film';
/** Cloudflare R2 (ADR-027): the Netlify function's MEDIA_S3_* settings. */
const R2_ENDPOINT = 'https://0123456789abcdef.r2.cloudflarestorage.com';
const R2_SECRET = 'r2-secret-access-key-for-tests-only';
const R2_ENV = {
  ...ENV,
  MEDIA_S3_ENDPOINT: R2_ENDPOINT,
  MEDIA_S3_ACCESS_KEY_ID: 'r2-access-key-id',
  MEDIA_S3_SECRET_ACCESS_KEY: R2_SECRET,
};

let pg: PGlite;
let db: Database;
let member: string;
const ownerToken = newToken();
const memberToken = newToken();
let signed: { url: string; body: unknown; auth: string | null }[] = [];
/** Objects the fake storage holds (none: "not uploaded yet"). */
let uploaded = new Set<string>();
/** Requests that reached the fake R2 (the existence check before signing). */
let probes: { url: string; method: string }[] = [];
let r2Down = false;
const fakeStorage = (async (url: unknown, init?: RequestInit) => {
  const address = String(url);
  if (address.startsWith(R2_ENDPOINT)) {
    probes.push({ url: address, method: init?.method ?? 'GET' });
    if (r2Down) throw new TypeError('fetch failed');
    const object = decodeURIComponent(
      new URL(address).pathname.slice(`/${MEDIA_BUCKET}/`.length),
    );
    return new Response(null, { status: uploaded.has(object) ? 200 : 404 });
  }
  signed.push({
    url: address,
    body: JSON.parse(String(init?.body ?? 'null')),
    auth: new Headers(init?.headers).get('authorization'),
  });
  const object = address.split(`/object/sign/${MEDIA_BUCKET}/`)[1] ?? '';
  if (!uploaded.has(object))
    return new Response(
      JSON.stringify({ statusCode: '404', error: 'not_found' }),
      { status: 400 },
    );
  return new Response(
    JSON.stringify({
      signedURL: `/object/sign/${MEDIA_BUCKET}/${object}?token=signed-${signed.length}`,
    }),
    { status: 200, headers: { 'content-type': 'application/json' } },
  );
}) as typeof fetch;

async function at(iso: string) {
  await pg.query('update public.ttc_sim_clock set offset_ms = $1', [
    Date.parse(iso) - Date.now(),
  ]);
}

async function call<T = Record<string, unknown>>(
  path: string,
  body?: unknown,
  role: 'owner' | 'member' | 'none' = 'owner',
  env: Record<string, string> = ENV,
): Promise<{ status: number; data: T; headers: Headers }> {
  const response = await createBackendApi({
    db,
    env,
    storage: fakeStorage,
    media: { bucket: MEDIA_BUCKET, objects: MEDIA_OBJECTS },
  })(
    new Request(`https://30.ag14.co/api/v1${path}`, {
      method: body === undefined ? 'GET' : 'POST',
      headers: {
        'content-type': 'application/json',
        'x-concierge-request': '1',
        origin: 'https://30.ag14.co',
        ...(role === 'none'
          ? {}
          : {
              cookie: `__Host-thirty-session=${role === 'owner' ? ownerToken : memberToken}`,
            }),
      },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    }),
    `ip-${Math.random()}`,
  );
  return {
    status: response.status,
    data: (await response.json()) as T,
    headers: response.headers,
  };
}
const ticket = (
  id: string,
  role: 'owner' | 'member' | 'none' = 'member',
  env?: Record<string, string>,
) =>
  call<MediaTicket & { error?: string }>(`/media/${id}`, undefined, role, env);
/**
 * The owner's story review (ADR story sequence): approved, its earlier
 * scenes treated as done, its SMS supplied. These tests are about the
 * media gate; storySequence.test.ts owns the sequencing itself.
 */
const storyReady = (key: string) =>
  pg.query(
    "update public.ttc_journey_milestones set story_approved = true, requires_keys = '{}', story_sms = coalesce(story_sms, 'TEST https://30.ag14.co') where key = $1",
    [key],
  );
const fire = async (key: string) => {
  await storyReady(key);
  return call(`/owner/journey/milestones/${key}/fire`, {});
};
const spin = (key: string) =>
  call<{
    position: number;
    duplicate?: boolean;
    prize: { slug?: string; videoUrl?: string | null } | null;
    entitlementId: string | null;
  }>('/casino/spins', { idempotencyKey: key }, 'member');
const admit = async (room: string) => {
  await call(`/owner/journey/rooms/${room}/invite`, {});
  await call(`/journey/admissions/${room}/accept`, {}, 'member');
};
const available = async () =>
  (await call<{ available: number }>('/casino', undefined, 'member')).data
    .available;

beforeAll(async () => {
  pg = new PGlite();
  await pg.exec(
    'create role anon; create role authenticated; create role service_role bypassrls;',
  );
  await pg.exec(`create table public.ttc_sim_clock(offset_ms bigint not null);
    insert into public.ttc_sim_clock values (0);
    create function public.ttc_sim_now() returns timestamptz language sql stable set search_path = '' as
    $$ select pg_catalog.now() + make_interval(secs => (select offset_ms from public.ttc_sim_clock) / 1000.0) $$;`);
  for (const file of readdirSync(MIGRATIONS).sort())
    await pg.exec(rewriteClock(readFileSync(join(MIGRATIONS, file), 'utf8')));
  member = (
    await pg.query<{ id: string }>(
      "select id from public.ttc_members where slug='alise'",
    )
  ).rows[0]!.id;
  await pg.exec(`create table public.seeded_milestones as select * from public.ttc_journey_milestones;
    create table public.seeded_prizes as select * from public.ttc_prize_catalogue;`);
  db = {
    async action<T>(
      actor: string | null,
      role: string,
      action: string,
      input = {},
    ) {
      try {
        const result = await pg.query<{ result: T }>(
          `select public.${rpcFor(action)}($1,$2,$3,$4::jsonb) as result`,
          [actor, role, action, JSON.stringify(input)],
        );
        return result.rows[0]!.result;
      } catch (error) {
        const message = (error as Error).message;
        throw new BackendError(
          /^[a-z-]+$/.test(message)
            ? (message as ConstructorParameters<typeof BackendError>[0])
            : 'server',
        );
      }
    },
  };
}, 60000);

beforeEach(async () => {
  signed = [];
  probes = [];
  r2Down = false;
  uploaded = new Set(
    Object.values(MEDIA_OBJECTS).flatMap((o) =>
      o.lighter ? [o.standard, o.lighter] : [o.standard],
    ),
  );
  await pg.exec(`truncate public.ttc_drink_requests, public.ttc_drink_grants, public.ttc_casino_promise_floor,
      public.ttc_voucher_requests, public.ttc_reward_entitlements, public.ttc_casino_spins,
      public.ttc_casino_allocations, public.ttc_casino_batches, public.ttc_prize_catalogue, public.ttc_vaults,
      public.ttc_journey_events, public.ttc_room_admissions, public.ttc_letter_replies, public.ttc_letters,
      public.ttc_sessions, public.ttc_messages, public.ttc_message_delivery_logs, public.ttc_activity_events cascade;
    insert into public.ttc_prize_catalogue select * from public.seeded_prizes;
    delete from public.ttc_journey_milestones;
    insert into public.ttc_journey_milestones select * from public.seeded_milestones;
    update public.ttc_communication_hold set active = false, released_at = now();`);
  await at('2026-10-23T12:00:00Z');
  await pg.query(
    "insert into public.ttc_sessions(token_hash,role,member_id,expires_at) values($1,'member',$2,now()+interval '30 days'),($3,'owner',null,now()+interval '30 days')",
    [hashToken(memberToken), member, hashToken(ownerToken)],
  );
});

afterAll(async () => {
  await pg?.close();
});

describe('the birthday film', () => {
  it('is scheduled by the birthday-screening milestone at 00:00 Jamaica (05:00 UTC)', async () => {
    const row = await pg.query<{ fire_at: Date; timezone: string }>(
      "select fire_at, timezone from public.ttc_journey_milestones where key = 'birthday-screening'",
    );
    expect(row.rows[0]!.fire_at.toISOString()).toBe('2026-10-24T05:00:00.000Z');
    expect(MEDIA_RULES['birthday-film'].opensAt).toBe(
      '2026-10-24T05:00:00.000Z',
    );
  });

  it('needs a session, then the Screening Room admission', async () => {
    await at('2026-10-24T06:00:00Z');
    expect((await ticket('birthday-film', 'none')).status).toBe(401);
    const refused = await ticket('birthday-film');
    expect(refused.status).toBe(403);
    expect(refused.data.error).toBe('forbidden');
    expect(signed).toHaveLength(0);
  });

  it('never opens at UK midnight, even if the room were admitted early', async () => {
    await admit('screening-room');
    for (const instant of [
      '2026-10-23T23:00:00Z', // 00:00 on the 24th in London (BST)
      '2026-10-24T04:59:00Z', // 23:59 on the 23rd in Jamaica
    ]) {
      await at(instant);
      const early = await ticket('birthday-film');
      expect(early.status).toBe(403);
      expect(early.data.error).toBe('not-open');
    }
    expect(signed).toHaveLength(0);
    await at('2026-10-24T05:00:00Z');
    expect((await ticket('birthday-film')).status).toBe(200);
  });

  it('the midnight milestone, her acceptance, then a signed, expiring ticket for both prints', async () => {
    await at('2026-10-24T05:00:30Z');
    // Held until the owner approves and resumes it (story sequence).
    await storyReady('birthday-screening');
    await pg.query(
      "update public.ttc_journey_milestones set state = 'pending' where key = 'birthday-screening'",
    );
    // Any journey call fires what is due (as the every-minute round does).
    await call('/journey', undefined, 'member');
    await call('/journey/admissions/screening-room/accept', {}, 'member');
    const result = await ticket('birthday-film');
    expect(result.status).toBe(200);
    expect(result.headers.get('cache-control')).toBe('no-store');
    const film = MEDIA_OBJECTS['birthday-film'];
    expect(signed.map((s) => s.url).sort()).toEqual(
      [film.standard, film.lighter!]
        .map(
          (object) =>
            `${SUPABASE_URL}/storage/v1/object/sign/${MEDIA_BUCKET}/${object}`,
        )
        .sort(),
    );
    expect(signed[0]!.body).toEqual({ expiresIn: 4 * 3600 });
    expect(signed[0]!.auth).toBe(`Bearer ${SERVICE_KEY}`);
    expect(result.data.url).toMatch(
      new RegExp(
        `^${SUPABASE_URL}/storage/v1/object/sign/${MEDIA_BUCKET}/films/[0-9a-f]{32}/thirty-club-birthday-film-1080p\\.mp4\\?token=`,
      ),
    );
    expect(result.data.lighterUrl).toContain('720p.mp4?token=');
    expect(result.data.simulated).toBe(false);
    const ttl = Date.parse(result.data.expiresAt) - Date.now();
    expect(ttl).toBeGreaterThan(3.9 * 3600_000);
    expect(ttl).toBeLessThanOrEqual(4 * 3600_000);
    expect(JSON.stringify(result.data)).not.toContain(SERVICE_KEY);
  });

  it('the owner may check it at any time; an unknown film is not found', async () => {
    await at('2026-10-21T12:00:00Z');
    expect((await ticket('birthday-film', 'owner')).status).toBe(200);
    expect((await ticket('nyla-film', 'owner')).status).toBe(200);
    expect((await ticket('not-a-film', 'owner')).status).toBe(404);
  });

  it('not uploaded (or storage not configured): "being prepared", never a broken URL', async () => {
    uploaded = new Set();
    const missing = await ticket('birthday-film', 'owner');
    expect(missing.status).toBe(503);
    expect(missing.data.error).toBe('not-configured');
    const unconfigured = await ticket('birthday-film', 'owner', {});
    expect(unconfigured.status).toBe(503);
    // Only the lighter print missing: the standard print still plays.
    uploaded = new Set([MEDIA_OBJECTS['birthday-film'].standard]);
    const partial = await ticket('birthday-film', 'owner');
    expect(partial.status).toBe(200);
    expect(partial.data.lighterUrl).toBeNull();
  });

  it('TEST rehearsals get the five-second test film through the same gate', async () => {
    const env = { MEDIA_SIMULATED: 'true' };
    await at('2026-10-24T06:00:00Z');
    expect((await ticket('birthday-film', 'member', env)).status).toBe(403);
    await admit('screening-room');
    const result = await ticket('birthday-film', 'member', env);
    expect(result.data.simulated).toBe(true);
    expect(result.data.url).toMatch(
      /^\/media\/screening\/screening-test-5s\.mp4\?ticket=/,
    );
    expect(result.data.lighterUrl).toContain('&print=lighter');
    expect(signed).toHaveLength(0);
  });
});

describe('on Cloudflare R2 (ADR-027)', () => {
  const r2 = (id: string, role: 'owner' | 'member' | 'none' = 'member') =>
    ticket(id, role, R2_ENV);

  it('the birthday film: nothing is signed or probed before 00:00 Jamaica', async () => {
    await admit('screening-room');
    await at('2026-10-24T04:59:00Z');
    const early = await r2('birthday-film');
    expect(early.status).toBe(403);
    expect(early.data.error).toBe('not-open');
    await at('2026-10-24T06:00:00Z');
    expect((await r2('birthday-film', 'none')).status).toBe(401);
    expect(probes).toHaveLength(0);
    expect(signed).toHaveLength(0);
  });

  it('at midnight: presigned, expiring R2 URLs for both prints, Supabase untouched', async () => {
    await admit('screening-room');
    await at('2026-10-24T05:00:00Z');
    const result = await r2('birthday-film');
    expect(result.status).toBe(200);
    expect(result.headers.get('cache-control')).toBe('no-store');
    const film = MEDIA_OBJECTS['birthday-film'];
    for (const [address, object] of [
      [result.data.url, film.standard],
      [result.data.lighterUrl!, film.lighter!],
    ] as const) {
      const url = new URL(address);
      expect(`${url.origin}${url.pathname}`).toBe(
        `${R2_ENDPOINT}/${MEDIA_BUCKET}/${object}`,
      );
      expect(url.searchParams.get('X-Amz-Expires')).toBe(String(4 * 3600));
      expect(url.searchParams.get('X-Amz-SignedHeaders')).toBe('host');
      expect(url.searchParams.get('X-Amz-Signature')).toMatch(/^[0-9a-f]{64}$/);
      expect(url.searchParams.get('X-Amz-Credential')).toMatch(
        /^r2-access-key-id\/\d{8}\/auto\/s3\/aws4_request$/,
      );
    }
    expect(probes.map((p) => p.method)).toEqual(['HEAD', 'HEAD']);
    expect(signed).toHaveLength(0);
    expect(JSON.stringify(result.data)).not.toContain(R2_SECRET);
    expect(result.data.simulated).toBe(false);
  });

  it("Nyla's film and the owner's check sign the right object", async () => {
    await at('2026-10-21T12:00:00Z');
    const nyla = await r2('nyla-film', 'owner');
    expect(nyla.status).toBe(200);
    expect(new URL(nyla.data.url).pathname).toBe(
      `/${MEDIA_BUCKET}/${MEDIA_OBJECTS['nyla-film'].standard}`,
    );
    expect(nyla.data.lighterUrl).toBeNull();
    // Her session has won nothing yet.
    expect((await r2('nyla-film')).status).toBe(403);
  });

  it('not uploaded: "being prepared"; storage unreachable: the ticket still issues', async () => {
    uploaded = new Set();
    const missing = await r2('birthday-film', 'owner');
    expect(missing.status).toBe(503);
    expect(missing.data.error).toBe('not-configured');
    uploaded = new Set([MEDIA_OBJECTS['birthday-film'].standard]);
    const partial = await r2('birthday-film', 'owner');
    expect(partial.status).toBe(200);
    expect(partial.data.lighterUrl).toBeNull();
    r2Down = true;
    const unchecked = await r2('birthday-film', 'owner');
    expect(unchecked.status).toBe(200);
    expect(unchecked.data.url).toContain('X-Amz-Signature=');
  });
});

describe('the storage paths stay on the server', () => {
  it('no module the browser bundles imports them (the TEST office bundles api.ts)', () => {
    for (const file of ['netlify/backend/media.ts', 'netlify/backend/api.ts'])
      expect(readFileSync(file, 'utf8')).not.toMatch(
        /^import (?!type ).*mediaObjects/m,
      );
    const folders = Object.values(MEDIA_OBJECTS).map(
      (o) => o.standard.split('/')[1]!,
    );
    const walk = (dir: string): string[] =>
      readdirSync(dir, { withFileTypes: true }).flatMap((entry) =>
        entry.isDirectory()
          ? walk(join(dir, entry.name))
          : [join(dir, entry.name)],
      );
    for (const file of walk(resolve('src'))) {
      const text = readFileSync(file, 'utf8');
      expect(text, file).not.toContain('mediaObjects');
      for (const folder of folders) expect(text, file).not.toContain(folder);
    }
  });
});

describe("Nyla's film (the Casino's second session)", () => {
  async function setUpSessions() {
    // The owner's single setting before the afternoon batch fires.
    await pg.query(
      "update public.ttc_prize_catalogue set active = true, video_url = $1 where slug = 'nyla-film'",
      [NYLA],
    );
    await at('2026-10-23T14:00:00Z'); // 09:00 Jamaica: the opening
    await fire('casino-opening-spins');
    await admit('casino');
  }

  it('is never awarded in the first session; the drinks stay as they were', async () => {
    await setUpSessions();
    const first = [
      await spin('first-session-01'),
      await spin('first-session-02'),
      await spin('first-session-03'),
    ];
    expect(first.map((s) => s.data.prize?.videoUrl ?? null)).toEqual([
      null,
      null,
      null,
    ]);
    expect(first[2]!.data.prize?.slug).toBe('jamaica-drinks');
    expect((await ticket('nyla-film')).status).toBe(403);
    const drinks = await pg.query<{ state: string }>(
      "select state from public.ttc_reward_entitlements where snapshot->>'slug' = 'jamaica-drinks'",
    );
    expect(drinks.rows.map((r) => r.state)).toEqual(['AVAILABLE']);
  });

  it('arrives with the third spin of the second session, once, and plays again without a spin', async () => {
    await setUpSessions();
    for (const key of ['first-1-key', 'first-2-key', 'first-3-key'])
      await spin(key);
    await at('2026-10-23T19:30:00Z'); // 14:30 Jamaica: the afternoon session
    await fire('casino-afternoon-spins');
    const batch = await pg.query<{ quantity: number }>(
      'select quantity from public.ttc_casino_batches order by created_at desc limit 1',
    );
    expect(batch.rows[0]!.quantity).toBe(3);
    expect(await available()).toBe(3);

    const one = await spin('second-1-key');
    const two = await spin('second-2-key');
    expect([one.data.prize, two.data.prize]).toEqual([null, null]);
    expect((await ticket('nyla-film')).status).toBe(403);

    const three = await spin('second-3-key');
    expect(three.data.position).toBe(3);
    expect(three.data.prize?.slug).toBe('nyla-film');
    expect(three.data.prize?.videoUrl).toBe(NYLA);
    expect(await available()).toBe(0);

    // The reveal, the wallet and every later visit: no spin is spent.
    for (let i = 0; i < 3; i++) {
      const result = await ticket('nyla-film');
      expect(result.status).toBe(200);
      expect(result.data.url).toContain(
        `${MEDIA_OBJECTS['nyla-film'].standard}?token=`,
      );
      expect(result.data.lighterUrl).toBeNull();
    }
    expect(await available()).toBe(0);

    // A retried third spin (same key) is the same award, not a second one.
    const again = await spin('second-3-key');
    expect(again.data.duplicate).toBe(true);
    expect(again.data.entitlementId).toBe(three.data.entitlementId);
    const films = await pg.query<{ state: string }>(
      "select state from public.ttc_reward_entitlements where snapshot->>'videoUrl' = $1",
      [NYLA],
    );
    expect(films.rows).toEqual([{ state: 'FULFILLED' }]);
    // The first session's drinks are untouched and still hers to claim.
    const drinks = await pg.query<{ state: string }>(
      "select state from public.ttc_reward_entitlements where snapshot->>'slug' = 'jamaica-drinks'",
    );
    expect(drinks.rows.map((r) => r.state)).toEqual(['AVAILABLE']);
    // The film is a watched prize, never a redeemable voucher.
    const redeem = await call(
      '/vouchers/request',
      { id: three.data.entitlementId },
      'member',
    );
    expect(redeem.status).toBe(400);
  });

  it('the prize is pinned to the third spin of the afternoon batch, as seeded', async () => {
    const row = await pg.query<{
      effects: unknown;
      fire_at: Date;
      state: string;
    }>(
      "select effects, fire_at, state from public.ttc_journey_milestones where key = 'casino-afternoon-spins'",
    );
    // The story sequence adds its own reviewed return SMS (story.sms).
    expect(row.rows[0]!.effects).toContainEqual({
      type: 'hook',
      name: 'casino.spins.issue',
      params: {
        quantity: 3,
        prizeSlugs: ['nyla-film'],
        prizePositions: [3],
        announce: false,
      },
    });
    expect(row.rows[0]!.fire_at.toISOString()).toBe('2026-10-23T19:30:00.000Z');
    expect(row.rows[0]!.state).toBe('held');
  });
});
