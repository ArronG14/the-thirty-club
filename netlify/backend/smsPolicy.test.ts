// @vitest-environment node
/**
 * The SMS policy (ADR-022) and the communication hold (ADR-021) at every
 * sending boundary, over every real migration (PGlite), with a fake
 * provider that records whatever would have reached Twilio. The first test
 * is the independent audit's exploit of the legacy owner endpoint.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { INVITATION_TEMPLATES } from '../../src/shared/correspondence/templates.ts';
import {
  REHEARSAL_BANNER,
  hasClubLink,
  rehearsalSms,
} from '../../src/shared/sms/rehearsal.ts';
import { createConciergeApi } from '../concierge/api.ts';
import { createChannels } from '../concierge/channels.ts';
import { readConfig } from '../concierge/config.ts';
import { memoryStore } from '../concierge/store.ts';
import { TEST_ENV } from '../concierge/testing.ts';
import { createBackendApi } from './api.ts';
import { hashToken, newToken } from './auth.ts';
import { BackendError, rpcFor, type Database } from './database.ts';
import { runJourneyRound } from './journey.ts';
import { legacyCommunicationsHeld, legacySmsBoundary } from './legacySms.ts';
import { processMessages } from './sms.ts';
import { readSmsPolicy } from './smsPolicy.ts';

const MIGRATIONS = resolve('supabase/migrations');
const rewriteClock = (sql: string) =>
  sql.replace(/(?<![\w.])now\(\)/g, 'public.ttc_sim_now()');

/** The most permissive configuration: transport on, every credential set. */
const ENV = {
  ...TEST_ENV,
  SMS_SENDING_ENABLED: 'true',
  ALISE_DISPATCH: 'sms',
  TWILIO_ACCOUNT_SID: 'ACtest',
  TWILIO_AUTH_TOKEN: 'test-auth',
  TWILIO_FROM: 'ThirtyClub',
  TWILIO_MESSAGING_SERVICE_SID: 'MGtest',
  CONCIERGE_SITE_URL: 'https://30.ag14.co',
  ALISE_PHONE: '+447700900001',
  ARRON_PHONE: '+447700900002',
  SMS_REHEARSAL_TO: '+447700900003',
};

let pg: PGlite;
let db: Database;
const ownerToken = newToken();
const memberToken = newToken();
/** Every request that would have reached Twilio: recipient and body. */
let provider: { to: string; body: string }[] = [];
let providerHook: (() => Promise<void>) | null = null;
const fakeTwilio = (async (url: unknown, init?: RequestInit) => {
  if (!String(url).includes('api.twilio.com'))
    return new Response(
      JSON.stringify({ ok: true, result: { message_id: 1 } }),
    );
  await providerHook?.();
  const params = init?.body as URLSearchParams;
  provider.push({ to: params.get('To') ?? '', body: params.get('Body') ?? '' });
  return new Response(
    JSON.stringify({ sid: `SM${'a'.repeat(32)}`, status: 'accepted' }),
    { status: 201, headers: { 'content-type': 'application/json' } },
  );
}) as typeof fetch;
const toAlise = () => provider.filter((p) => p.to === ENV.ALISE_PHONE);

async function at(iso: string) {
  await pg.query('update public.ttc_sim_clock set offset_ms = $1', [
    Date.parse(iso) - Date.now(),
  ]);
}
async function setMode(mode: 'off' | 'rehearsal' | 'live', liveSince?: string) {
  await pg.query(
    'update public.ttc_sms_operations set mode = $1, live_since = $2',
    [mode, mode === 'live' ? (liveSince ?? '2026-01-01T00:00:00Z') : null],
  );
}
async function setHold(active: boolean) {
  await pg.query(
    'update public.ttc_communication_hold set active = $1, released_at = case when $1 then released_at else now() end',
    [active],
  );
}

async function v1<T = Record<string, unknown>>(
  path: string,
  body?: unknown,
  role: 'owner' | 'member' = 'owner',
): Promise<{ status: number; data: T }> {
  const response = await createBackendApi({ db, env: ENV, send: fakeTwilio })(
    new Request(`https://30.ag14.co/api/v1${path}`, {
      method: body === undefined ? 'GET' : 'POST',
      headers: {
        'content-type': 'application/json',
        'x-concierge-request': '1',
        origin: 'https://30.ag14.co',
        cookie: `__Host-thirty-session=${role === 'owner' ? ownerToken : memberToken}`,
      },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    }),
    'test-ip',
  );
  return { status: response.status, data: (await response.json()) as T };
}

