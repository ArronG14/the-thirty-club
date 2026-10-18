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
  MemberLetter,
  OwnerCorrespondence,
  OwnerLetter,
} from '../../src/shared/concierge/types.ts';
import {
  INVITATION_TEMPLATES,
  THANKS_RESPONSE,
  invitationSlot,
} from '../../src/shared/correspondence/templates.ts';
import { wallTimeToInstant } from '../../src/shared/concierge/time.ts';
import { createBackendApi } from './api.ts';
import { hashToken, newToken } from './auth.ts';
import { publishDueLetters } from './correspondence.ts';
import { BackendError, rpcFor, type Database } from './database.ts';
import { scheduledRound } from './scheduledRound.ts';
import { processMessages } from './sms.ts';
import { memoryStore } from '../concierge/store.ts';
import { readConfig } from '../concierge/config.ts';
import { fakeChannels, TEST_ENV } from '../concierge/testing.ts';

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
  role: 'owner' | 'member' | 'none' = 'owner',
  method?: string,
): Promise<{ status: number; data: T }> {
  const response = await api(
    new Request(`https://30.ag14.co/api/v1${path}`, {
      method: method ?? (body === undefined ? 'GET' : 'POST'),
      headers: {
        'content-type': 'application/json',
        'x-concierge-request': '1',
        origin: 'https://30.ag14.co',
        ...(role !== 'none'
          ? {
              cookie: `__Host-thirty-session=${role === 'owner' ? ownerToken : memberToken}`,
            }
          : {}),
      },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    }),
    'test-ip',
  );
  return { status: response.status, data: (await response.json()) as T };
}

const inAnHour = () => new Date(Date.now() + 3600_000).toISOString();
const draft = (overrides: Record<string, unknown> = {}) => ({
  title: 'A letter for Tuesday',
  salutation: 'Dearest Alise,',
  body: 'The sea was very blue today.\n\nI thought of you.',
  timezone: 'Europe/London',
  deliverAt: inAnHour(),
  ...overrides,
});
async function createLetter(overrides: Record<string, unknown> = {}) {
  const created = await call<{ letter: OwnerLetter }>(
    '/owner/correspondence',
    draft(overrides),
  );
  expect(created.status).toBe(201);
  return created.data.letter;
}
/** Makes a scheduled letter due by moving its instant into the past. */
async function makeDue(id: string, at = "now() - interval '1 minute'") {
  await pg.query(`update public.ttc_letters set deliver_at=${at} where id=$1`, [
    id,
  ]);
}
async function scheduledAndDue(overrides: Record<string, unknown> = {}) {
  const letter = await createLetter(overrides);
  expect(
    (await call(`/owner/correspondence/${letter.id}/schedule`, {})).status,
  ).toBe(200);
  await makeDue(letter.id);
  return letter;
}
const messages = async () =>
  (
    await pg.query<{
      id: string;
      category: string;
      state: string;
      body: string;
      attempts: number;
    }>(
      'select id,category,state,body,attempts from public.ttc_messages order by created_at',
    )
  ).rows;
const ownerLetters = async () =>
  (await call<OwnerCorrespondence>('/owner/correspondence')).data;
const memberLetters = async () =>
  (
    await call<{ letters: MemberLetter[] }>(
      '/correspondence',
      undefined,
      'member',
    )
  ).data.letters;
let sids = 0;
const twilioAccepts = () =>
  vi.fn<typeof fetch>(async () =>
    Response.json({
      sid: `SM${(++sids).toString(16).padStart(32, '0')}`,
      status: 'accepted',
    }),
  );

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
    'truncate public.ttc_letter_replies, public.ttc_letters, public.ttc_sessions, public.ttc_messages, public.ttc_message_delivery_logs, public.ttc_activity_events cascade;',
  );
  await pg.query(
    "insert into public.ttc_sessions(token_hash,role,member_id,expires_at) values($1,'member',$2,now()+interval '1 day'),($3,'owner',null,now()+interval '1 day')",
    [hashToken(memberToken), member, hashToken(ownerToken)],
  );
});
afterAll(async () => {
  await pg?.close();
});

