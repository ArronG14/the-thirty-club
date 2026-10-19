// @vitest-environment node
import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import type {
  DirectSms,
  MemberServiceRequest,
  OwnerDirectSms,
  OwnerLetter,
  OwnerRequests,
  OwnerServiceRequest,
} from '../../src/shared/concierge/types.ts';
import { createBackendApi } from './api.ts';
import { hashToken, newToken } from './auth.ts';
import { BackendError, rpcFor, type Database } from './database.ts';
import { processMessages } from './sms.ts';

let pg: PGlite;
let member: string;
const ownerToken = newToken();
const memberToken = newToken();
const smsEnv = {
  SMS_SENDING_ENABLED: 'true',
  TWILIO_ACCOUNT_SID: 'ACtest',
  TWILIO_AUTH_TOKEN: 'test-auth',
  TWILIO_MESSAGING_SERVICE_SID: 'MGtest',
  CONCIERGE_SITE_URL: 'https://30.ag14.co',
  ALISE_PHONE: '+447700900001',
  ARRON_PHONE: '+447700900002',
};
const db: Database = {
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
      throw new BackendError(
        (error as Error).message as ConstructorParameters<
          typeof BackendError
        >[0],
      );
    }
  },
};
const api = createBackendApi({ db, env: {} });

async function call<T = Record<string, unknown>>(
  path: string,
  body?: unknown,
  role: 'owner' | 'member' = 'owner',
): Promise<{ status: number; data: T }> {
  const response = await api(
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
const outbox = async () =>
  (
    await pg.query<{
      id: string;
      category: string;
      state: string;
      body: string;
      send_at: string;
    }>(
      'select id,category,state,body,send_at from public.ttc_messages order by created_at',
    )
  ).rows;
const request = (body: string, idempotencyKey = `key-${body.length}-abcdef`) =>
  call<{ request: MemberServiceRequest; duplicate: boolean }>(
    '/service/requests',
    { body, idempotencyKey },
    'member',
  );
const ownerRequests = async () =>
  (await call<OwnerRequests>('/owner/requests')).data;

beforeAll(async () => {
  pg = new PGlite();
  await pg.exec(
    'create role anon; create role authenticated; create role service_role bypassrls;',
  );
  for (const filename of readdirSync(resolve('supabase/migrations')).sort())
    await pg.exec(
      readFileSync(resolve('supabase/migrations', filename), 'utf8'),
    );
  member = (
    await pg.query<{ id: string }>(
      "select id from public.ttc_members where slug='alise'",
    )
  ).rows[0]!.id;
}, 30000);
beforeEach(async () => {
  await pg.exec(
    'truncate public.ttc_request_responses, public.ttc_direct_messages, public.ttc_letter_replies, public.ttc_letters, public.ttc_sessions, public.ttc_messages, public.ttc_message_delivery_logs, public.ttc_activity_events cascade;',
  );
  await pg.query(
    "insert into public.ttc_sessions(token_hash,role,member_id,expires_at) values($1,'member',$2,now()+interval '1 day'),($3,'owner',null,now()+interval '1 day')",
    [hashToken(memberToken), member, hashToken(ownerToken)],
  );
});
afterAll(async () => {
  await pg?.close();
});

describe('a word with the Butler from the service bell', () => {
  it('records the request once and queues one approved SMS to Arron', async () => {
    const words = 'Butler, could you please arrange a cocktail for me?';
    const first = await request(words, 'cocktail-request-01');
    expect(first.status).toBe(201);
    expect(first.data.request).toMatchObject({ body: words, resolvedAt: null });
    // A retry after a timeout is the same request.
    const retry = await request(words, 'cocktail-request-01');
    expect(retry.status).toBe(200);
    expect(retry.data.duplicate).toBe(true);
    expect(retry.data.request.id).toBe(first.data.request.id);
    const sent = await outbox();
    expect(sent).toHaveLength(1);
    expect(sent[0]).toMatchObject({
      category: 'correspondence-arron',
      state: 'approved',
    });
    expect(sent[0]!.body).toContain(words);
    const mine = await call<{ requests: MemberServiceRequest[] }>(
      '/service/requests',
      undefined,
      'member',
    );
    expect(mine.data.requests.map((r) => r.id)).toEqual([
      first.data.request.id,
    ]);
  });

  it('refuses empty words, reused keys and too many requests', async () => {
    expect((await request('   ', 'empty-request-01')).status).toBe(400);
    await request('First thing', 'reused-key-0001');
    expect((await request('Something else', 'reused-key-0001')).status).toBe(
      409,
    );
    for (let n = 2; n <= 5; n++)
      expect((await request(`Request ${n}`, `limit-key-000${n}`)).status).toBe(
        201,
      );
    expect((await request('One too many', 'limit-key-0006')).status).toBe(429);
  });

  it('is only for the member, and the owner inbox is only for the owner', async () => {
    expect(
      (
        await call(
          '/service/requests',
          { body: 'x', idempotencyKey: 'owner-key-0001' },
          'owner',
        )
      ).status,
    ).toBe(403);
    expect((await call('/owner/requests', undefined, 'member')).status).toBe(
      403,
    );
  });
});

describe('Arron answers a request', () => {
  it('shows the request, replies by SMS once and marks it resolved', async () => {
    const asked = await request('A table by the sea at seven, please.');
    let inbox = await ownerRequests();
    expect(inbox.smsEnabled).toBe(false);
    expect(inbox.requests[0]).toMatchObject({
      id: asked.data.request.id,
      source: 'service',
      letter: null,
      resolvedAt: null,
      responses: [],
    });
    expect(inbox.requests[0]!.notificationSms?.state).toBe('approved');

    const reply = {
      body: 'Certainly, Madam. Your table is reserved for seven.',
      idempotencyKey: 'sms-reply-000001',
    };
    const path = `/owner/requests/${asked.data.request.id}/sms`;
    expect((await call(path, reply)).status).toBe(201);
    expect((await call(path, reply)).status).toBe(200);
    const toAlise = (await outbox()).filter(
      (m) => m.category === 'correspondence-alise',
    );
    expect(toAlise).toHaveLength(1);
    expect(toAlise[0]!.body).toBe(reply.body);

    const resolved = await call<{ request: OwnerServiceRequest }>(
      `/owner/requests/${asked.data.request.id}/resolve`,
      { resolved: true },
    );
    expect(resolved.data.request.resolvedAt).not.toBeNull();
    inbox = await ownerRequests();
    expect(inbox.requests[0]!.responses).toHaveLength(1);
    expect(inbox.requests[0]!.responses[0]).toMatchObject({
      kind: 'sms',
      sms: { state: 'approved', body: reply.body },
    });
    // Reopening is allowed; resolution is Arron's statement, never automatic.
    const reopened = await call<{ request: OwnerServiceRequest }>(
      `/owner/requests/${asked.data.request.id}/resolve`,
      { resolved: false },
    );
    expect(reopened.data.request.resolvedAt).toBeNull();
  });

  it('links a letter written on the Desk, and tolerates its later deletion', async () => {
    const asked = await request('Might I have a letter about Thursday?');
    const created = await call<{ letter: OwnerLetter }>(
      '/owner/correspondence',
      {
        title: 'About Thursday',
        salutation: 'Dearest Alise,',
        body: 'All is arranged.',
        timezone: 'America/Jamaica',
        deliverAt: null,
      },
    );
    const link = {
      letterId: created.data.letter.id,
      idempotencyKey: 'letter-link-0001',
    };
    const linked = await call<{ request: OwnerServiceRequest }>(
      `/owner/requests/${asked.data.request.id}/letter`,
      link,
    );
    expect(linked.status).toBe(201);
    expect(linked.data.request.responses[0]).toMatchObject({
      kind: 'letter',
      letter: { title: 'About Thursday', state: 'draft' },
    });
    // The same letter cannot answer a second request.
    const other = await request('And another thing.');
    expect(
      (
        await call(`/owner/requests/${other.data.request.id}/letter`, {
          letterId: created.data.letter.id,
          idempotencyKey: 'letter-link-0002',
        })
      ).status,
    ).toBe(409);
    expect(
      (await call(`/owner/correspondence/${created.data.letter.id}/delete`, {}))
        .status,
    ).toBe(200);
    const inbox = await ownerRequests();
    const answered = inbox.requests.find(
      (r) => r.id === asked.data.request.id,
    )!;
    expect(answered.responses[0]).toMatchObject({
      kind: 'letter',
      letter: null,
    });
  });

  it('lists a letter reply in the same inbox, with its letter', async () => {
    const created = await call<{ letter: OwnerLetter }>(
      '/owner/correspondence',
      {
        title: 'Good morning',
        salutation: 'Dearest Alise,',
        body: 'Hello.',
        timezone: 'Europe/London',
        deliverAt: null,
      },
    );
    await call(`/owner/correspondence/${created.data.letter.id}/send-now`, {});
    expect(
      (
        await call(
          `/correspondence/${created.data.letter.id}/reply`,
          { body: 'Thank you!', idempotencyKey: 'letter-reply-0001' },
          'member',
        )
      ).status,
    ).toBe(201);
    const inbox = await ownerRequests();
    expect(inbox.requests[0]).toMatchObject({
      source: 'letter',
      letter: { title: 'Good morning' },
      body: 'Thank you!',
    });
  });
});

describe('direct Butler SMS', () => {
  const note = (overrides: Record<string, unknown> = {}) => ({
    body: 'Madam, the car will collect you at ten.',
    timezone: 'America/Jamaica',
    sendAt: null,
    idempotencyKey: 'direct-sms-00001',
    ...overrides,
  });

  it('sends now once, through the outbox, to Alise only while SMS is enabled', async () => {
    const created = await call<{ message: DirectSms; duplicate: boolean }>(
      '/owner/butler-sms',
      note(),
    );
    expect(created.status).toBe(201);
    expect(created.data.message).toMatchObject({
      category: 'correspondence-alise',
      state: 'approved',
      timezone: 'America/Jamaica',
    });
    expect((await call('/owner/butler-sms', note())).status).toBe(200);
    expect(
      (await call('/owner/butler-sms', note({ body: 'Different words' })))
        .status,
    ).toBe(409);
    expect(await outbox()).toHaveLength(1);

    // With the switch off, nothing leaves.
    const fakeTwilio = vi.fn<typeof fetch>(async () =>
      Response.json({
        sid: `SM${'1'.padStart(32, '0')}`,
        status: 'accepted',
      }),
    );
    expect(
      await processMessages(
        db,
        { ...smsEnv, SMS_SENDING_ENABLED: 'false' },
        fakeTwilio,
      ),
    ).toEqual({ processed: 0 });
    expect(fakeTwilio).not.toHaveBeenCalled();
    // With it on, the mocked provider receives it for Alise's number.
    expect(await processMessages(db, smsEnv, fakeTwilio)).toEqual({
      processed: 1,
    });
    const sent = fakeTwilio.mock.calls[0]![1]!.body as URLSearchParams;
    expect(sent.get('To')).toBe(smsEnv.ALISE_PHONE);
    expect(sent.get('Body')).toBe(note().body);
    const listed = (await call<OwnerDirectSms>('/owner/butler-sms')).data;
    expect(listed.messages[0]!.state).toBe('accepted');
    // A sent message cannot be cancelled.
    expect(
      (await call(`/owner/butler-sms/${created.data.message.id}/cancel`, {}))
        .status,
    ).toBe(409);
  });

  it('schedules for later in Jamaica time, can be cancelled, and retried safely', async () => {
    const later = new Date(Date.now() + 2 * 3600_000).toISOString();
    const created = await call<{ message: DirectSms }>(
      '/owner/butler-sms',
      note({ sendAt: later, idempotencyKey: 'direct-sms-00002' }),
    );
    expect(created.status).toBe(201);
    expect(new Date(created.data.message.sendAt!).toISOString()).toBe(later);
    // Not due yet: the worker leaves it alone.
    const fakeTwilio = vi.fn<typeof fetch>();
    expect(await processMessages(db, smsEnv, fakeTwilio)).toEqual({
      processed: 0,
    });
    const cancelled = await call<{ message: DirectSms }>(
      `/owner/butler-sms/${created.data.message.id}/cancel`,
      {},
    );
    expect(cancelled.data.message.state).toBe('cancelled');
    // The Desk's retry requeues a cancelled message for now.
    const retried = await call<{ sms: { state: string } }>(
      `/owner/correspondence/messages/${created.data.message.id}/retry`,
      {},
    );
    expect(retried.data.sms.state).toBe('approved');
  });

  it('refuses a time in the past, other zones and empty text', async () => {
    const past = new Date(Date.now() - 3600_000).toISOString();
    expect(
      (
        await call(
          '/owner/butler-sms',
          note({ sendAt: past, idempotencyKey: 'direct-sms-00003' }),
        )
      ).status,
    ).toBe(400);
    expect(
      (
        await call(
          '/owner/butler-sms',
          note({ timezone: 'UTC', idempotencyKey: 'direct-sms-00004' }),
        )
      ).status,
    ).toBe(400);
    expect(
      (
        await call(
          '/owner/butler-sms',
          note({ body: '  ', idempotencyKey: 'direct-sms-00005' }),
        )
      ).status,
    ).toBe(400);
    expect((await call('/owner/butler-sms', undefined, 'member')).status).toBe(
      403,
    );
  });
});