/** The legacy concierge exactly as netlify/functions/api.ts builds it. */
function legacyApi() {
  const config = readConfig(ENV);
  return createConciergeApi({
    store: memoryStore(),
    config,
    channels: createChannels(
      config,
      fakeTwilio,
      legacySmsBoundary(db, ENV, config, fakeTwilio),
    ),
    clock: () => Date.parse('2026-10-20T18:00:01Z'),
    communicationsHeld: legacyCommunicationsHeld(db),
  });
}
async function legacySend(realm: 'live' | 'rehearsal' = 'live') {
  const response = await legacyApi()(
    new Request('https://30.ag14.co/api/owner/message', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-owner-key': TEST_ENV.CONCIERGE_OWNER_KEY,
      },
      body: JSON.stringify({ realm, messageId: 'invitation', action: 'send' }),
    }),
    '203.0.113.7',
  );
  return { status: response.status, body: await response.json() };
}

async function queue(
  category: 'correspondence-alise' | 'transactional-arron',
  label: string,
  options: { approvedAt?: string; sendAt?: string } = {},
) {
  const row = await pg.query<{ id: string }>(
    `insert into public.ttc_messages(label,body,category,send_at,timezone,state,approved_at,next_attempt_at)
     values($1,'Madam, a letter awaits. https://30.ag14.co',$2,coalesce($3::timestamptz,public.ttc_sim_now()),'Europe/London','approved',coalesce($4::timestamptz,public.ttc_sim_now()),public.ttc_sim_now())
     returning id`,
    [label, category, options.sendAt ?? null, options.approvedAt ?? null],
  );
  return row.rows[0]!.id;
}
const stateOf = async (id: string) =>
  (
    await pg.query<{ state: string }>(
      'select state from public.ttc_messages where id = $1',
      [id],
    )
  ).rows[0]!.state;

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
  const member = (
    await pg.query<{ id: string }>(
      "select id from public.ttc_members where slug='alise'",
    )
  ).rows[0]!.id;
  await pg.query(
    "insert into public.ttc_sessions(token_hash,role,member_id,expires_at) values($1,'member',$2,now()+interval '30 days'),($3,'owner',null,now()+interval '30 days')",
    [hashToken(memberToken), member, hashToken(ownerToken)],
  );
  await pg.exec(
    'create table public.seeded_messages as select * from public.ttc_messages',
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
  provider = [];
  providerHook = null;
  await at('2026-10-20T18:00:01Z');
  await pg.exec(`truncate public.ttc_messages, public.ttc_message_delivery_logs, public.ttc_sms_rehearsals cascade;
    insert into public.ttc_messages select * from public.seeded_messages;`);
  await setHold(true);
  await setMode('off');
});

afterAll(async () => {
  await pg?.close();
});

describe('P0: the legacy owner endpoint (the audit’s exploit)', () => {
  it('cannot reach Alise while held — even with ALISE_DISPATCH=sms, SMS_SENDING_ENABLED=true and mode LIVE', async () => {
    for (const mode of ['off', 'rehearsal', 'live'] as const) {
      await setMode(mode);
      const sent = await legacySend('live');
      expect(sent.status).toBe(409);
      expect(sent.body.error).toBe('on-hold');
    }
    expect(provider).toEqual([]);
  });

  it('fails closed when the hold cannot be read', async () => {
    const config = readConfig(ENV);
    const handle = createConciergeApi({
      store: memoryStore(),
      config,
      channels: createChannels(
        config,
        fakeTwilio,
        legacySmsBoundary(db, ENV, config, fakeTwilio),
      ),
      clock: () => Date.now(),
      communicationsHeld: async () => {
        throw new Error('database unavailable');
      },
    });
    const response = await handle(
      new Request('https://30.ag14.co/api/owner/message', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-owner-key': TEST_ENV.CONCIERGE_OWNER_KEY,
        },
        body: JSON.stringify({
          realm: 'live',
          messageId: 'invitation',
          action: 'send',
        }),
      }),
      '203.0.113.7',
    );
    expect(response.status).toBe(409);
    expect(provider).toEqual([]);
  });

  it('after release, the legacy SMS still obeys the mode: OFF sends nothing to Alise', async () => {
    await setHold(false);
    await setMode('off');
    const sent = await legacySend('live');
    expect(sent.status).toBe(200);
    // SMS refused by the policy; the text is handed to Arron by Telegram.
    expect(sent.body.dispatch.channel).toBe('arron-forward');
    expect(provider).toEqual([]);
    await setMode('live');
    const live = await legacySend('live');
    expect(live.body.dispatch.channel).toBe('sms');
    expect(toAlise()).toHaveLength(1);
  });
});