describe('composing letters', () => {
  it('creates, edits and deletes a draft, and keeps drafts from the member', async () => {
    const letter = await createLetter({ deliverAt: null });
    expect(letter).toMatchObject({
      state: 'draft',
      status: 'draft',
      deliverAt: null,
      timezone: 'Europe/London',
      invitationSms: null,
    });
    const edited = await call<{ letter: OwnerLetter }>(
      `/owner/correspondence/${letter.id}`,
      draft({ title: 'Edited title', timezone: 'America/Jamaica' }),
      'owner',
      'PATCH',
    );
    expect(edited.status).toBe(200);
    expect(edited.data.letter).toMatchObject({
      title: 'Edited title',
      timezone: 'America/Jamaica',
      state: 'draft',
    });
    expect(await memberLetters()).toEqual([]);
    expect(
      (await call(`/owner/correspondence/${letter.id}/delete`, {})).status,
    ).toBe(200);
    expect((await ownerLetters()).letters).toEqual([]);
  });

  it('validates the title, body length, time zone and instant', async () => {
    for (const bad of [
      draft({ title: '   ' }),
      draft({ body: 'x'.repeat(8001) }),
      draft({ timezone: 'Asia/Tokyo' }),
      draft({ deliverAt: '2026-10-24 09:00' }),
      { ...draft(), extra: true },
    ])
      expect((await call('/owner/correspondence', bad)).status).toBe(400);
    expect((await call('/owner/correspondence', draft())).status).toBe(201);
  });

  it('cannot delete a scheduled or published letter, nor edit a published one', async () => {
    const letter = await createLetter();
    await call(`/owner/correspondence/${letter.id}/schedule`, {});
    expect(
      (await call(`/owner/correspondence/${letter.id}/delete`, {})).status,
    ).toBe(409);
    await call(`/owner/correspondence/${letter.id}/send-now`, {});
    expect(
      (
        await call(
          `/owner/correspondence/${letter.id}`,
          draft(),
          'owner',
          'PATCH',
        )
      ).status,
    ).toBe(409);
    expect(
      (await call(`/owner/correspondence/${letter.id}/delete`, {})).status,
    ).toBe(409);
  });
});

describe('scheduling and time zones', () => {
  it('stores the instant in UTC from an explicit Jamaica wall time', async () => {
    const deliverAt = wallTimeToInstant('2026-10-24T09:30', 'America/Jamaica');
    expect(deliverAt).toBe('2026-10-24T14:30:00.000Z');
    const letter = await createLetter({
      deliverAt,
      timezone: 'America/Jamaica',
    });
    const stored = await pg.query<{ utc: string }>(
      "select to_char(deliver_at at time zone 'UTC','YYYY-MM-DD HH24:MI') as utc from public.ttc_letters where id=$1",
      [letter.id],
    );
    expect(stored.rows[0]!.utc).toBe('2026-10-24 14:30');
    expect(wallTimeToInstant('2026-10-24T09:30', 'Europe/London')).toBe(
      '2026-10-24T08:30:00.000Z',
    );
  });

  it('schedules only a future letter with words in it, and cancels back to draft', async () => {
    const past = await createLetter({ deliverAt: '2026-01-01T09:00:00Z' });
    expect(
      (await call(`/owner/correspondence/${past.id}/schedule`, {})).status,
    ).toBe(400);
    const empty = await createLetter({ body: '' });
    expect(
      (await call(`/owner/correspondence/${empty.id}/schedule`, {})).status,
    ).toBe(400);
    const letter = await createLetter();
    const scheduled = await call<{ letter: OwnerLetter }>(
      `/owner/correspondence/${letter.id}/schedule`,
      {},
    );
    expect(scheduled.data.letter).toMatchObject({ state: 'scheduled' });
    expect(scheduled.data.letter.scheduledAt).not.toBeNull();
    // Rescheduling an already scheduled letter is harmless.
    expect(
      (await call(`/owner/correspondence/${letter.id}/schedule`, {})).status,
    ).toBe(200);
    const cancelled = await call<{ letter: OwnerLetter }>(
      `/owner/correspondence/${letter.id}/cancel`,
      {},
    );
    expect(cancelled.data.letter).toMatchObject({
      state: 'draft',
      scheduledAt: null,
    });
    await makeDue(letter.id);
    expect(await publishDueLetters(db)).toEqual({ published: 0 });
    expect(await memberLetters()).toEqual([]);
  });

  it('chooses the invitation by the delivery hour in the letter’s own zone', () => {
    // 13:00 UTC on 20 October: 14:00 in London, 08:00 in Jamaica.
    const at = '2026-10-20T13:00:00Z';
    expect(invitationSlot(at, 'Europe/London')).toBe('afternoon');
    expect(invitationSlot(at, 'America/Jamaica')).toBe('morning');
    // London is on BST (UTC+1) until 25 October.
    expect(invitationSlot('2026-10-20T20:59:00Z', 'Europe/London')).toBe(
      'evening',
    );
    expect(invitationSlot('2026-10-20T21:00:00Z', 'Europe/London')).toBe(
      'night',
    );
    expect(invitationSlot('2026-10-21T03:59:00Z', 'Europe/London')).toBe(
      'night',
    );
    expect(invitationSlot('2026-10-21T04:00:00Z', 'Europe/London')).toBe(
      'morning',
    );
    expect(invitationSlot('2026-10-21T02:00:00Z', 'America/Jamaica')).toBe(
      'evening',
    );
  });

  it('agrees with the database for every hour of the day in both zones', async () => {
    for (const zone of ['Europe/London', 'America/Jamaica'])
      for (let hour = 0; hour < 24; hour++) {
        const at = new Date(Date.UTC(2026, 9, 20, hour, 15)).toISOString();
        const sql = await pg.query<{ slot: string }>(
          'select public.ttc_letter_slot($1::timestamptz,$2) as slot',
          [at, zone],
        );
        expect(sql.rows[0]!.slot, `${zone} ${at}`).toBe(
          invitationSlot(at, zone),
        );
      }
  });
});

