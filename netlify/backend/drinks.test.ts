// @vitest-environment node
/**
 * The holiday journey, completed (ADR-024), through the real `/api/v1`
 * handlers over every real migration (PGlite), with a fake provider that
 * records whatever would have reached Twilio:
 *
 * - two separate drinks balances (airport ×2, Jamaica ×3), each request
 *   deducting one and sending the owner an SMS naming the type and her drink;
 * - the Casino's third spin carrying the Jamaica drinks, credited only on her
 *   explicit CLAIM, which survives everything until she makes it;
 * - "A Word with the Butler" naming itself in the owner's SMS;
 * - REHEARSAL mode routing the owner's notifications to the test number only;
 * - Gift Vault compartments that open before the birthday;
 * - a film prize delivered (nothing for the owner to fulfil).
 */
import { readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createBackendApi } from './api.ts';
import { hashToken, newToken } from './auth.ts';
import { BackendError, rpcFor, type Database } from './database.ts';
import { processMessages, OWNER_REHEARSAL_BANNER } from './sms.ts';

const MIGRATIONS = resolve('supabase/migrations');
const rewriteClock = (sql: string) =>
  sql.replace(/(?<![\w.])now\(\)/g, 'public.ttc_sim_now()');

const ENV = {
  SMS_SENDING_ENABLED: 'true',
  TWILIO_ACCOUNT_SID: 'ACtest',
  TWILIO_AUTH_TOKEN: 'test-auth',
  TWILIO_MESSAGING_SERVICE_SID: 'MGtest',
  CONCIERGE_SITE_URL: 'https://30.ag14.co',
  ALISE_PHONE: '+447700900001',
  ARRON_PHONE: '+447700900002',
  SMS_REHEARSAL_TO: '+447700900003',
};

let pg: PGlite;
let db: Database;
let member: string;
const ownerToken = newToken();
const memberToken = newToken();
let provider: { to: string; body: string }[] = [];
const fakeTwilio = (async (url: unknown, init?: RequestInit) => {
  if (!String(url).includes('api.twilio.com'))
    return new Response(JSON.stringify({ ok: true }));
  const params = init?.body as URLSearchParams;
  provider.push({ to: params.get('To') ?? '', body: params.get('Body') ?? '' });
  return new Response(
    JSON.stringify({
      sid: `SM${String(provider.length).padStart(32, '0')}`,
      status: 'accepted',
    }),
    { status: 201, headers: { 'content-type': 'application/json' } },
  );
}) as typeof fetch;

async function at(iso: string) {
  await pg.query('update public.ttc_sim_clock set offset_ms = $1', [
    Date.parse(iso) - Date.now(),
  ]);
}
async function setMode(mode: 'off' | 'rehearsal' | 'live') {
  await pg.query(
    'update public.ttc_sms_operations set mode = $1, live_since = $2',
    [mode, mode === 'live' ? '2026-01-01T00:00:00Z' : null],
  );
}

async function call<T = Record<string, unknown>>(
  path: string,
  body?: unknown,
  role: 'owner' | 'member' = 'owner',
  env: Record<string, string> = ENV,
): Promise<{ status: number; data: T }> {
  const response = await createBackendApi({ db, env, send: fakeTwilio })(
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
    `ip-${Math.random()}`,
  );
  return { status: response.status, data: (await response.json()) as T };
}

interface Balance {
  granted: number;
  used: number;
  available: number;
}
interface DrinksStatus {
  airport: Balance;
  jamaica: Balance;
  requests: { id: string; kind: string; beverage: string; notice: string }[];
  unclaimed: { id: string; kind: string; quantity: number; title: string }[];
}
const drinks = async () =>
  (await call<DrinksStatus>('/drinks', undefined, 'member')).data;
const request = (kind: string, beverage: string, key: string) =>
  call<{
    duplicate: boolean;
    balance: Balance;
    request: { beverage: string; notice: string };
    error?: string;
  }>('/drinks/requests', { kind, beverage, idempotencyKey: key }, 'member');
const fire = (key: string) => call(`/owner/journey/milestones/${key}/fire`, {});
const spin = (key: string) =>
  call<{
    position: number;
    prize: { title: string; drinksKind?: string; videoUrl?: string } | null;
    entitlementId: string | null;
  }>('/casino/spins', { idempotencyKey: key }, 'member');