describe('the outbox under the SMS mode and the hold', () => {
  it('transport on + mode OFF: nothing leaves, and nothing is marked sent', async () => {
    await setHold(false);
    const alise = await queue('correspondence-alise', 'To Alise');
    const arron = await queue('transactional-arron', 'To Arron');
    await processMessages(db, ENV, fakeTwilio);
    await processMessages(db, ENV, fakeTwilio);
    expect(provider).toEqual([]);
    expect([await stateOf(alise), await stateOf(arron)]).toEqual([
      'approved',
      'approved',
    ]);
  });

  it('REHEARSAL: nothing real leaves the outbox', async () => {
    await setHold(false);
    await setMode('rehearsal');
    const alise = await queue('correspondence-alise', 'To Alise');
    await processMessages(db, ENV, fakeTwilio);
    expect(provider).toEqual([]);
    expect(await stateOf(alise)).toBe('approved');
  });

  it('LIVE with the hold active: Arron’s notification leaves, nothing reaches Alise', async () => {
    await setMode('live');
    await queue('transactional-arron', 'To Arron');
    await processMessages(db, ENV, fakeTwilio);
    await processMessages(db, ENV, fakeTwilio);
    expect(provider.map((p) => p.to)).toEqual([ENV.ARRON_PHONE]);
    expect(toAlise()).toEqual([]);
  });

  it('switching to LIVE does not flush an older approval; the owner approves it deliberately', async () => {
    await setHold(false);
    const old = await queue('correspondence-alise', 'Approved last week', {
      approvedAt: '2026-10-15T09:00:00Z',
    });
    await setMode('live', '2026-10-20T18:00:00Z');
    await processMessages(db, ENV, fakeTwilio);
    expect(provider).toEqual([]);
    const overview = await v1<{ messages: { id: string; status: string }[] }>(
      '/owner/sms',
    );
    expect(overview.data.messages.find((m) => m.id === old)?.status).toBe(
      'awaiting-approval',
    );
    expect((await v1(`/owner/sms/messages/${old}/approve`, {})).status).toBe(
      200,
    );
    await processMessages(db, ENV, fakeTwilio);
    expect(toAlise()).toHaveLength(1);
  });

  it('LIVE: a message scheduled for later waits for its time', async () => {
    await setHold(false);
    await setMode('live');
    const later = await queue('correspondence-alise', 'Later', {
      sendAt: '2026-10-21T15:00:00Z',
    });
    await processMessages(db, ENV, fakeTwilio);
    expect(provider).toEqual([]);
    await at('2026-10-21T15:00:01Z');
    await processMessages(db, ENV, fakeTwilio);
    expect(toAlise()).toHaveLength(1);
    expect(await stateOf(later)).toBe('accepted');
  });

  it('LIVE: competing workers send once', async () => {
    await setHold(false);
    await setMode('live');
    await queue('correspondence-alise', 'Once');
    await Promise.all([
      processMessages(db, ENV, fakeTwilio),
      processMessages(db, ENV, fakeTwilio),
      processMessages(db, ENV, fakeTwilio),
    ]);
    expect(toAlise()).toHaveLength(1);
  });

  it('a retry after switching OFF is not sent', async () => {
    await setHold(false);
    await setMode('live');
    const id = await queue('correspondence-alise', 'Rate limited');
    const limited = (async () =>
      new Response(JSON.stringify({ code: 20429 }), {
        status: 429,
      })) as typeof fetch;
    await processMessages(db, ENV, limited);
    expect(await stateOf(id)).toBe('approved');
    await setMode('off');
    await pg.exec('update public.ttc_messages set next_attempt_at = now()');
    await processMessages(db, ENV, fakeTwilio);
    expect(provider).toEqual([]);
  });

  it('a mode change between claim and provider puts the message back unsent', async () => {
    await setHold(false);
    await setMode('live');
    const id = await queue('correspondence-alise', 'In flight');
    // The owner switches OFF while the worker holds the claim.
    const racing: Database = {
      async action<T>(
        actor: string | null,
        role: 'owner' | 'member' | 'system',
        action: string,
        input = {},
      ) {
        const result = await db.action<T>(actor, role, action, input);
        if (action === 'system-sms-claim') await setMode('off');
        return result;
      },
    };
    await processMessages(racing, ENV, fakeTwilio);
    expect(provider).toEqual([]);
    expect(await stateOf(id)).toBe('approved');
  });

  it('an unreadable policy is OFF', async () => {
    const broken: Database = {
      async action() {
        throw new BackendError('server');
      },
    };
    expect(await readSmsPolicy(broken)).toEqual({
      mode: 'off',
      holdActive: true,
      liveSince: null,
    });
  });
});