describe('publication and the Butler’s invitation', () => {
  it('publishes a due letter once and queues exactly one invitation', async () => {
    const letter = await scheduledAndDue({ timezone: 'America/Jamaica' });
    // 13:00 UTC is 08:00 in Jamaica.
    await makeDue(letter.id, "'2026-10-14T13:00:00Z'");
    expect(await publishDueLetters(db)).toEqual({ published: 1 });
    expect(await publishDueLetters(db)).toEqual({ published: 0 });
    await Promise.all([publishDueLetters(db), publishDueLetters(db)]);
    const sms = await messages();
    expect(sms).toHaveLength(1);
    expect(sms[0]).toMatchObject({
      category: 'correspondence-alise',
      state: 'approved',
      body: INVITATION_TEMPLATES.morning,
    });
    expect(sms[0]!.body).toContain('https://30.ag14.co');
    const [owned] = (await ownerLetters()).letters;
    expect(owned).toMatchObject({
      state: 'published',
      status: 'published',
      publishedVia: 'schedule',
      invitationTemplate: 'morning',
      invitationSms: { state: 'approved', attempts: 0 },
    });
  });

  it('publishes lazily when the member reads, if the round has not run yet', async () => {
    await scheduledAndDue();
    const summary = await call('/correspondence/summary', undefined, 'member');
    expect(summary.data).toEqual({ unread: 1, total: 1 });
    expect(await messages()).toHaveLength(1);
  });

  it('Send Now publishes immediately with the current hour’s template, once', async () => {
    const letter = await createLetter({ deliverAt: null });
    const sent = await call<{ letter: OwnerLetter }>(
      `/owner/correspondence/${letter.id}/send-now`,
      {},
    );
    expect(sent.data.letter).toMatchObject({
      state: 'published',
      publishedVia: 'send-now',
      invitationTemplate: invitationSlot(Date.now(), 'Europe/London'),
    });
    await call(`/owner/correspondence/${letter.id}/send-now`, {});
    expect(await messages()).toHaveLength(1);
    expect(await memberLetters()).toHaveLength(1);
  });

  it('runs inside the existing round, before the outbox, and survives a failure', async () => {
    await scheduledAndDue();
    const order: string[] = [];
    const legacy = {
      store: memoryStore(),
      config: readConfig(TEST_ENV),
      channels: fakeChannels(() => Date.now()),
      clock: () => Date.now(),
    };
    const result = await scheduledRound({
      correspondence: async () => {
        const r = await publishDueLetters(db);
        order.push('publish');
        return r;
      },
      outbox: async () => {
        order.push('outbox');
        return { processed: 0 };
      },
      legacy,
    });
    expect(order).toEqual(['publish', 'outbox']);
    expect(result.published).toBe(1);
    const failing = await scheduledRound({
      correspondence: () => Promise.reject(new Error('database away')),
      outbox: async () => ({ processed: 3 }),
      legacy,
    });
    expect(failing).toMatchObject({ published: 'failed', outbox: 3 });
  });
});