const admitCasino = async () => {
  await call('/owner/journey/rooms/casino/invite', {});
  await call('/journey/admissions/casino/accept', {}, 'member');
};

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
  provider = [];
  await pg.exec(`truncate public.ttc_drink_requests, public.ttc_drink_grants, public.ttc_casino_promise_floor,
      public.ttc_voucher_requests, public.ttc_reward_entitlements, public.ttc_casino_spins,
      public.ttc_casino_allocations, public.ttc_casino_batches, public.ttc_prize_catalogue, public.ttc_vaults,
      public.ttc_journey_events, public.ttc_room_admissions, public.ttc_letter_replies, public.ttc_letters,
      public.ttc_sessions, public.ttc_messages, public.ttc_message_delivery_logs, public.ttc_activity_events cascade;
    insert into public.ttc_prize_catalogue select * from public.seeded_prizes;
    delete from public.ttc_journey_milestones;
    insert into public.ttc_journey_milestones select * from public.seeded_milestones;
    update public.ttc_communication_hold set active = false, released_at = now();`);
  await setMode('live');
  await at('2026-10-22T12:45:00Z'); // 13:45 UK, through security
  await pg.query(
    "insert into public.ttc_sessions(token_hash,role,member_id,expires_at) values($1,'member',$2,now()+interval '30 days'),($3,'owner',null,now()+interval '30 days')",
    [hashToken(memberToken), member, hashToken(ownerToken)],
  );
});

afterAll(async () => {
  await pg?.close();
});

describe('the airport drinks (two; her husband pays)', () => {
  it('are granted by the after-security milestone, once', async () => {
    expect((await drinks()).airport.available).toBe(0);
    await fire('airport-drinks');
    await fire('airport-drinks');
    const status = await drinks();
    expect(status.airport).toEqual({ granted: 2, used: 0, available: 2 });
    expect(status.jamaica.available).toBe(0);
  });

  it('each request deducts one and texts the owner her exact drink at once', async () => {
    await fire('airport-drinks');
    provider = [];
    const first = await request(
      'airport',
      'A glass of Ruinart',
      'airport-req-1',
    );
    expect(first.status).toBe(201);
    expect(first.data.balance.available).toBe(1);
    expect(provider).toHaveLength(1);
    expect(provider[0]!.to).toBe(ENV.ARRON_PHONE);
    expect(provider[0]!.body).toContain('AIRPORT DRINK');
    expect(provider[0]!.body).toContain('A glass of Ruinart');
    expect(provider[0]!.body).toContain('1 of 2');
    expect((await drinks()).requests[0]!.notice).toBe('sent');
  });

  it('a retried submission is the same request: one deduction, one SMS', async () => {
    await fire('airport-drinks');
    provider = [];
    await request('airport', 'Espresso martini', 'airport-retry-1');
    const again = await request(
      'airport',
      'Espresso martini',
      'airport-retry-1',
    );
    expect(again.status).toBe(200);
    expect(again.data.duplicate).toBe(true);
    expect((await drinks()).airport.available).toBe(1);
    expect(provider).toHaveLength(1);
  });

  it('a third request is refused; the Jamaica balance is separate', async () => {
    await fire('airport-drinks');
    await request('airport', 'One', 'airport-a-1');
    await request('airport', 'Two', 'airport-a-2');
    const third = await request('airport', 'Three', 'airport-a-3');
    expect(third.status).toBe(409);
    expect(third.data.error).toBe('insufficient-balance');
    const jamaica = await request('jamaica', 'Rum punch', 'jamaica-a-1');
    expect(jamaica.status).toBe(409);
    const status = await drinks();
    expect(status.airport).toEqual({ granted: 2, used: 2, available: 0 });
    expect(status.requests).toHaveLength(2);
  });

  it('the owner can restore a voucher of either kind; there is no fulfilment step', async () => {
    await fire('airport-drinks');
    await request('airport', 'One', 'airport-b-1');
    await request('airport', 'Two', 'airport-b-2');
    const restored = await call<{ balance: Balance }>('/owner/drinks/grants', {
      kind: 'airport',
      quantity: 1,
      note: 'The bar was closed',
      idempotencyKey: 'restore-airport-1',
    });
    expect(restored.status).toBe(201);
    expect(restored.data.balance.available).toBe(1);
    const repeat = await call('/owner/drinks/grants', {
      kind: 'airport',
      quantity: 1,
      note: 'The bar was closed',
      idempotencyKey: 'restore-airport-1',
    });
    expect(repeat.status).toBe(200);
    const owner = await call<{
      requests: { message: { status: string; body: string } }[];
      grants: unknown[];
    }>('/owner/drinks');
    expect(owner.data.requests).toHaveLength(2);
    expect(owner.data.requests[0]!.message.status).toBe('sent');
    expect(owner.data.grants).toHaveLength(2);
    // Members cannot grant; owners cannot request.
    expect(
      (
        await call(
          '/owner/drinks/grants',
          { kind: 'airport', quantity: 1, idempotencyKey: 'member-try-1' },
          'member',
        )
      ).status,
    ).toBe(403);
    expect(
      (
        await call('/drinks/requests', {
          kind: 'airport',
          beverage: 'x',
          idempotencyKey: 'owner-try-1',
        })
      ).status,
    ).toBe(403);
  });

  it('with SMS OFF the request is kept and its SMS waits (never discarded)', async () => {
    await fire('airport-drinks');
    await setMode('off');
    provider = [];
    const sent = await request('airport', 'Still water', 'airport-off-1');
    expect(sent.status).toBe(201);
    expect(provider).toHaveLength(0);
    const owner = await call<{ requests: { message: { status: string } }[] }>(
      '/owner/drinks',
    );
    expect(owner.data.requests[0]!.message.status).toBe('paused');
    await setMode('live');
    await processMessages(db, ENV, fakeTwilio, 'owner');
    expect(provider).toHaveLength(1);
    expect(provider[0]!.body).toContain('Still water');
  });
});

