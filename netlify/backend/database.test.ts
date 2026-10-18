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
import { createBackendApi } from './api.ts';
import { BackendError, type Database } from './database.ts';
import { hashToken, newToken, passwordMatches } from './auth.ts';
import { scryptSync, createHmac } from 'node:crypto';
import { processMessages, validTwilioSignature } from './sms.ts';
let pg: PGlite;
let member: string;
let nail: string;
let brow: string;
let drink: string;
const ownerToken = newToken();
const memberToken = newToken();
const env = {
  OWNER_PASSWORD_HASH: `scrypt$testsalt$${scryptSync('long owner test password', 'testsalt', 64).toString('hex')}`,
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
        'select public.ttc_action($1,$2,$3,$4::jsonb) as result',
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
const owner = (action: string, input = {}) =>
  db.action(null, 'owner', action, input);
const act = (action: string, input = {}) =>
  db.action(member, 'member', action, input);
const api = createBackendApi({ db, env });
async function request(
  path: string,
  body?: unknown,
  role: 'owner' | 'member' | 'none' = 'member',
  method?: string,
  headers: Record<string, string> = {},
) {
  return api(
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
        ...headers,
      },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    }),
    'test-ip',
  );
}
beforeAll(async () => {
  pg = new PGlite();
  await pg.exec(
    'create role anon; create role authenticated; create role service_role bypassrls;',
  );
  for (const filename of readdirSync(resolve('supabase/migrations')).sort())
    await pg.exec(
      readFileSync(resolve('supabase/migrations', filename), 'utf8'),
    );
  const members = await pg.query<{ id: string }>(
    "select id from public.ttc_members where slug='alise'",
  );
  member = members.rows[0]!.id;
  const ps = await pg.query<{ id: string; slug: string }>(
    'select id,slug from public.ttc_privileges',
  );
  nail = ps.rows.find((x) => x.slug === 'nail-appointment')!.id;
  brow = ps.rows.find((x) => x.slug === 'brow-appointment')!.id;
  drink = ps.rows.find((x) => x.slug === 'drink-vouchers')!.id;
}, 30000);
beforeEach(async () => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-10-18T12:00:00Z'));
  await pg.exec(
    "truncate public.ttc_sessions,public.ttc_nfc_assignments,public.ttc_rate_limits,public.ttc_redemptions,public.ttc_messages,public.ttc_message_delivery_logs,public.ttc_reward_transactions,public.ttc_slot_plays,public.ttc_activity_events cascade; update public.ttc_reward_balances set quantity=0; update public.ttc_settings set transactional_sms_approved=false; update public.ttc_privileges set enabled=true, opens_at=now()-interval '1 day',closes_at=now()+interval '1 day';",
  );
  await pg.query(
    "insert into public.ttc_sessions(token_hash,role,member_id,expires_at) values($1,'member',$2,now()+interval '1 day'),($3,'owner',null,now()+interval '1 day')",
    [hashToken(memberToken), member, hashToken(ownerToken)],
  );
});
afterAll(async () => {
  vi.useRealTimers();
  await pg?.close();
});
describe('secure authentication and privilege access', () => {
  it('checks scrypt and rejects incorrect passwords', async () => {
    expect(
      await passwordMatches(
        'long owner test password',
        env.OWNER_PASSWORD_HASH,
      ),
    ).toBe(true);
    expect(await passwordMatches('wrong', env.OWNER_PASSWORD_HASH)).toBe(false);
    expect(
      (await request('/auth/owner', { password: 'wrong' }, 'none')).status,
    ).toBe(401);
    const response = await request(
      '/auth/owner',
      { password: 'long owner test password' },
      'none',
    );
    expect(response.status).toBe(200);
    expect(response.headers.get('set-cookie')).toContain(
      'HttpOnly; SameSite=Strict',
    );
    expect(response.headers.get('set-cookie')).toContain('Secure');
  });
  it('requires an actual session and owner role, ignores ceremonial bearer tokens', async () => {
    expect((await request('/privileges', undefined, 'none')).status).toBe(401);
    expect(
      (
        await request('/privileges', undefined, 'none', undefined, {
          authorization: 'Bearer cinematic-token',
        })
      ).status,
    ).toBe(401);
    expect((await request('/owner/overview')).status).toBe(403);
    expect((await request('/privileges', undefined, 'owner')).status).toBe(403);
    expect((await request('/privileges')).status).toBe(200);
  });
  it('rejects cross-origin writes and missing CSRF header', async () => {
    expect(
      (
        await request('/redemptions', {}, 'member', undefined, {
          origin: 'https://evil.example',
        })
      ).status,
    ).toBe(403);
    expect(
      (
        await request('/auth/logout', {}, 'member', undefined, {
          'x-concierge-request': '',
        })
      ).status,
    ).toBe(403);
  });
  it('exchanges an invitation once and supports server revocation', async () => {
    const token = newToken();
    await owner('owner-invitation', { hash: hashToken(token) });
    const response = await request('/auth/member', { token }, 'none');
    expect(response.status).toBe(200);
    expect((await request('/auth/member', { token }, 'none')).status).toBe(401);
    await owner('owner-revoke');
    expect((await request('/auth/session')).status).toBe(401);
  });
  it('rate limits repeated login attempts persistently', async () => {
    for (let n = 0; n < 8; n++)
      expect(
        (await request('/auth/owner', { password: 'wrong' }, 'none')).status,
      ).toBe(401);
    expect(
      (await request('/auth/owner', { password: 'wrong' }, 'none')).status,
    ).toBe(429);
  });
  it('revokes logout and rejects expired sessions', async () => {
    expect((await request('/auth/logout', {})).status).toBe(200);
    expect((await request('/auth/session')).status).toBe(401);
    await pg.exec(
      "update public.ttc_sessions set expires_at=now()-interval '1 second'",
    );
    expect((await request('/auth/session', undefined, 'owner')).status).toBe(
      401,
    );
  });
  it('enables RLS and denies browser roles execute and table access', async () => {
    const result = await pg.query<{ relrowsecurity: boolean }>(
      "select relrowsecurity from pg_class where relname like 'ttc_%' and relkind='r'",
    );
    expect(result.rows.every((x) => x.relrowsecurity)).toBe(true);
    const grants = await pg.query<{ allowed: boolean }>(
      "select has_function_privilege('anon','public.ttc_action(uuid,text,text,jsonb)','execute') or has_table_privilege('authenticated','public.ttc_redemptions','select') as allowed",
    );
    expect(grants.rows[0]!.allowed).toBe(false);
  });
});
describe('atomic redemption and fulfilment', () => {
  it('creates separate nail and brow claims with pending notifications and owner fulfilment', async () => {
    const first = await request('/redemptions', {
      privilegeId: nail,
      amountPence: 4250,
      idempotencyKey: 'beauty-nails-001',
    });
    expect(first.status).toBe(201);
    const { redemption } = await first.json();
    expect(redemption).toMatchObject({
      state: 'pending',
      amountPence: 4250,
      currency: 'GBP',
      notificationState: 'draft',
    });
    expect(
      (
        await request('/redemptions', {
          privilegeId: brow,
          amountPence: 2500,
          idempotencyKey: 'beauty-brows-001',
        })
      ).status,
    ).toBe(201);
    expect(
      (await request(`/owner/redemptions/${redemption.id}/fulfil`, {})).status,
    ).toBe(403);
    const fulfilled = await request(
      `/owner/redemptions/${redemption.id}/fulfil`,
      {},
      'owner',
    );
    const f = await fulfilled.json();
    expect(f.redemption.state).toBe('fulfilled');
    const repeated = await request(
      `/owner/redemptions/${redemption.id}/fulfil`,
      {},
      'owner',
    );
    expect((await repeated.json()).redemption.fulfilledAt).toBe(
      f.redemption.fulfilledAt,
    );
    expect((await request(`/redemptions/${redemption.id}`)).status).toBe(200);
  });
  it.each([0, -1, 1.5, '100', null, 100001, Number.MAX_SAFE_INTEGER])(
    'rejects invalid amount %s',
    async (amountPence) => {
      expect(
        (
          await request('/redemptions', {
            privilegeId: nail,
            amountPence,
            idempotencyKey: 'invalid-amount-001',
          })
        ).status,
      ).toBe(400);
      expect(
        (await pg.query('select * from public.ttc_redemptions')).rows,
      ).toHaveLength(0);
    },
  );
  it('replays exact keys but rejects changed payloads and a second distinct claim', async () => {
    const payload = {
      privilegeId: nail,
      amountPence: 3000,
      idempotencyKey: 'stable-request-key',
    };
    expect((await request('/redemptions', payload)).status).toBe(201);
    const retry = await request('/redemptions', payload);
    expect(retry.status).toBe(200);
    expect((await retry.json()).duplicate).toBe(true);
    expect(
      (await request('/redemptions', { ...payload, amountPence: 3100 })).status,
    ).toBe(409);
    const another = await request('/redemptions', {
      ...payload,
      idempotencyKey: 'different-request',
    });
    expect(another.status).toBe(409);
    expect((await another.json()).redemption.amountPence).toBe(3000);
  });
  it('handles concurrent distinct and matching submissions with one database claim', async () => {
    const results = await Promise.all(
      Array.from({ length: 12 }, (_, n) =>
        request('/redemptions', {
          privilegeId: nail,
          amountPence: 4200,
          idempotencyKey: `concurrent-${n}`,
        }),
      ),
    );
    expect(results.filter((x) => x.status === 201)).toHaveLength(1);
    expect(results.filter((x) => x.status === 409)).toHaveLength(11);
    expect(
      (await pg.query('select * from public.ttc_redemptions')).rows,
    ).toHaveLength(1);
    expect(
      (await pg.query('select * from public.ttc_messages')).rows,
    ).toHaveLength(1);
  });
  it('enforces disabled, future and expired privilege dates on the server', async () => {
    const payload = {
      privilegeId: nail,
      amountPence: 100,
      idempotencyKey: 'access-date-check',
    };
    await pg.query(
      'update public.ttc_privileges set enabled=false where id=$1',
      [nail],
    );
    expect((await request('/redemptions', payload)).status).toBe(403);
    await pg.query(
      "update public.ttc_privileges set enabled=true,opens_at=now()+interval '2 days', closes_at=now()+interval '3 days' where id=$1",
      [nail],
    );
    expect((await request('/redemptions', payload)).status).toBe(403);
    await pg.query(
      "update public.ttc_privileges set opens_at=now()-interval '3 days',closes_at=now()-interval '1 day' where id=$1",
      [nail],
    );
    const expired = await request('/redemptions', payload);
    expect((await expired.json()).error).toBe('expired');
  });
  it('prevents overdraw under concurrent voucher redemptions and keeps a matching ledger', async () => {
    await owner('owner-adjust', {
      delta: '10',
      reason: 'test credit',
      idempotencyKey: 'initial-credit-key',
    });
    const results = await Promise.all(
      [1, 2].map((n) =>
        request('/redemptions', {
          privilegeId: drink,
          quantity: '7',
          idempotencyKey: `drink-request-${n}`,
        }),
      ),
    );
    expect(results.map((x) => x.status).sort()).toEqual([201, 409]);
    expect(await act('balances')).toMatchObject({
      balances: [{ quantity: '3' }],
    });
    const integrity = await pg.query<{ quantity: string; total: string }>(
      'select quantity::text, (select sum(delta)::text from public.ttc_reward_transactions where member_id=$1) as total from public.ttc_reward_balances where member_id=$1',
      [member],
    );
    expect(integrity.rows[0]).toEqual({ quantity: '3', total: '3' });
  });
  it('supports balances beyond JS integer precision and idempotent owner adjustment', async () => {
    const payload = {
      delta: '99999999999999999999999999999',
      reason: 'No product balance cap',
      idempotencyKey: 'huge-credit-key',
    };
    await owner('owner-adjust', payload);
    expect(await owner('owner-adjust', payload)).toMatchObject({
      duplicate: true,
      balance: { quantity: payload.delta },
    });
    expect((await request('/rewards/balances')).status).toBe(200);
  });
});
describe('SMS approval, failures and scheduler idempotency', () => {
  const smsEnv = {
    SMS_SENDING_ENABLED: 'true',
    TWILIO_ACCOUNT_SID: 'ACtest',
    TWILIO_AUTH_TOKEN: 'test-auth',
    TWILIO_MESSAGING_SERVICE_SID: 'MGtest',
    CONCIERGE_SITE_URL: 'https://30.ag14.co',
    ALISE_PHONE: '+447700900001',
    ARRON_PHONE: '+447700900002',
  };
  async function approvedMessage() {
    const { message } = (await owner('owner-message-create', {
      label: 'test message',
      body: 'A scheduled message',
      sendAt: new Date(Date.now() + 3600000).toISOString(),
      timezone: 'Europe/London',
    })) as { message: { id: string } };
    await owner('owner-message-approve', { id: message.id });
    await pg.query(
      "update public.ttc_messages set send_at=now()-interval '1 minute',next_attempt_at=now() where id=$1",
      [message.id],
    );
    return message.id;
  }
  it('never sends drafts, or approved messages when global SMS is disabled', async () => {
    await approvedMessage();
    const send = vi.fn();
    expect(await processMessages(db, {}, send)).toEqual({ processed: 0 });
    expect(send).not.toHaveBeenCalled();
    await pg.exec("update public.ttc_messages set state='draft'");
    expect(await processMessages(db, smsEnv, send)).toEqual({ processed: 0 });
    expect(send).not.toHaveBeenCalled();
  });
  it('claims a scheduled message once across competing workers using MessagingServiceSid', async () => {
    await approvedMessage();
    const send = vi.fn(async (_url: unknown, options?: RequestInit) => {
      const params = options!.body as URLSearchParams;
      expect(params.get('MessagingServiceSid')).toBe('MGtest');
      expect(params.get('From')).toBeNull();
      expect(params.get('To')).toBe(smsEnv.ALISE_PHONE);
      return Response.json({ sid: `SM${'1'.repeat(32)}`, status: 'accepted' });
    });
    await Promise.all([
      processMessages(db, smsEnv, send),
      processMessages(db, smsEnv, send),
    ]);
    expect(send).toHaveBeenCalledTimes(1);
    expect(
      (
        await pg.query<{ state: string }>(
          'select state from public.ttc_messages',
        )
      ).rows[0]!.state,
    ).toBe('accepted');
  });
  it('does not undo a valid redemption when Twilio rejects its notification', async () => {
    const claimed = (await act('redeem', {
      privilegeId: nail,
      amountPence: 4000,
      idempotencyKey: 'sms-failure-claim',
    })) as { redemption: { id: string } };
    const msgs = await pg.query<{ id: string }>(
      'select id from public.ttc_messages',
    );
    await owner('owner-message-approve', { id: msgs.rows[0]!.id });
    const send = vi.fn(async (_url: unknown, options?: RequestInit) => {
      expect((options!.body as URLSearchParams).get('To')).toBe(
        smsEnv.ARRON_PHONE,
      );
      return Response.json({ code: 21211 }, { status: 400 });
    });
    await processMessages(db, smsEnv, send);
    expect(
      await act('redemption', { id: claimed.redemption.id }),
    ).toMatchObject({
      redemption: { state: 'pending', notificationState: 'failed' },
    });
  });
  it('retries definite rate limits with backoff and holds timeouts without resend', async () => {
    await approvedMessage();
    const rateLimited = vi.fn(async () =>
      Response.json({ code: 20429 }, { status: 429 }),
    );
    await processMessages(db, smsEnv, rateLimited);
    await processMessages(db, smsEnv, rateLimited);
    expect(rateLimited).toHaveBeenCalledTimes(1);
    await pg.exec('update public.ttc_messages set next_attempt_at=now()');
    const timeout = vi.fn(async () => {
      throw new Error('timeout');
    });
    await processMessages(db, smsEnv, timeout);
    await processMessages(db, smsEnv, timeout);
    expect(timeout).toHaveBeenCalledTimes(1);
    expect(
      (
        await pg.query<{ state: string }>(
          'select state from public.ttc_messages',
        )
      ).rows[0]!.state,
    ).toBe('uncertain');
  });
  it('marks interrupted workers uncertain and refuses expired catch-up sends', async () => {
    await approvedMessage();
    await db.action(null, 'system', 'system-message-claim');
    await pg.exec(
      "update public.ttc_messages set claimed_at=now()-interval '5 minutes'",
    );
    expect(await db.action(null, 'system', 'system-message-claim')).toBeNull();
    expect(
      (
        await pg.query<{ state: string }>(
          'select state from public.ttc_messages',
        )
      ).rows[0]!.state,
    ).toBe('uncertain');
  });
  it('validates Twilio signatures and records delivery without downgrading it', async () => {
    const id = await approvedMessage();
    const params = new URLSearchParams({
      MessageSid: `SM${'2'.repeat(32)}`,
      MessageStatus: 'delivered',
    });
    const claim = await db.action<{ claimId: string }>(
      null,
      'system',
      'system-message-claim',
    );
    const url = `https://30.ag14.co/api/v1/twilio/status?messageId=${id}&claimId=${claim.claimId}`;
    const signature = createHmac('sha1', 'test-auth')
      .update(
        url +
          'MessageSid' +
          params.get('MessageSid') +
          'MessageStatusdelivered',
      )
      .digest('base64');
    expect(validTwilioSignature(url, params, signature, 'test-auth')).toBe(
      true,
    );
    expect(validTwilioSignature(url, params, 'invalid', 'test-auth')).toBe(
      false,
    );
    await db.action(null, 'system', 'system-message-claim');
    const handler = createBackendApi({ db, env: smsEnv });
    const response = await handler(
      new Request(url, {
        method: 'POST',
        headers: { 'x-twilio-signature': signature },
        body: params,
      }),
      'twilio',
    );
    expect(response.status).toBe(204);
    await db.action(null, 'system', 'system-message-callback', {
      id,
      providerSid: params.get('MessageSid'),
      state: 'sent',
    });
    expect(
      (
        await pg.query<{ state: string }>(
          'select state from public.ttc_messages',
        )
      ).rows[0]!.state,
    ).toBe('delivered');
  });
});