describe('SMS truthfulness', () => {
  it('leaves the invitation queued, not sent, while SMS sending is disabled', async () => {
    await scheduledAndDue();
    await publishDueLetters(db);
    const send = vi.fn();
    expect(await processMessages(db, {}, send)).toEqual({ processed: 0 });
    expect(
      await processMessages(db, { SMS_SENDING_ENABLED: 'false' }, send),
    ).toEqual({ processed: 0 });
    expect(send).not.toHaveBeenCalled();
    const desk = await ownerLetters();
    expect(desk.smsEnabled).toBe(false);
    expect(desk.letters[0]!.invitationSms!.state).toBe('approved');
  });

  it('sends the invitation to Alise when enabled', async () => {
    await scheduledAndDue();
    await publishDueLetters(db);
    const send = twilioAccepts();
    await processMessages(db, smsEnv, send);
    const params = send.mock.calls[0]![1]!.body as URLSearchParams;
    expect(params.get('To')).toBe(smsEnv.ALISE_PHONE);
    expect(params.get('Body')).toBe((await messages())[0]!.body);
    expect((await ownerLetters()).letters[0]!.invitationSms!.state).toBe(
      'accepted',
    );
  });

  it('keeps a published letter visible when its SMS fails, and allows an owner retry', async () => {
    await scheduledAndDue();
    await publishDueLetters(db);
    const send = vi.fn<typeof fetch>(async () =>
      Response.json({ code: 21211 }, { status: 400 }),
    );
    await processMessages(db, smsEnv, send);
    const [letter] = (await ownerLetters()).letters;
    expect(letter!.invitationSms).toMatchObject({ state: 'failed' });
    expect(letter!.invitationSms!.lastError).toContain('21211');
    expect(letter!.state).toBe('published');
    expect(await memberLetters()).toHaveLength(1);
    const retried = await call<{ sms: { state: string; attempts: number } }>(
      `/owner/correspondence/messages/${letter!.invitationSms!.id}/retry`,
      {},
    );
    expect(retried.data.sms).toMatchObject({ state: 'approved', attempts: 0 });
    // A queued SMS cannot be "retried" into a duplicate.
    expect(
      (
        await call(
          `/owner/correspondence/messages/${letter!.invitationSms!.id}/retry`,
          {},
        )
      ).status,
    ).toBe(409);
    await processMessages(db, smsEnv, twilioAccepts());
    expect((await ownerLetters()).letters[0]!.invitationSms!.state).toBe(
      'accepted',
    );
  });

  it('marks an invitation that never left within six hours as failed', async () => {
    await scheduledAndDue();
    await publishDueLetters(db);
    await pg.exec(
      "update public.ttc_messages set send_at=now()-interval '7 hours'",
    );
    await publishDueLetters(db);
    const sms = (await ownerLetters()).letters[0]!.invitationSms!;
    expect(sms.state).toBe('failed');
    expect(sms.lastError).toContain('six hours');
  });

  it('holds an uncertain send for reconciliation rather than retrying it', async () => {
    await scheduledAndDue();
    await publishDueLetters(db);
    await processMessages(
      db,
      smsEnv,
      vi.fn(async () => new Response('bad gateway', { status: 502 })),
    );
    const sms = (await ownerLetters()).letters[0]!.invitationSms!;
    expect(sms.state).toBe('uncertain');
    expect(
      (await call(`/owner/correspondence/messages/${sms.id}/retry`, {})).status,
    ).toBe(409);
  });
});