describe('owner controls', () => {
  it('only the owner changes the mode; LIVE needs the typed confirmation; every change is audited', async () => {
    expect(
      (await v1('/owner/sms/mode', { mode: 'live' }, 'member')).status,
    ).toBe(403);
    expect((await v1('/owner/sms/mode', { mode: 'live' })).status).toBe(400);
    expect((await v1('/owner/sms/mode', { mode: 'loud' })).status).toBe(400);
    const live = await v1<{ mode: string }>('/owner/sms/mode', {
      mode: 'live',
      confirm: 'LIVE',
    });
    expect(live.data.mode).toBe('live');
    await v1('/owner/sms/mode', { mode: 'off' });
    const audit = await pg.query<{ detail: { from: string; to: string } }>(
      "select detail from public.ttc_activity_events where type = 'sms.mode' order by created_at",
    );
    expect(
      audit.rows.slice(-2).map((r) => [r.detail.from, r.detail.to]),
    ).toEqual([
      ['off', 'live'],
      ['live', 'off'],
    ]);
    const overview = await v1<{ transport: Record<string, boolean> }>(
      '/owner/sms',
    );
    expect(overview.data.transport).toEqual({
      enabled: true,
      configured: true,
      rehearsalConfigured: true,
    });
    // No number is ever returned to the browser.
    expect(JSON.stringify(overview.data)).not.toMatch(/7700900/);
  });
});

describe('the Butler’s 21 October teaser', () => {
  const teaser = async () =>
    (
      await pg.query<{
        id: string;
        state: string;
        body: string;
        send_at: Date;
      }>(
        "select id, state, body, send_at from public.ttc_messages where seed_key = 'butler-teaser-2026-10-21'",
      )
    ).rows[0]!;

  it('is prepared as an unapproved draft for 16:00 UK, with the link, and never sends by itself', async () => {
    const t = await teaser();
    expect(t.state).toBe('draft');
    expect(t.send_at.toISOString()).toBe('2026-10-21T15:00:00.000Z');
    expect(t.body).toContain('https://30.ag14.co');
    expect(
      t.body.startsWith('Madam, as the working day draws to a close'),
    ).toBe(true);
    await setHold(false);
    await setMode('live');
    await at('2026-10-21T15:00:30Z');
    await processMessages(db, ENV, fakeTwilio);
    expect(provider).toEqual([]);
  });

  it('cannot be approved while held, nor after 16:00', async () => {
    const t = await teaser();
    await setMode('live');
    await at('2026-10-21T12:00:00Z');
    await expect(
      db.action(null, 'owner' as const, 'owner-message-approve', { id: t.id }),
    ).rejects.toMatchObject({ code: 'on-hold' });
    await setHold(false);
    await at('2026-10-21T15:00:01Z');
    await expect(
      db.action(null, 'owner' as const, 'owner-message-approve', { id: t.id }),
    ).rejects.toMatchObject({ code: 'invalid' });
  });

  it('approved in time under LIVE, it leaves once at 16:00', async () => {
    const t = await teaser();
    await setHold(false);
    await at('2026-10-21T12:00:00Z');
    await setMode('live', '2026-10-21T11:00:00Z');
    await db.action(null, 'owner' as const, 'owner-message-approve', {
      id: t.id,
    });
    await processMessages(db, ENV, fakeTwilio);
    expect(provider).toEqual([]);
    await at('2026-10-21T15:00:05Z');
    await processMessages(db, ENV, fakeTwilio);
    await processMessages(db, ENV, fakeTwilio);
    expect(toAlise().map((p) => p.body)).toEqual([t.body]);
  });
});