describe('Casino authority and notification policy', () => {
  it('holds plays until the actual Casino opening', async () => {
    const response = await request('/casino/slots/play', {
      idempotencyKey: 'early-slot-play',
    });
    expect(response.status).toBe(403);
    expect(
      (await pg.query('select * from public.ttc_reward_transactions')).rows,
    ).toHaveLength(0);
  });
  it('grants the first actual play exactly ten once, then only server-validated winning grants', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-10-24T19:01:00Z'));
    await pg.exec(
      "update public.ttc_sessions set expires_at=now()+interval '30 days'",
    );
    const first = await request('/casino/slots/play', {
      idempotencyKey: 'first-slot-play',
    });
    expect(first.status).toBe(201);
    const value = await first.json();
    expect(value).toMatchObject({
      firstPlayBonus: '10',
      granted: '10',
      balance: { quantity: '10' },
    });
    const duplicate = await request('/casino/slots/play', {
      idempotencyKey: 'first-slot-play',
    });
    expect((await duplicate.json()).playId).toBe(value.playId);
    expect(
      (
        await request('/casino/slots/play', {
          idempotencyKey: 'second-slot-play',
        })
      ).status,
    ).toBe(429);
    vi.setSystemTime(new Date('2026-10-24T19:01:03Z'));
    const next = await request('/casino/slots/play', {
      idempotencyKey: 'second-slot-play',
    });
    expect(next.status).toBe(201);
    expect(await next.json()).toMatchObject({
      outcome: 'miss',
      firstPlayBonus: '0',
      granted: '0',
      balance: { quantity: '10' },
    });
  });
  it('rejects client-provided winnings and member attempts to adjust balances', async () => {
    expect(
      (
        await request('/casino/slots/play', {
          idempotencyKey: 'cheating-slot-play',
          granted: '999',
        })
      ).status,
    ).toBe(400);
    expect(
      (
        await request('/owner/rewards/adjust', {
          delta: '999',
          reason: 'cheat',
          idempotencyKey: 'cheat-balance-key',
        })
      ).status,
    ).toBe(403);
  });
  it('queues automatic transactional SMS only after an explicit owner policy approval', async () => {
    await owner('owner-notification-policy', {
      transactionalSmsApproved: true,
    });
    const result = await act('redeem', {
      privilegeId: nail,
      amountPence: 1234,
      idempotencyKey: 'approved-policy-claim',
    });
    expect(result).toMatchObject({
      redemption: { notificationState: 'approved' },
    });
    await owner('owner-notification-policy', {
      transactionalSmsApproved: false,
    });
    expect(
      await act('redeem', {
        privilegeId: brow,
        amountPence: 1234,
        idempotencyKey: 'paused-policy-claim',
      }),
    ).toMatchObject({ redemption: { notificationState: 'draft' } });
  });
});