describe('REHEARSAL: the owner’s notifications go to the test number only', () => {
  it('a drink request and a Butler request reach SMS_REHEARSAL_TO with the banner, never Alise', async () => {
    await fire('airport-drinks');
    await setMode('rehearsal');
    provider = [];
    await request('airport', 'Gin and tonic', 'rehearse-drink-1');
    await call(
      '/service/requests',
      {
        body: 'Could we have a quieter table?',
        idempotencyKey: 'rehearse-word-1',
      },
      'member',
    );
    await processMessages(db, ENV, fakeTwilio);
    expect(provider).toHaveLength(2);
    for (const sms of provider) {
      expect(sms.to).toBe(ENV.SMS_REHEARSAL_TO);
      expect(sms.body.startsWith(OWNER_REHEARSAL_BANNER)).toBe(true);
    }
    expect(provider[0]!.body).toContain('Gin and tonic');
    expect(provider[1]!.body).toContain('A WORD WITH THE BUTLER');
    expect(provider[1]!.body).toContain('Could we have a quieter table?');
    expect(provider.some((p) => p.to === ENV.ALISE_PHONE)).toBe(false);
  });

  it('without a configured test number nothing is sent and the request stays queued', async () => {
    await fire('airport-drinks');
    await setMode('rehearsal');
    provider = [];
    const env = { ...ENV, SMS_REHEARSAL_TO: '' };
    await call(
      '/drinks/requests',
      { kind: 'airport', beverage: 'Water', idempotencyKey: 'rehearse-none-1' },
      'member',
      env,
    );
    expect(provider).toHaveLength(0);
    const owner = await call<{ requests: { message: { state: string } }[] }>(
      '/owner/drinks',
    );
    expect(owner.data.requests[0]!.message.state).toBe('approved');
  });
});

describe('A Word with the Butler (LIVE)', () => {
  it('names the request type and carries her words, sent at once', async () => {
    provider = [];
    const sent = await call(
      '/service/requests',
      {
        body: 'Please book the spa for four o’clock.',
        idempotencyKey: 'word-live-1',
      },
      'member',
    );
    expect(sent.status).toBe(201);
    expect(provider).toHaveLength(1);
    expect(provider[0]!.to).toBe(ENV.ARRON_PHONE);
    expect(provider[0]!.body).toContain('A WORD WITH THE BUTLER');
    expect(provider[0]!.body).toContain(
      'Please book the spa for four o’clock.',
    );
  });
});