describe('the member’s collection', () => {
  it('reports several unread letters and keeps opened ones', async () => {
    const first = await scheduledAndDue({ title: 'First' });
    await scheduledAndDue({ title: 'Second' });
    expect(
      (await call('/correspondence/summary', undefined, 'member')).data,
    ).toEqual({ unread: 2, total: 2 });
    const opened = await call<{ letter: MemberLetter }>(
      `/correspondence/${first.id}/open`,
      {},
      'member',
    );
    expect(opened.data.letter).toMatchObject({
      title: 'First',
      status: 'opened',
    });
    const again = await call<{ letter: MemberLetter }>(
      `/correspondence/${first.id}/open`,
      {},
      'member',
    );
    expect(again.data.letter.openedAt).toBe(opened.data.letter.openedAt);
    expect(
      (await call('/correspondence/summary', undefined, 'member')).data,
    ).toEqual({ unread: 1, total: 2 });
    const letters = await memberLetters();
    expect(letters.map((l) => l.status).sort()).toEqual([
      'opened',
      'published',
    ]);
    // The member view never carries SMS state.
    expect(JSON.stringify(letters)).not.toContain('invitation');
    expect(
      (await ownerLetters()).letters.find((l) => l.id === first.id)!.openedAt,
    ).not.toBeNull();
  });

  it('cancels an invitation that had not left when she opened the letter', async () => {
    const letter = await scheduledAndDue();
    await publishDueLetters(db);
    await call(`/correspondence/${letter.id}/open`, {}, 'member');
    const sms = (await ownerLetters()).letters[0]!.invitationSms!;
    expect(sms.state).toBe('cancelled');
    expect(sms.lastError).toContain('opened the letter');
  });

  it('cannot open a draft, scheduled or unknown letter', async () => {
    const letter = await createLetter();
    expect(
      (await call(`/correspondence/${letter.id}/open`, {}, 'member')).status,
    ).toBe(404);
    await call(`/owner/correspondence/${letter.id}/schedule`, {});
    expect(
      (await call(`/correspondence/${letter.id}/open`, {}, 'member')).status,
    ).toBe(404);
    expect(
      (
        await call(
          '/correspondence/00000000-0000-4000-8000-000000000000/open',
          {},
          'member',
        )
      ).status,
    ).toBe(404);
  });
});

describe('Thank the Butler', () => {
  it('records thanks once and queues exactly one reply to Alise', async () => {
    const letter = await scheduledAndDue();
    const first = await call<{ letter: MemberLetter; duplicate: boolean }>(
      `/correspondence/${letter.id}/thank`,
      {},
      'member',
    );
    expect(first.status).toBe(201);
    expect(first.data).toMatchObject({
      duplicate: false,
      letter: { status: 'thanked' },
    });
    const second = await call<{ duplicate: boolean }>(
      `/correspondence/${letter.id}/thank`,
      {},
      'member',
    );
    expect(second).toMatchObject({ status: 200, data: { duplicate: true } });
    await Promise.all([
      call(`/correspondence/${letter.id}/thank`, {}, 'member'),
      call(`/correspondence/${letter.id}/thank`, {}, 'member'),
    ]);
    const thanks = (await messages()).filter((m) => m.body === THANKS_RESPONSE);
    expect(thanks).toHaveLength(1);
    expect(thanks[0]!.category).toBe('correspondence-alise');
    const [owned] = (await ownerLetters()).letters;
    expect(owned).toMatchObject({
      status: 'thanked',
      thanksSms: { state: 'approved' },
    });
    expect(owned!.openedAt).not.toBeNull();
    const send = twilioAccepts();
    await processMessages(db, smsEnv, send); // the invitation
    await processMessages(db, smsEnv, send); // the reply
    const bodies = send.mock.calls.map((c) =>
      (c[1]!.body as URLSearchParams).get('Body'),
    );
    expect(bodies).toContain(THANKS_RESPONSE);
    expect(
      send.mock.calls.every(
        (c) => (c[1]!.body as URLSearchParams).get('To') === smsEnv.ALISE_PHONE,
      ),
    ).toBe(true);
  });
});