describe('owner rehearsals to the verified test number', () => {
  it('sends the exact LIVE text with a banner and TEST links, only to the test number, once', async () => {
    const t = (
      await pg.query<{ id: string; body: string }>(
        "select id, body from public.ttc_messages where seed_key = 'butler-teaser-2026-10-21'",
      )
    ).rows[0]!;
    // Not in REHEARSAL mode: refused, recorded as failed, nothing sent.
    const off = await v1<{ rehearsal: { state: string; error: string } }>(
      '/owner/sms/rehearsals',
      { kind: 'message', id: t.id, idempotencyKey: 'rehearsal-off-01' },
    );
    expect(off.data.rehearsal).toMatchObject({ state: 'failed' });
    expect(provider).toEqual([]);
    await setMode('rehearsal');
    const sent = await v1<{ rehearsal: { state: string; body: string } }>(
      '/owner/sms/rehearsals',
      { kind: 'message', id: t.id, idempotencyKey: 'rehearsal-teaser-01' },
    );
    expect(sent.status).toBe(201);
    expect(provider).toHaveLength(1);
    expect(provider[0]!.to).toBe(ENV.SMS_REHEARSAL_TO);
    const body = provider[0]!.body;
    expect(body).toBe(
      rehearsalSms(t.body, { scenario: 'early-admission-teaser' }),
    );
    expect(body.startsWith(`${REHEARSAL_BANNER}\n`)).toBe(true);
    expect(body).toContain(
      'https://30.ag14.co/rehearse?path=%2F&scenario=early-admission-teaser',
    );
    // Apart from the banner and the link, the words are the LIVE words.
    expect(
      body
        .replace(`${REHEARSAL_BANNER}\n`, '')
        .replace(/https:\/\/30\.ag14\.co\/rehearse\?\S+/, 'https://30.ag14.co'),
    ).toBe(t.body);
    // A repeated click is the same rehearsal.
    await v1('/owner/sms/rehearsals', {
      kind: 'message',
      id: t.id,
      idempotencyKey: 'rehearsal-teaser-01',
    });
    expect(provider).toHaveLength(1);
    // The LIVE message is untouched.
    expect(
      (
        await pg.query<{ state: string }>(
          'select state from public.ttc_messages where id = $1',
          [t.id],
        )
      ).rows[0]!.state,
    ).toBe('draft');
  });

  it('never rehearses to Alise’s own number', async () => {
    await setMode('rehearsal');
    const t = (
      await pg.query<{ id: string }>(
        "select id from public.ttc_messages where seed_key = 'butler-teaser-2026-10-21'",
      )
    ).rows[0]!;
    const response = await createBackendApi({
      db,
      env: { ...ENV, SMS_REHEARSAL_TO: ENV.ALISE_PHONE },
      send: fakeTwilio,
    })(
      new Request('https://30.ag14.co/api/v1/owner/sms/rehearsals', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-concierge-request': '1',
          origin: 'https://30.ag14.co',
          cookie: `__Host-thirty-session=${ownerToken}`,
        },
        body: JSON.stringify({
          kind: 'message',
          id: t.id,
          idempotencyKey: 'rehearsal-alise-01',
        }),
      }),
      'test-ip',
    );
    expect(response.status).toBe(201);
    expect(provider).toEqual([]);
  });

  it('rehearses a milestone’s letter SMS from the same renderer as LIVE', async () => {
    await setMode('rehearsal');
    const rehearsed = await v1<{ rehearsal: { state: string } }>(
      '/owner/sms/rehearsals',
      {
        kind: 'milestone',
        id: 'casino-evening-mystery',
        idempotencyKey: 'rehearsal-mystery-01',
      },
    );
    expect(rehearsed.data.rehearsal.state).toBe('accepted');
    // 20:00 Jamaica is the evening invitation, pointed at the Casino.
    expect(provider[0]!.body).toBe(
      rehearsalSms(
        INVITATION_TEMPLATES.evening.replace(
          'https://30.ag14.co',
          'https://30.ag14.co/rooms/casino',
        ),
      ),
    );
  });
});

describe('every Butler invitation carries a working link', () => {
  it('all invitation templates link to the club', () => {
    for (const text of Object.values(INVITATION_TEMPLATES))
      expect(hasClubLink(text)).toBe(true);
  });

  it('journey letters point their SMS at the right destination', async () => {
    await setHold(false);
    await at('2026-10-24T14:00:00Z');
    await pg.exec(
      `update public.ttc_journey_milestones set state = 'held' where state = 'pending';
       update public.ttc_journey_milestones set state = 'pending', fire_at = now() - interval '1 minute'
         where key in ('casino-evening-mystery','birthday-breakfast','birthday-screening')`,
    );
    await runJourneyRound(db);
    const bodies = (
      await pg.query<{ label: string; body: string }>(
        "select label, body from public.ttc_messages where category = 'correspondence-alise' order by label",
      )
    ).rows;
    const of = (title: string) =>
      bodies.find((b) => b.label.includes(title))!.body;
    expect(of('The croupier has a confession')).toContain(
      'https://30.ag14.co/rooms/casino',
    );
    expect(of('Breakfast is served')).toContain(
      'https://30.ag14.co/correspondence',
    );
    // An admission summons points at the entrance (the club itself).
    const summons = of('A matter requiring your presence');
    expect(summons).toMatch(/https:\/\/30\.ag14\.co(\s|$)/);
    expect(summons).not.toContain('/rooms/screening-room');
  });
});
