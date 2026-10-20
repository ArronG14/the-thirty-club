// @vitest-environment node
/**
 * The membership card admission (ADR-023) through the real `/api/v1`
 * handlers over every real migration (PGlite): the card's verified
 * credential records the presentation and gives the device a member session;
 * 19:00 alone never admits her; the Lounge admission is server-side, so a
 * second device, a new tab or a reload recovers it; the clue never ships
 * as a placeholder; and the card itself sends nothing.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { Scope } from '../../src/features/concierge/domain/session.ts';
import { signSession } from '../concierge/auth.ts';
import { createBackendApi } from './api.ts';
import { hashToken, newToken } from './auth.ts';
import { BackendError, rpcFor, type Database } from './database.ts';
import { runJourneyRound } from './journey.ts';

const MIGRATIONS = resolve('supabase/migrations');
const SECRET = 'a-concierge-session-secret-of-some-length';
const rewriteClock = (sql: string) =>
  sql.replace(/(?<![\w.])now\(\)/g, 'public.ttc_sim_now()');

let pg: PGlite;
let db: Database;
let member: string;
const ownerToken = newToken();

async function at(iso: string) {
  await pg.query('update public.ttc_sim_clock set offset_ms = $1', [
    Date.parse(iso) - Date.now(),
  ]);
}

interface Reply<T> {
  status: number;
  data: T;
  cookie: string | null;
}

async function call<T = Record<string, unknown>>(
  path: string,
  {
    body,
    cookie,
    bearer,
    method,
  }: {
    body?: unknown;
    cookie?: string | null;
    bearer?: string;
    method?: 'GET' | 'POST' | 'PATCH';
  } = {},
): Promise<Reply<T>> {
  const headers: Record<string, string> = {
    'content-type': 'application/json',
    'x-concierge-request': '1',
    origin: 'https://30.ag14.co',
  };
  if (cookie) headers.cookie = `__Host-thirty-session=${cookie}`;
  if (bearer) headers.authorization = `Bearer ${bearer}`;
  const response = await createBackendApi({
    db,
    env: { CONCIERGE_SESSION_SECRET: SECRET },
  })(
    new Request(`https://30.ag14.co/api/v1${path}`, {
      method: method ?? (body === undefined ? 'GET' : 'POST'),
      headers,
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    }),
    `ip-${Math.random()}`,
  );
  const set = response.headers.get('set-cookie');
  return {
    status: response.status,
    data: (await response.json()) as T,
    cookie: set ? (/=([A-Za-z0-9_-]{43});/.exec(set)?.[1] ?? null) : null,
  };
}

const owner = <T = Record<string, unknown>>(
  path: string,
  body?: unknown,
  method?: 'GET' | 'POST' | 'PATCH',
) =>
  call<T>(path, {
    cookie: ownerToken,
    ...(body !== undefined ? { body } : {}),
    ...(method ? { method } : {}),
  });

/** What the concierge issues after `/c/<token>` (or its printed code). */
const conciergeSession = (
  scopes: Scope[],
  realm: 'live' | 'rehearsal' = 'live',
) => signSession({ v: 1, realm, scopes, iat: Date.now() }, SECRET);

/** Presents the card on a device; returns its member session cookie. */
async function scan(cookie: string | null = null) {
  return call<{
    session: { role: string };
    card: { firstPresentedAt: string; presentations: number };
  }>('/auth/member/card', {
    body: {},
    cookie,
    bearer: await conciergeSession(['membership']),
  });
}

const count = async (sql: string) =>
  Number(
    (await pg.query<{ n: number }>(`select count(*)::int as n from ${sql}`))
      .rows[0]!.n,
  );