describe('Butler, A Word', () => {
  it('stores her exact message and notifies Arron in the agreed format', async () => {
    const letter = await scheduledAndDue({ title: 'Sunday' });
    const reply = await call<{ reply: { body: string }; duplicate: boolean }>(
      `/correspondence/${letter.id}/reply`,
      {
        body: '  Could we have dinner at eight?  ',
        idempotencyKey: 'reply-key-0001',
      },
      'member',
    );
    expect(reply.status).toBe(201);
    expect(reply.data.reply.body).toBe('Could we have dinner at eight?');
    const note = (await messages()).find(
      (m) => m.category === 'correspondence-arron',
    )!;
    expect(note.body).toBe(
      'THE THIRTY CLUB — A message from Madam Alise: Could we have dinner at eight?. Correspondence: Sunday.',
    );
    const [owned] = (await ownerLetters()).letters;
    expect(owned!.replies).toHaveLength(1);
    expect(owned!.replies[0]).toMatchObject({
      body: 'Could we have dinner at eight?',
      notificationSms: { state: 'approved' },
    });
    const send = twilioAccepts();
    await processMessages(db, smsEnv, send);
    await processMessages(db, smsEnv, send);
    const toArron = send.mock.calls.find(
      (c) => (c[1]!.body as URLSearchParams).get('To') === smsEnv.ARRON_PHONE,
    );
    expect((toArron![1]!.body as URLSearchParams).get('Body')).toBe(note.body);
    // Her words never enter the activity log.
    const activity = await pg.query<{ detail: unknown }>(
      'select detail from public.ttc_activity_events',
    );
    expect(JSON.stringify(activity.rows)).not.toContain('dinner');
  });

  it('keeps the message when SMS is disabled or fails', async () => {
    const letter = await scheduledAndDue();
    await call(
      `/correspondence/${letter.id}/reply`,
      { body: 'Thank you, darling.', idempotencyKey: 'reply-key-0002' },
      'member',
    );
    await processMessages(db, {}, vi.fn());
    const failing = vi.fn(async () =>
      Response.json({ code: 1 }, { status: 400 }),
    );
    await processMessages(db, smsEnv, failing);
    await processMessages(db, smsEnv, failing);
    const [owned] = (await ownerLetters()).letters;
    expect(owned!.replies[0]!.body).toBe('Thank you, darling.');
    expect(owned!.replies[0]!.notificationSms!.state).toBe('failed');
    expect((await memberLetters())[0]!.replies).toHaveLength(1);
  });

  it('protects against duplicates, oversize messages and floods', async () => {
    const letter = await scheduledAndDue();
    const path = `/correspondence/${letter.id}/reply`;
    const first = await call(
      path,
      { body: 'Hello', idempotencyKey: 'key-dup-0001' },
      'member',
    );
    const retry = await call<{ duplicate: boolean }>(
      path,
      { body: 'Hello', idempotencyKey: 'key-dup-0001' },
      'member',
    );
    expect([first.status, retry.status]).toEqual([201, 200]);
    expect(retry.data.duplicate).toBe(true);
    expect(
      (
        await call(
          path,
          { body: 'Different', idempotencyKey: 'key-dup-0001' },
          'member',
        )
      ).status,
    ).toBe(409);
    const sameWords = await call<{ duplicate: boolean }>(
      path,
      { body: 'Hello', idempotencyKey: 'key-dup-0002' },
      'member',
    );
    expect(sameWords.data.duplicate).toBe(true);
    expect(
      (
        await call(
          path,
          { body: 'x'.repeat(1001), idempotencyKey: 'key-big-0001' },
          'member',
        )
      ).status,
    ).toBe(400);
    expect(
      (
        await call(
          path,
          { body: '   ', idempotencyKey: 'key-blank-001' },
          'member',
        )
      ).status,
    ).toBe(400);
    for (let n = 2; n <= 5; n++)
      expect(
        (
          await call(
            path,
            { body: `Note ${n}`, idempotencyKey: `key-flood-00${n}` },
            'member',
          )
        ).status,
      ).toBe(201);
    expect(
      (
        await call(
          path,
          { body: 'Note 6', idempotencyKey: 'key-flood-006' },
          'member',
        )
      ).status,
    ).toBe(429);
    expect(
      (await messages()).filter((m) => m.category === 'correspondence-arron'),
    ).toHaveLength(5);
  });
});