describe('the Casino: Bring Me a Drink on the third spin, claimed by her', () => {
  it('the opening batch places the prize on the third spin; nothing is credited before CLAIM', async () => {
    await at('2026-10-23T14:00:00Z');
    await call('/owner/journey/milestones/casino-opening-spins/resume', {});
    await fire('casino-opening-spins');
    await admitCasino();
    const one = await spin('spin-key-0001');
    const two = await spin('spin-key-0002');
    expect(one.data.prize).toBeNull();
    expect(two.data.prize).toBeNull();
    const three = await spin('spin-key-0003');
    expect(three.data.position).toBe(3);
    expect(three.data.prize?.drinksKind).toBe('jamaica');
    let status = await drinks();
    expect(status.jamaica.available).toBe(0);
    expect(status.unclaimed).toHaveLength(1);
    expect(status.unclaimed[0]!.quantity).toBe(3);
    // A browser closed before claiming: the prize is still waiting.
    status = await drinks();
    expect(status.unclaimed).toHaveLength(1);
    // The ordinary voucher request does not apply to it.
    expect(
      (
        await call(
          '/vouchers/request',
          { id: three.data.entitlementId },
          'member',
        )
      ).status,
    ).toBe(400);
    const claim = await call<{ state: string; balance: Balance }>(
      '/vouchers/claim',
      { id: three.data.entitlementId },
      'member',
    );
    expect(claim.status).toBe(200);
    expect(claim.data.balance.available).toBe(3);
    const again = await call<{ duplicate: boolean }>(
      '/vouchers/claim',
      { id: three.data.entitlementId },
      'member',
    );
    expect(again.data.duplicate).toBe(true);
    status = await drinks();
    expect(status.jamaica).toEqual({ granted: 3, used: 0, available: 3 });
    expect(status.unclaimed).toHaveLength(0);
    expect(status.airport.available).toBe(0);
    provider = [];
    const drink = await request(
      'jamaica',
      'A rum punch by the pool',
      'jamaica-c-1',
    );
    expect(drink.status).toBe(201);
    expect(provider[0]!.body).toContain('BRING ME A DRINK');
    expect(provider[0]!.body).toContain('A rum punch by the pool');
    expect(provider[0]!.body).toContain('2 of 3');
  });

  it('a missing slug fails the milestone visibly instead of issuing spins without the prize', async () => {
    await at('2026-10-23T19:30:00Z');
    await fire('casino-evening-spins');
    const state = await pg.query<{ state: string }>(
      "select state from public.ttc_journey_milestones where key = 'casino-evening-spins'",
    );
    expect(state.rows[0]!.state).toBe('failed');
    expect(
      (await pg.query('select id from public.ttc_casino_batches')).rows,
    ).toHaveLength(0);
  });

  it('a film prize is delivered when won: nothing for the owner to fulfil', async () => {
    await pg.exec(
      "update public.ttc_prize_catalogue set active = true, video_url = '/media/nyla.mp4' where slug = 'nyla-film'",
    );
    await at('2026-10-23T19:30:00Z');
    await fire('casino-afternoon-spins');
    await admitCasino();
    await spin('film-key-0001');
    await spin('film-key-0002');
    const film = await spin('film-key-0003');
    expect(film.data.prize?.videoUrl).toBe('/media/nyla.mp4');
    const state = await pg.query<{ state: string }>(
      'select state from public.ttc_reward_entitlements where id = $1',
      [film.data.entitlementId],
    );
    expect(state.rows[0]!.state).toBe('FULFILLED');
  });

  it('explicit positions are validated', async () => {
    const prize = (
      await pg.query<{ id: string }>(
        "select id from public.ttc_prize_catalogue where slug='jamaica-drinks'",
      )
    ).rows[0]!.id;
    const bad = await call('/owner/casino/batches', {
      quantity: 3,
      prizeIds: [prize],
      prizePositions: [4],
      idempotencyKey: 'bad-positions-1',
    });
    expect(bad.status).toBe(400);
    const good = await call('/owner/casino/batches', {
      quantity: 3,
      prizeIds: [prize],
      prizePositions: [3],
      idempotencyKey: 'good-positions-1',
    });
    expect(good.status).toBe(201);
  });
});

describe('the Gift Vault before the birthday', () => {
  async function compartment(number: number, opensAt: string | null) {
    const token = String(number).repeat(43).slice(0, 43);
    const code = `AAAA-BBBB-${String(number).padStart(4, '0')}`;
    await pg.query(
      `insert into public.ttc_vaults(slug,display_number,clue,gift_location,trigger,nfc_token,nfc_token_hash,backup_code,backup_code_hash,state,ready_at,opens_at)
       values($1,$2,'In the cupboard','The cupboard by the door','manual',$3,$4,$5,$6,'ready',now(),$7)`,
      [
        `vault-00${number}`,
        number,
        token,
        hashToken(token),
        code,
        hashToken(code),
        opensAt,
      ],
    );
    return token;
  }

  it('a compartment with its own date opens on the 22nd; the others keep the birthday lock', async () => {
    await at('2026-10-22T08:30:00Z');
    const uggs = await compartment(1, '2026-10-22T08:00:00Z');
    const birthday = await compartment(2, null);
    const opened = await call<{
      vault: { state: string; giftLocation: string };
    }>('/vaults/open', { credential: uggs }, 'member');
    expect(opened.status).toBe(200);
    expect(opened.data.vault.state).toBe('opened');
    expect(opened.data.vault.giftLocation).toBe('The cupboard by the door');
    const refused = await call<{ error: string }>(
      '/vaults/open',
      { credential: birthday },
      'member',
    );
    expect(refused.status).toBe(403);
    const list = await call<{
      open: boolean;
      early: boolean;
      vaults: { number: number; state: string; giftLocation: string | null }[];
    }>('/vaults', undefined, 'member');
    expect(list.data.open).toBe(false);
    expect(list.data.early).toBe(true);
    expect(list.data.vaults.find((x) => x.number === 1)!.state).toBe('opened');
    expect(list.data.vaults.find((x) => x.number === 2)!.state).toBe('locked');
    expect(
      list.data.vaults.find((x) => x.number === 2)!.giftLocation,
    ).toBeNull();
  });

  it('its own date is still a lock: not before it', async () => {
    await at('2026-10-22T07:59:00Z');
    const uggs = await compartment(3, '2026-10-22T08:00:00Z');
    expect(
      (await call('/vaults/open', { credential: uggs }, 'member')).status,
    ).toBe(403);
  });
});