async function armEarlyAdmission(clue = 'Beneath the second cushion.') {
  await owner(
    '/owner/journey/milestones/early-membership',
    {
      effects: [
        { type: 'open-entrance' },
        {
          type: 'letter',
          title: 'Your early admission',
          body: `Your card has been delivered. ${clue}`,
          action: { kind: 'admission', room: 'lounge' },
        },
      ],
    },
    'PATCH',
  );
  await owner('/owner/journey/milestones/early-membership/resume', {});
}

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
  await pg.exec(
    'create table public.seeded_milestones as select * from public.ttc_journey_milestones',
  );
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
  await pg.exec(`truncate public.ttc_membership_card, public.ttc_journey_events, public.ttc_room_admissions,
      public.ttc_letters, public.ttc_sessions, public.ttc_messages, public.ttc_activity_events, public.ttc_rate_limits cascade;
    delete from public.ttc_journey_milestones;
    insert into public.ttc_journey_milestones select * from public.seeded_milestones;
    update public.ttc_communication_hold set active = false, released_at = now();
    update public.ttc_sms_operations set mode = 'live', live_since = '2026-01-01T00:00:00Z';`);
  await at('2026-10-21T15:01:00Z'); // 16:01 UK, after the teaser
  await pg.query(
    "insert into public.ttc_sessions(token_hash,role,member_id,expires_at) values($1,'owner',null,now()+interval '1 day')",
    [hashToken(ownerToken)],
  );
});

afterAll(async () => {
  await pg?.close();
});

describe('the card is the credential, never an owner one', () => {
  it('refuses anything but a live session carrying the membership card', async () => {
    expect((await call('/auth/member/card', { body: {} })).status).toBe(401);
    const travel = await call('/auth/member/card', {
      body: {},
      bearer: await conciergeSession(['departure']),
    });
    expect(travel.status).toBe(401);
    const forged = await signSession(
      { v: 1, realm: 'live', scopes: ['membership'], iat: Date.now() },
      'not-the-concierge-secret-at-all-000',
    );
    expect(
      (await call('/auth/member/card', { body: {}, bearer: forged })).status,
    ).toBe(401);
    // TEST (a rehearsal-realm session) never touches the LIVE record.
    const rehearsal = await call('/auth/member/card', {
      body: {},
      bearer: await conciergeSession(['membership'], 'rehearsal'),
    });
    expect(rehearsal.status).toBe(403);
    // An owner's browser keeps its owner session and records nothing.
    const asOwner = await call('/auth/member/card', {
      body: {},
      cookie: ownerToken,
      bearer: await conciergeSession(['membership']),
    });
    expect(asOwner.status).toBe(403);
    expect(asOwner.cookie).toBeNull();
    expect(await count('public.ttc_membership_card')).toBe(0);
  });

  it('records the card and opens a member session; repeat scans are idempotent', async () => {
    const before = await count('public.ttc_messages');
    const first = await scan();
    expect(first.status).toBe(200);
    expect(first.data.session.role).toBe('member');
    expect(first.cookie).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(first.data.card.presentations).toBe(1);
    // The same device scanning again keeps its session.
    const again = await scan(first.cookie);
    expect(again.status).toBe(200);
    expect(again.cookie).toBeNull();
    expect(again.data.card).toMatchObject({
      firstPresentedAt: first.data.card.firstPresentedAt,
      presentations: 2,
    });
    // The member session is a member session: no owner route opens.
    expect(
      (await call('/owner/journey', { cookie: first.cookie })).status,
    ).toBe(403);
    // The scan itself sends nothing (no SMS, no letter).
    expect(await count('public.ttc_messages')).toBe(before);
    expect(await count('public.ttc_letters')).toBe(0);
  });
});