describe('owner management and scheduling transitions', () => {
  it('creates and edits privileges without changing their identity or claim', async () => {
    const payload = {
      slug: 'spa-appointment',
      title: 'Spa appointment',
      description: 'Owner-created benefit',
      kind: 'beauty',
      enabled: true,
      opensAt: '2026-10-01T00:00:00Z',
      closesAt: '2026-10-22T00:00:00+01:00',
      minAmountPence: 1,
      maxAmountPence: 50000,
    };
    const created = await request('/owner/privileges', payload, 'owner');
    expect(created.status).toBe(201);
    const { privilege } = await created.json();
    expect(
      (
        await request(
          `/owner/privileges/${privilege.id}`,
          { ...payload, title: 'Spa treatment' },
          'owner',
          'PATCH',
        )
      ).status,
    ).toBe(200);
    expect(
      (
        await request(
          `/owner/privileges/${privilege.id}`,
          { ...payload, slug: 'different-slug' },
          'owner',
          'PATCH',
        )
      ).status,
    ).toBe(400);
  });
  it('resets message approval when its content changes and refuses undated approval', async () => {
    const payload = {
      label: 'Friday welcome',
      body: 'Welcome to Jamaica',
      sendAt: '2026-10-23T15:00:00Z',
      timezone: 'America/Jamaica',
    };
    const created = await request('/owner/messages', payload, 'owner');
    const { message } = await created.json();
    expect(
      (await request(`/owner/messages/${message.id}/approve`, {}, 'owner'))
        .status,
    ).toBe(200);
    const edited = await request(
      `/owner/messages/${message.id}`,
      { ...payload, body: 'Revised welcome' },
      'owner',
      'PATCH',
    );
    expect((await edited.json()).message).toMatchObject({
      state: 'draft',
      approvedAt: null,
    });
    const undated = await request(
      '/owner/messages',
      { ...payload, sendAt: null },
      'owner',
    );
    const { message: unknownTime } = await undated.json();
    expect(
      (await request(`/owner/messages/${unknownTime.id}/approve`, {}, 'owner'))
        .status,
    ).toBe(400);
  });
  it('does not send an old missed scheduled message', async () => {
    const result = (await owner('owner-message-create', {
      label: 'Missed scheduled time',
      body: 'A message',
      sendAt: '2026-10-19T10:00:00Z',
      timezone: 'Europe/London',
    })) as { message: { id: string } };
    await owner('owner-message-approve', { id: result.message.id });
    await pg.query(
      "update public.ttc_messages set send_at=now()-interval '1 hour' where id=$1",
      [result.message.id],
    );
    expect(await db.action(null, 'system', 'system-message-claim')).toBeNull();
    expect(
      (
        await pg.query<{ state: string }>(
          'select state from public.ttc_messages where id=$1',
          [result.message.id],
        )
      ).rows[0]!.state,
    ).toBe('failed');
  });
  it('rejects timestamps without offsets and invalid calendar dates', async () => {
    for (const sendAt of [
      '2026-10-24T14:00',
      '2026-02-31T14:00:00Z',
      '2026-10-24T24:00:00Z',
    ])
      expect(
        (
          await request(
            '/owner/messages',
            {
              label: 'bad date',
              body: 'Invalid date',
              sendAt,
              timezone: 'Europe/London',
            },
            'owner',
          )
        ).status,
      ).toBe(400);
  });
  it('keeps legacy conditional writes atomic in PostgreSQL', async () => {
    const rpc = async (
      operation: string,
      key: string,
      value: unknown = null,
      etag: string | null = null,
    ) =>
      (
        await pg.query<{ result: unknown }>(
          'select public.ttc_legacy_store($1,$2,$3::jsonb,$4::uuid) as result',
          [operation, key, JSON.stringify(value), etag],
        )
      ).rows[0]!.result;
    expect(await rpc('create', 'live/test', { a: 1 })).toBe(true);
    expect(await rpc('create', 'live/test', { a: 2 })).toBe(false);
    const entry = (await rpc('get', 'live/test')) as { etag: string };
    expect(await rpc('replace', 'live/test', { a: 3 }, entry.etag)).toBe(true);
    expect(await rpc('replace', 'live/test', { a: 4 }, entry.etag)).toBe(false);
    expect(await rpc('list', 'live/')).toEqual(['live/test']);
  });
});