describe('authentication and permissions', () => {
  it('requires a session for every correspondence route', async () => {
    for (const path of [
      '/correspondence',
      '/correspondence/summary',
      '/owner/correspondence',
    ])
      expect((await call(path, undefined, 'none')).status).toBe(401);
  });

  it('keeps the owner and the member to their own routes', async () => {
    const letter = await scheduledAndDue();
    expect(
      (await call('/owner/correspondence', undefined, 'member')).status,
    ).toBe(403);
    expect(
      (await call('/owner/correspondence', draft(), 'member')).status,
    ).toBe(403);
    expect(
      (await call(`/owner/correspondence/${letter.id}/send-now`, {}, 'member'))
        .status,
    ).toBe(403);
    expect((await call('/correspondence', undefined, 'owner')).status).toBe(
      403,
    );
    expect(
      (await call(`/correspondence/${letter.id}/thank`, {}, 'owner')).status,
    ).toBe(403);
  });

  it('refuses browser-shaped roles and actions at the database', async () => {
    await expect(
      db.action(member, 'member', 'system-correspondence-publish', {
        templates: INVITATION_TEMPLATES,
      }),
    ).rejects.toMatchObject({ code: 'forbidden' });
    await expect(
      db.action(member, 'member', 'owner-correspondence-list', {
        templates: INVITATION_TEMPLATES,
      }),
    ).rejects.toMatchObject({ code: 'forbidden' });
    await expect(
      db.action(null, 'owner', 'correspondence-list', {
        templates: INVITATION_TEMPLATES,
      }),
    ).rejects.toMatchObject({ code: 'forbidden' });
    const grants = await pg.query<{ n: number }>(
      "select count(*)::int as n from information_schema.role_table_grants where table_name in ('ttc_letters','ttc_letter_replies') and grantee in ('anon','authenticated')",
    );
    expect(grants.rows[0]!.n).toBe(0);
  });
});

describe('legacy notification compatibility', () => {
  it('still sends approved scheduled Alise and transactional Arron messages to the same phones', async () => {
    const { message } = (await db.action(
      null,
      'owner',
      'owner-message-create',
      {
        label: 'Legacy',
        body: 'Legacy scheduled message',
        sendAt: new Date(Date.now() + 60_000).toISOString(),
        timezone: 'Europe/London',
      },
    )) as { message: { id: string } };
    await db.action(null, 'owner', 'owner-message-approve', { id: message.id });
    await pg.exec(
      "update public.ttc_messages set send_at=now()-interval '1 minute', next_attempt_at=now()-interval '1 minute'",
    );
    await pg.exec(
      "insert into public.ttc_messages(label,body,category,send_at,timezone,state,approved_at,next_attempt_at) values('Claim','Claim note','transactional-arron',now(),'Europe/London','approved',now(),now())",
    );
    const send = twilioAccepts();
    await processMessages(db, smsEnv, send);
    await processMessages(db, smsEnv, send);
    const to = Object.fromEntries(
      send.mock.calls.map((c) => {
        const p = c[1]!.body as URLSearchParams;
        return [p.get('Body'), p.get('To')];
      }),
    );
    expect(to).toEqual({
      'Legacy scheduled message': smsEnv.ALISE_PHONE,
      'Claim note': smsEnv.ARRON_PHONE,
    });
  });

  it('leaves correspondence messages out of the legacy edit path', async () => {
    await scheduledAndDue();
    await publishDueLetters(db);
    const [sms] = await messages();
    await expect(
      db.action(null, 'owner', 'owner-message-update', {
        id: sms!.id,
        label: 'Edited',
        body: 'Edited',
        sendAt: inAnHour(),
        timezone: 'Europe/London',
      }),
    ).rejects.toMatchObject({ code: 'conflict' });
  });
});