describe('the 19:00 admission is the card’s', () => {
  it('before 19:00 the card is recorded but the doors stay shut', async () => {
    await armEarlyAdmission();
    const device = await scan();
    const entrance = await call<{ eligible: boolean; letter?: unknown }>(
      '/entrance',
    );
    expect(entrance.data.eligible).toBe(false);
    expect(entrance.data.letter).toBeUndefined();
    const enter = await call<{ error: string }>('/journey/enter', {
      body: {},
      cookie: device.cookie,
    });
    expect(enter.status).toBe(403);
    expect(enter.data.error).toBe('not-open');
  });

  it('after 19:00 the time alone admits nobody; the card does, once, for every device', async () => {
    await armEarlyAdmission();
    // A device that already had a member session (an invitation link).
    const invited = newToken();
    await pg.query(
      "insert into public.ttc_sessions(token_hash,role,member_id,expires_at) values($1,'member',$2,now()+interval '30 days')",
      [hashToken(invited), member],
    );
    await at('2026-10-21T18:00:02Z');
    await runJourneyRound(db);
    const entrance = await call<{
      eligible: boolean;
      letter: { title: string; body: string };
    }>('/entrance');
    expect(entrance.data.eligible).toBe(true);
    expect(entrance.data.letter.body).toContain('Beneath the second cushion.');
    const refused = await call<{ error: string }>('/journey/enter', {
      body: {},
      cookie: invited,
    });
    expect(refused.data.error).toBe('card-required');

    // The card is scanned on the phone (the NFC link opens a new tab).
    const phone = await scan();
    expect(
      (await call('/journey/enter', { body: {}, cookie: phone.cookie })).status,
    ).toBe(201);
    // The original tab/device (invitation session) knows at once.
    const state = await call<{
      admissions: { roomId: string; state: string }[];
    }>('/journey', { cookie: invited });
    expect(state.data.admissions).toContainEqual(
      expect.objectContaining({ roomId: 'lounge', state: 'admitted' }),
    );
    // A second device that scans later recovers the admission: no second
    // ceremony is due, and entering again is a duplicate.
    const tablet = await scan();
    expect(tablet.cookie).not.toBe(phone.cookie);
    const tabletState = await call<{
      admissions: { roomId: string; state: string }[];
    }>('/journey', { cookie: tablet.cookie });
    expect(tabletState.data.admissions).toContainEqual(
      expect.objectContaining({ roomId: 'lounge', state: 'admitted' }),
    );
    expect(
      (
        await call<{ duplicate: boolean }>('/journey/enter', {
          body: {},
          cookie: tablet.cookie,
        })
      ).data.duplicate,
    ).toBe(true);
    expect(
      await count(
        "public.ttc_room_admissions where room_id = 'lounge' and state = 'admitted'",
      ),
    ).toBe(1);
    // Other rooms keep their own rules.
    expect(
      await count("public.ttc_room_admissions where room_id <> 'lounge'"),
    ).toBe(0);
  });

  it('the server clock decides: an early request is refused whatever the phone says', async () => {
    await armEarlyAdmission();
    const phone = await scan();
    await at('2026-10-21T17:59:58Z');
    await runJourneyRound(db);
    expect((await call<{ eligible: boolean }>('/entrance')).data.eligible).toBe(
      false,
    );
    expect(
      (await call('/journey/enter', { body: {}, cookie: phone.cookie })).status,
    ).toBe(403);
  });

  it('an unedited clue fails the milestone: nothing published, doors stay shut', async () => {
    await owner('/owner/journey/milestones/early-membership/resume', {});
    await at('2026-10-21T18:00:02Z');
    await runJourneyRound(db);
    const journey = await owner<{
      milestones: { key: string; state: string; lastError: string | null }[];
    }>('/owner/journey');
    const early = journey.data.milestones.find(
      (m) => m.key === 'early-membership',
    )!;
    expect(early.state).toBe('failed');
    expect(early.lastError).toContain('placeholder');
    expect(await count('public.ttc_letters')).toBe(0);
    expect((await call<{ eligible: boolean }>('/entrance')).data.eligible).toBe(
      false,
    );
    // The owner writes the clue and retries: the letter goes, the doors open.
    await owner(
      '/owner/journey/milestones/early-membership',
      {
        effects: [
          { type: 'open-entrance' },
          {
            type: 'letter',
            title: 'Your early admission',
            body: 'In the wardrobe, left pocket.',
            action: { kind: 'admission', room: 'lounge' },
          },
        ],
      },
      'PATCH',
    );
    await owner('/owner/journey/milestones/early-membership/retry', {});
    expect((await call<{ eligible: boolean }>('/entrance')).data.eligible).toBe(
      true,
    );
    expect(await count("public.ttc_letters where state = 'published'")).toBe(1);
  });
});
