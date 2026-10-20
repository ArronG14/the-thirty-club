// @vitest-environment node
/**
 * The communication hold (ADR-021) on PostgreSQL (PGlite) with every real
 * migration in order, applied over LIVE-like data. Time follows
 * `ttc_sim_now()` as in the rehearsal office.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createBackendApi } from './api.ts';
import { hashToken, newToken } from './auth.ts';
import { publishDueLetters } from './correspondence.ts';
import { BackendError, rpcFor, type Database } from './database.ts';
import { publishJourneyEvent, runJourneyRound } from './journey.ts';
import { processMessages } from './sms.ts';

const MIGRATIONS = resolve('supabase/migrations');
const HOLD_MIGRATION = '20261022110000_communication_hold.sql';
const rewriteClock = (sql: string) =>
  sql.replace(/(?<![\w.])now\(\)/g, 'public.ttc_sim_now()');
const files = readdirSync(MIGRATIONS).sort();

let pg: PGlite;
let db: Database;
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
/** A fake provider that records every send and never touches the network. */
const sent: string[] = [];
const provider = (async (_url: unknown, init?: RequestInit) => {
  const params = new URLSearchParams(String(init?.body ?? ''));
  sent.push(params.get('To') ?? '');
  return new Response(
    JSON.stringify({ sid: `SM${sent.length}`, status: 'accepted' }),
    { status: 201, headers: { 'content-type': 'application/json' } },
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
  role: 'owner' | 'member' = 'owner',
  method?: 'GET' | 'POST' | 'PATCH',
): Promise<{ status: number; data: T }> {
  const response = await createBackendApi({ db, env: {} })(
    new Request(`https://30.ag14.co/api/v1${path}`, {
      method: method ?? (body === undefined ? 'GET' : 'POST'),
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

const count = async (sql: string) =>
  Number(
    (await pg.query<{ n: number }>(`select count(*)::int as n from ${sql}`))
      .rows[0]!.n,
  );
const published = () => count("public.ttc_letters where state = 'published'");
const aliseSmsApproved = () =>
  count(
    "public.ttc_messages where category in ('scheduled-alise','correspondence-alise') and state in ('approved','sending')",
  );

beforeAll(async () => {
  pg = new PGlite();
  await pg.exec(
    'create role anon; create role authenticated; create role service_role bypassrls;',
  );
  await pg.exec(`create table public.ttc_sim_clock(offset_ms bigint not null);
    insert into public.ttc_sim_clock values (0);
    create function public.ttc_sim_now() returns timestamptz language sql stable set search_path = '' as
    $$ select pg_catalog.now() + make_interval(secs => (select offset_ms from public.ttc_sim_clock) / 1000.0) $$;`);
  // 20 October, 10:00 in Jamaica: the day of the hold.
  await at('2026-10-20T15:00:00Z');
  for (const file of files.filter((f) => f < HOLD_MIGRATION))
    await pg.exec(rewriteClock(readFileSync(join(MIGRATIONS, file), 'utf8')));
  member = (
    await pg.query<{ id: string }>(
      "select id from public.ttc_members where slug='alise'",
    )
  ).rows[0]!.id;
  // LIVE-like state before the hold: a redeemed privilege, a letter she has,
  // an SMS to her approved but not yet sent, one to Arron, a Desk letter
  // scheduled for later today, and the original 20 October milestone armed.
  await pg.exec(`
    insert into public.ttc_privileges(slug,title,kind,opens_at,min_amount_pence,max_amount_pence)
      values ('shopping-test','Shopping','beauty',now() - interval '2 days',100,10000);
    insert into public.ttc_redemptions(member_id,privilege_id,kind,state,amount_pence,idempotency_key,fingerprint,fulfilled_at)
      select m.id,p.id,'beauty','fulfilled',10000,'redeemed-before-hold','{}',now()
      from public.ttc_members m, public.ttc_privileges p where m.slug='alise' and p.slug='shopping-test';
    insert into public.ttc_messages(label,body,category,send_at,timezone,state,approved_at,next_attempt_at)
      values ('Already approved','To Alise','correspondence-alise',now(),'Europe/London','approved',now(),now()),
             ('Owner alert','To Arron','transactional-arron',now(),'Europe/London','approved',now(),now());
    insert into public.ttc_letters(member_id,title,body,deliver_at,state,scheduled_at)
      select id,'Later today','A letter for this afternoon.',now() + interval '2 hours','scheduled',now()
      from public.ttc_members where slug='alise';
    update public.ttc_journey_milestones set state='pending', fire_at='2026-10-20 13:00:00-05' where key='early-membership';`);
  await pg.exec(
    rewriteClock(readFileSync(join(MIGRATIONS, HOLD_MIGRATION), 'utf8')),
  );
  for (const file of files.filter((f) => f > HOLD_MIGRATION))
    await pg.exec(rewriteClock(readFileSync(join(MIGRATIONS, file), 'utf8')));
  // SMS operations LIVE (ADR-022), so the hold is the only thing standing
  // between the outbox and Alise in these tests.
  await pg.exec(
    "update public.ttc_sms_operations set mode = 'live', live_since = '2026-01-01T00:00:00Z'",
  );
  await pg.query(
    "insert into public.ttc_sessions(token_hash,role,member_id,expires_at) values($1,'member',$2,now()+interval '30 days'),($3,'owner',null,now()+interval '30 days')",
    [hashToken(memberToken), member, hashToken(ownerToken)],
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

afterAll(async () => {
  await pg?.close();
});

describe('the hold, from the moment the migration is applied', () => {
  it('preserves existing data and cancels only the unsent SMS to Alise', async () => {
    const redemption = await pg.query<{ state: string; amount: number }>(
      "select state, amount_pence as amount from public.ttc_redemptions where idempotency_key='redeemed-before-hold'",
    );
    expect(redemption.rows).toEqual([{ state: 'fulfilled', amount: 10000 }]);
    const sms = await pg.query<{ category: string; state: string }>(
      "select category, state from public.ttc_messages where label in ('Already approved','Owner alert') order by label",
    );
    expect(sms.rows).toEqual([
      { category: 'correspondence-alise', state: 'cancelled' },
      { category: 'transactional-arron', state: 'approved' },
    ]);
    const hold = await call<{
      active: boolean;
      releaseNotBefore: string;
      waiting: { smsCancelledByHold: number };
    }>('/owner/communications');
    expect(hold.data).toMatchObject({
      active: true,
      releaseNotBefore: '2026-10-21T05:00:00+00:00',
    });
    expect(hold.data.waiting.smsCancelledByHold).toBe(1);
  });

  it('a re-armed 20 October introduction cannot fire while held (the audit’s scenario)', async () => {
    // Codex's reproduction: the milestone re-armed at 20 Oct 13:00 Jamaica,
    // the scheduler and a member read at 18:00:01 UTC.
    await at('2026-10-20T18:00:01Z');
    expect(await runJourneyRound(db)).toEqual({ fired: 0, processed: 0 });
    expect((await call('/journey', undefined, 'member')).status).toBe(200);
    const m = await pg.query<{ state: string }>(
      "select state from public.ttc_journey_milestones where key='early-membership'",
    );
    expect(m.rows).toEqual([{ state: 'pending' }]);
    expect(await published()).toBe(0);
    // The public entrance shows no early opening while held.
    expect(
      (await call<{ opensAt: string | null }>('/entrance')).data.opensAt,
    ).toBeNull();
  });

  it('the schedulers deliver nothing: due letters, milestones and events all wait', async () => {
    await at('2026-10-20T23:00:00Z'); // the Desk letter is now due
    await pg.exec(
      "update public.ttc_journey_milestones set state='pending', fire_at='2026-10-20 12:00:00-05' where key='departure-ugg'",
    );
    await runJourneyRound(db);
    expect((await publishDueLetters(db)).published).toBe(0);
    await publishJourneyEvent(db, {
      type: 'reward.voucher.fulfilled',
      source: 'casino',
      key: 'voucher-fulfilled-during-hold',
      payload: { voucherId: 'v', redemptionId: 'r', title: 'Two cocktails' },
    });
    // Her own reads publish lazily too; they must not here.
    expect((await call('/correspondence', undefined, 'member')).status).toBe(
      200,
    );
    expect((await call('/journey', undefined, 'member')).status).toBe(200);
    expect(await published()).toBe(0);
    expect(
      await count("public.ttc_journey_milestones where state = 'fired'"),
    ).toBe(0);
    expect(
      await count("public.ttc_journey_events where state = 'pending'"),
    ).toBe(1);
    // The every-minute outbox sends Arron's alert and nothing to Alise.
    await processMessages(db, smsEnv, provider);
    await processMessages(db, smsEnv, provider);
    expect(sent).toEqual([smsEnv.ARRON_PHONE]);
    expect(await aliseSmsApproved()).toBe(0);
  });

  it('refuses every owner action that would reach Alise, without changing anything', async () => {
    const refusals = await Promise.all([
      call('/owner/journey/milestones/early-membership/fire', {}),
      call('/owner/journey/rooms/lounge/invite', {}),
      call('/owner/invitations', {}),
      call('/owner/butler-sms', {
        body: 'Good morning, Madam.',
        timezone: 'Europe/London',
        sendAt: null,
        idempotencyKey: 'direct-sms-hold-01',
      }),
    ]);
    for (const r of refusals) expect(r).toMatchObject({ status: 409 });
    for (const r of refusals.slice(0, 3))
      expect(r.data).toMatchObject({ error: 'on-hold' });
    // A Desk letter can be written, but not sent.
    const draft = await call<{ letter: { id: string } }>(
      '/owner/correspondence',
      {
        title: 'Too early',
        salutation: 'Dearest Alise,',
        body: 'Not today.',
        timezone: 'Europe/London',
        deliverAt: null,
      },
    );
    expect(draft.status).toBe(201);
    const send = await call(
      `/owner/correspondence/${draft.data.letter.id}/send-now`,
      {},
    );
    expect(send).toMatchObject({ status: 409, data: { error: 'on-hold' } });
    // A cancelled SMS cannot be retried into the outbox while held.
    const cancelled = await pg.query<{ id: string }>(
      "select id from public.ttc_messages where label='Already approved'",
    );
    const retry = await call(
      `/owner/correspondence/messages/${cancelled.rows[0]!.id}/retry`,
      {},
    );
    expect(retry).toMatchObject({ status: 409, data: { error: 'on-hold' } });
    // Even a direct database write is refused.
    await expect(
      pg.query(
        "update public.ttc_letters set state='published', published_at=now() where title='Too early'",
      ),
    ).rejects.toThrow('on-hold');
    expect(await published()).toBe(0);
    expect(await aliseSmsApproved()).toBe(0);
    expect(
      await count("public.ttc_journey_milestones where state = 'failed'"),
    ).toBe(0);
  });

  it('cannot be released before 21 October, nor without the owner’s confirmation', async () => {
    expect(
      (await call('/owner/communications/release', { confirm: 'yes' })).status,
    ).toBe(400);
    expect(
      (
        await call(
          '/owner/communications/release',
          { confirm: 'RELEASE' },
          'member',
        )
      ).status,
    ).toBe(403);
    const early = await call('/owner/communications/release', {
      confirm: 'RELEASE',
    });
    expect(early).toMatchObject({ status: 403, data: { error: 'not-open' } });
    expect(
      (await call<{ active: boolean }>('/owner/communications')).data.active,
    ).toBe(true);
  });
});

describe('release on 21 October', () => {
  it('releases on the owner’s word and delivers nothing that fell due during the hold', async () => {
    await at('2026-10-21T13:00:00Z'); // 08:00 in Jamaica
    const released = await call<{
      active: boolean;
      released: Record<string, number>;
    }>('/owner/communications/release', {
      confirm: 'RELEASE',
      note: 'First invitation approved by Arron',
    });
    expect(released.status).toBe(200);
    expect(released.data.active).toBe(false);
    expect(released.data.released).toEqual({
      lettersReturnedToDraft: 1,
      milestonesHeld: 2,
      eventsToRetry: 1,
    });
    await runJourneyRound(db);
    await publishDueLetters(db);
    expect(await published()).toBe(0);
    expect(
      (
        await pg.query<{ state: string }>(
          "select state from public.ttc_letters where title='Later today'",
        )
      ).rows[0]!.state,
    ).toBe('draft');
    // A second release is harmless.
    expect(
      (
        await call<{ duplicate: boolean }>('/owner/communications/release', {
          confirm: 'RELEASE',
        })
      ).data.duplicate,
    ).toBe(true);
  });

  it('early admission opens only when the owner arms it; scheduling works again', async () => {
    // The owner arms the 19:00 UK early admission.
    await call(
      '/owner/journey/milestones/early-membership',
      { fireAt: '2026-10-21T18:00:00Z' },
      'owner',
      'PATCH',
    );
    await call('/owner/journey/milestones/early-membership/resume', {});
    await runJourneyRound(db);
    const before = await call<{ opensAt: string; eligible: boolean }>(
      '/entrance',
    );
    expect(before.data).toMatchObject({
      opensAt: '2026-10-21T18:00:00+00:00',
      eligible: false,
    });
    // Her membership cannot be recorded before the doors open.
    expect((await call('/journey/enter', {}, 'member')).status).toBe(403);
    await at('2026-10-21T18:00:01Z');
    const after = await call<{ eligible: boolean }>('/entrance');
    expect(after.data.eligible).toBe(true);
    // Accepted in the Lounge: recorded once, for every device.
    expect((await call('/journey/enter', {}, 'member')).status).toBe(201);
    expect((await call('/journey/enter', {}, 'member')).status).toBe(200);
    // No letter is published by the early admission itself.
    expect(await published()).toBe(0);
    // A letter milestone resumed now is delivered, with its SMS queued.
    await call('/owner/journey/milestones/departure-ugg/fire', {});
    expect(await published()).toBe(1);
    expect(await aliseSmsApproved()).toBe(1);
    // The invitation link that establishes her member session works again.
    expect((await call('/owner/invitations', {})).status).toBe(201);
  });

  it('the owner can hold again at any time; it cancels unsent SMS to Alise', async () => {
    const held = await call<{ active: boolean }>(
      '/owner/communications/hold',
      {},
    );
    expect(held.data.active).toBe(true);
    expect(await aliseSmsApproved()).toBe(0);
    await call('/owner/communications/release', { confirm: 'RELEASE' });
  });
});