describe('Twilio callback races', () => {
  async function sending() {
    const created = (await owner('owner-message-create', {
      label: 'Race rehearsal',
      body: 'No provider call',
      sendAt: '2026-10-19T12:00:00Z',
      timezone: 'Europe/London',
    })) as { message: { id: string } };
    await owner('owner-message-approve', { id: created.message.id });
    await pg.query(
      "update public.ttc_messages set send_at=now()-interval '1 minute',next_attempt_at=now() where id=$1",
      [created.message.id],
    );
    return db.action<{ id: string; claimId: string }>(
      null,
      'system',
      'system-message-claim',
    );
  }
  it('accepts a callback arriving before the Messages API response is persisted', async () => {
    const claim = await sending();
    const providerSid = `SM${'3'.repeat(32)}`;
    await db.action(null, 'system', 'system-message-callback', {
      ...claim,
      providerSid,
      state: 'sent',
    });
    expect(
      await db.action(null, 'system', 'system-message-result', {
        ...claim,
        providerSid,
        state: 'accepted',
      }),
    ).toEqual({ ok: true });
    expect(
      (
        await pg.query<{ state: string }>(
          'select state from public.ttc_messages where id=$1',
          [claim.id],
        )
      ).rows[0]!.state,
    ).toBe('accepted');
  });
  it('ignores an old attempt callback after an explicit owner-approved retry', async () => {
    const first = await sending();
    const oldSid = `SM${'4'.repeat(32)}`;
    await db.action(null, 'system', 'system-message-callback', {
      ...first,
      providerSid: oldSid,
      state: 'failed',
    });
    await owner('owner-message-retry', { id: first.id });
    const second = await db.action<{
      id: string;
      claimId: string;
      providerSid: string | null;
    }>(null, 'system', 'system-message-claim');
    expect(second.claimId).not.toBe(first.claimId);
    expect(second.providerSid).toBeNull();
    await db.action(null, 'system', 'system-message-callback', {
      ...first,
      providerSid: oldSid,
      state: 'delivered',
    });
    expect(
      (
        await pg.query<{ state: string }>(
          'select state from public.ttc_messages where id=$1',
          [first.id],
        )
      ).rows[0]!.state,
    ).toBe('sending');
    const newSid = `SM${'5'.repeat(32)}`;
    await db.action(null, 'system', 'system-message-result', {
      id: second.id,
      claimId: second.claimId,
      state: 'accepted',
      providerSid: newSid,
    });
    expect(
      (
        await pg.query<{ provider_sid: string }>(
          'select provider_sid from public.ttc_messages where id=$1',
          [first.id],
        )
      ).rows[0]!.provider_sid,
    ).toBe(newSid);
  });
});
