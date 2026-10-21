// @vitest-environment node
/**
 * The birthday journey and the Casino/rewards engine together, through the
 * real `/api/v1` handlers over every real migration in order (PGlite):
 * admissions gate play, the owner's and the milestone's spin batches, spins
 * decided by the server, vouchers from win to fulfilment, Vault gifts, and
 * the Butler's letters each of them earns.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { MemberLetter } from '../../src/shared/concierge/types.ts';
import type {
  AcceptAdmissionResult,
  OwnerJourney,
  OwnerMilestone,
} from '../../src/shared/journey/contract.ts';
import { createBackendApi } from './api.ts';
import { hashToken, newToken } from './auth.ts';
import { BackendError, rpcFor, type Database } from './database.ts';
import { runJourneyRound } from './journey.ts';

const MIGRATIONS = resolve('supabase/migrations');
const rewriteClock = (sql: string) =>
  sql.replace(/(?<![\w.])now\(\)/g, 'public.ttc_sim_now()');

let pg: PGlite;
let db: Database;
let member: string;
const ownerToken = newToken();
const memberToken = newToken();

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

const letters = async () =>
  (
    await call<{ letters: MemberLetter[] }>(
      '/correspondence',
      undefined,
      'member',
    )
  ).data.letters;
const roomState = async (room: string) =>
  (await call<OwnerJourney>('/owner/journey')).data.admissions.find(
    (a) => a.roomId === room,
  )!.state;
const admit = async (room: string) => {
  await call(`/owner/journey/rooms/${room}/invite`, {});
  return call<AcceptAdmissionResult>(
    `/journey/admissions/${room}/accept`,
    {},
    'member',
  );
};
async function prize(kind: 'VOUCHER' | 'VAULT_GIFT', vaultId?: string) {
  const created = await call<{ prize: { id: string } }>(
    '/owner/casino/prizes',
    {
      title: kind === 'VOUCHER' ? 'Two cocktails at sunset' : 'A small box',
      description: 'With the club’s compliments',
      presentation: 'For Alise.',
      kind,
      imageUrl: null,
      instructions: '',
      validUntil: null,
      active: true,
      ownerNotes: '',
      vaultId: vaultId ?? null,
    },
  );
  expect(created.status).toBe(201);
  return created.data.prize.id;
}
const issue = (quantity: number, prizeIds: string[], key: string) =>
  call<{ batchId: string; duplicate: boolean }>('/owner/casino/batches', {
    quantity,
    prizeIds,
    idempotencyKey: key,
  });
const spin = (key: string) =>
  call<{
    id: string;
    prize: { title: string; kind: string } | null;
    entitlementId: string | null;
    duplicate: boolean;
  }>('/casino/spins', { idempotencyKey: key }, 'member');
const available = async () =>
  (await call<{ available: number }>('/casino', undefined, 'member')).data
    .available;
async function casinoVault() {
  const vault = await pg.query<{ id: string }>(
    `insert into public.ttc_vaults(slug,display_number,clue,gift_location,trigger,casino_reward_id,nfc_token,nfc_token_hash,backup_code,backup_code_hash)
     values('vault-101',7,'A clue','The wardrobe','casino','casino.mystery','${'B'.repeat(43)}','hash-x','WXYZ-WXYZ-WXYZ','hash-y') returning id`,
  );
  return vault.rows[0]!.id;
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
  await pg.exec(`truncate public.ttc_casino_promise_floor, public.ttc_voucher_requests, public.ttc_reward_entitlements, public.ttc_casino_spins,
      public.ttc_casino_allocations, public.ttc_casino_batches, public.ttc_prize_catalogue, public.ttc_vaults,
      public.ttc_journey_events, public.ttc_room_admissions, public.ttc_letter_replies, public.ttc_letters,
      public.ttc_sessions, public.ttc_messages, public.ttc_message_delivery_logs, public.ttc_activity_events cascade;
    delete from public.ttc_journey_milestones;
    insert into public.ttc_journey_milestones select * from public.seeded_milestones;
    update public.ttc_communication_hold set active = false, released_at = now();
    -- These are generic reward-engine fixtures; story-release guards have their own chronological suite.
    update public.ttc_journey_milestones set story_managed=false,story_disabled=false,requires_keys='{}',manual_only=false;
    update public.ttc_journey_milestones set state='pending' where key='casino-opening';
    update public.ttc_sms_operations set mode = 'live', live_since = '2026-01-01T00:00:00Z';`);
  await at('2026-10-23T14:30:00Z'); // 09:30 in Jamaica, Casino day
  await pg.query(
    "insert into public.ttc_sessions(token_hash,role,member_id,expires_at) values($1,'member',$2,now()+interval '30 days'),($3,'owner',null,now()+interval '30 days')",
    [hashToken(memberToken), member, hashToken(ownerToken)],
  );
});

afterAll(async () => {
  await pg?.close();
});

describe('the Casino behind its admission', () => {
  it('play needs the admission; issuing does not, and spins wait silently', async () => {
    await at('2026-10-23T13:30:00Z'); // 08:30 in Jamaica: before the opening
    const issued = await issue(3, [], 'owner-batch-early-1');
    expect(issued.status).toBe(201);
    expect((await spin('spin-before-admission')).status).toBe(403);
    // The Casino is still a secret: no letter mentions it.
    expect(await letters()).toEqual([]);
    expect(await roomState('casino')).toBe('locked');
    // Unadmitted: the Butler goes through the Lounge (summons + Letter of
    // Admission), and the owner's spins letter waits for the admission.
    await call('/owner/journey/rooms/casino/invite', {});
    let mail = await letters();
    expect(mail.map((l) => l.action?.label)).toEqual([
      'ENTER THE MEMBERS’ LOUNGE',
    ]);
    await call('/journey/admissions/casino/accept', {}, 'member');
    mail = await letters();
    const back = mail.find((l) => l.action?.kind === 'return')!;
    expect(back.action).toEqual({
      kind: 'return',
      roomId: 'casino',
      label: 'RETURN TO THE GRAND CASINO',
    });
    expect(back.body).toContain('3 additional spins');
    expect(await available()).toBe(3);
  });

  it('admitted: a new batch persists, and the Butler links straight to the Casino', async () => {
    await admit('casino');
    const before = (await letters()).length;
    const first = await issue(5, [], 'owner-batch-afternoon');
    const retry = await issue(5, [], 'owner-batch-afternoon');
    expect(retry.data).toMatchObject({
      batchId: first.data.batchId,
      duplicate: true,
    });
    expect(await available()).toBe(5);
    const mail = await letters();
    expect(mail).toHaveLength(before + 1);
    expect(mail[0]!.action?.label).toBe('RETURN TO THE GRAND CASINO');
    // No second Letter of Admission, no second admission ceremony.
    const journey = await call<{ admissions: { state: string }[] }>(
      '/journey',
      undefined,
      'member',
    );
    expect(journey.data.admissions[0]!.state).toBe('admitted');
  });

  it('the opening milestone issues its configured batch once, through the hook', async () => {
    await admit('casino');
    const key = 'casino-opening-spins';
    await call(
      `/owner/journey/milestones/${key}`,
      {
        effects: [
          {
            type: 'hook',
            name: 'casino.spins.issue',
            params: { quantity: 4, announce: false },
          },
        ],
      },
      'owner',
      'PATCH',
    );
    await call(`/owner/journey/milestones/${key}/fire`, {});
    await call(`/owner/journey/milestones/${key}/fire`, {});
    await runJourneyRound(db);
    expect(await available()).toBe(4);
    expect(
      (await pg.query('select id from public.ttc_casino_batches')).rows,
    ).toHaveLength(1);
  });
});

describe('spins decided by the server', () => {
  it('a retried spin is the same spin and never consumes another', async () => {
    await admit('casino');
    const id = await prize('VOUCHER');
    await issue(2, [id, id], 'two-prizes');
    const first = await spin('spin-key-0001');
    const again = await spin('spin-key-0001');
    expect(again.status).toBe(200);
    expect(again.data).toMatchObject({ id: first.data.id, duplicate: true });
    expect(await available()).toBe(1);
    // The client cannot choose: the prize comes only from the allocation.
    expect(first.data.prize?.title).toBe('Two cocktails at sunset');
    const extra = await call(
      '/casino/spins',
      { idempotencyKey: 'spin-key-0002', prize: 'anything' },
      'member',
    );
    expect(extra.status).toBe(400);
  });
});

describe('vouchers from win to fulfilment', () => {
  it('one entitlement, a request the owner sees, and fulfilment she sees', async () => {
    await admit('casino');
    const id = await prize('VOUCHER');
    await issue(1, [id], 'voucher-batch');
    const won = await spin('voucher-spin-01');
    expect(won.data.entitlementId).toBeTruthy();
    expect(
      (await pg.query('select id from public.ttc_reward_entitlements')).rows,
    ).toHaveLength(1);
    const wallet = await call<{
      entitlements: { id: string; state: string }[];
    }>('/vouchers', undefined, 'member');
    expect(wallet.data.entitlements).toHaveLength(1);
    const request = await call<{ requestId: string }>(
      '/vouchers/request',
      { id: won.data.entitlementId },
      'member',
    );
    expect(request.status).toBe(201);
    const ownerView = await call<{
      requests: { id: string; state: string }[];
    }>('/owner/vouchers');
    expect(
      ownerView.data.requests.find((r) => r.id === request.data.requestId)
        ?.state,
    ).toBe('REQUESTED');
    const events = (await call<OwnerJourney>('/owner/journey')).data.events;
    expect(events.map((e) => e.type)).toContain(
      'reward.voucher.redemption_requested',
    );
    await call(`/owner/vouchers/${request.data.requestId}/fulfil`, {});
    const after = await call<{ entitlements: { state: string }[] }>(
      '/vouchers',
      undefined,
      'member',
    );
    expect(after.data.entitlements[0]!.state).toBe('FULFILLED');
    expect((await letters()).map((l) => l.title)).toContain(
      'Two cocktails at sunset has been arranged',
    );
  });
});

describe('Vault gifts from the Casino', () => {
  it('not yet admitted: the gift is committed, then the Vault is introduced through the Lounge', async () => {
    await admit('casino');
    const vaultId = await casinoVault();
    const gift = await prize('VAULT_GIFT', vaultId);
    await issue(1, [gift], 'gift-batch-1');
    const won = await spin('gift-spin-0001');
    expect(won.data.prize?.kind).toBe('VAULT_GIFT');
    const vault = await pg.query<{ state: string }>(
      'select state from public.ttc_vaults where id=$1',
      [vaultId],
    );
    expect(vault.rows[0]!.state).toBe('ready');
    expect(await roomState('gift-vault')).toBe('invited');
    const summons = (await letters()).filter(
      (l) => l.action?.kind === 'admission' && l.action.roomId === 'gift-vault',
    );
    expect(summons).toHaveLength(1);
    // A retried processing round changes nothing.
    await runJourneyRound(db);
    expect(
      (await letters()).filter((l) => l.action?.roomId === 'gift-vault'),
    ).toHaveLength(1);
    // Accepting admits her once; no extra letter follows.
    await call('/journey/admissions/gift-vault/accept', {}, 'member');
    await runJourneyRound(db);
    expect(
      (await letters()).filter((l) => l.action?.roomId === 'gift-vault'),
    ).toHaveLength(1);
    expect(await roomState('gift-vault')).toBe('admitted');
  });

  it('already admitted: a letter straight to the Gift Vault', async () => {
    await admit('casino');
    await admit('gift-vault');
    const vaultId = await casinoVault();
    const gift = await prize('VAULT_GIFT', vaultId);
    await issue(1, [gift], 'gift-batch-2');
    await spin('gift-spin-0002');
    const direct = (await letters()).find((l) => l.action?.kind === 'return');
    expect(direct?.action).toEqual({
      kind: 'return',
      roomId: 'gift-vault',
      label: 'RETURN TO THE GIFT VAULT',
    });
    expect(direct?.body).toContain('A small box');
  });
});

describe('milestone creation (contract issue A)', () => {
  it('the key is the idempotency key; new milestones start held', async () => {
    const input = {
      key: 'casino-spins-afternoon',
      title: '3 Casino spins',
      description: 'Owner-scheduled Casino spins',
      fireAt: '2026-10-23T20:00:00Z',
      effects: [
        {
          type: 'hook',
          name: 'casino.spins.issue',
          params: { quantity: 3, announce: true },
        },
      ],
    };
    const first = await call<{ milestone: OwnerMilestone }>(
      '/owner/journey/milestones',
      input,
    );
    expect(first.status).toBe(201);
    expect(first.data.milestone.state).toBe('held');
    const again = await call<{ duplicate: boolean }>(
      '/owner/journey/milestones',
      input,
    );
    expect(again).toMatchObject({ status: 200, data: { duplicate: true } });
    const clash = await call('/owner/journey/milestones', {
      ...input,
      title: 'Something else',
    });
    expect(clash.status).toBe(409);
    expect(
      (await call('/owner/journey/milestones', { ...input, key: 'Bad Key' }))
        .status,
    ).toBe(400);
    // Armed, it issues when due.
    await admit('casino');
    await call('/owner/journey/milestones/casino-spins-afternoon/resume', {});
    await at('2026-10-23T20:00:30Z');
    await runJourneyRound(db);
    expect(await available()).toBe(3);
  });
});

describe('the Casino never promises spins that do not exist', () => {
  const letterOfAdmission = async () =>
    (
      await call<{
        admissions: { roomId: string; letter: { body: string } | null }[];
      }>('/journey', undefined, 'member')
    ).data.admissions.find((a) => a.roomId === 'casino')!.letter!.body;

  it('opening with its spins milestone held: the letter promises none, and the Casino shows none', async () => {
    await at('2026-10-23T14:00:30Z'); // 09:00:30 Jamaica
    await runJourneyRound(db);
    expect(await roomState('casino')).toBe('invited');
    expect(await letterOfAdmission()).not.toContain('spins');
    await call('/journey/admissions/casino/accept', {}, 'member');
    expect(await available()).toBe(0);
  });

  it('opening with its spins milestone armed: spins first, then a letter that promises them', async () => {
    await at('2026-10-23T13:00:00Z'); // 08:00 Jamaica: the owner arms it in time
    await call(
      '/owner/journey/milestones/casino-opening-spins',
      {
        effects: [
          {
            type: 'hook',
            name: 'casino.spins.issue',
            params: { quantity: 4, announce: false },
          },
        ],
      },
      'owner',
      'PATCH',
    );
    await call('/owner/journey/milestones/casino-opening-spins/resume', {});
    await at('2026-10-23T14:00:30Z');
    await runJourneyRound(db);
    expect(await letterOfAdmission()).toContain('three complimentary spins');
    await call('/journey/admissions/casino/accept', {}, 'member');
    expect(await available()).toBe(4);
  });

  it('cancelling a batch before its announcement is delivered withdraws the announcement', async () => {
    await at('2026-10-23T13:30:00Z'); // before the opening
    const batch = await issue(3, [], 'cancel-me-batch-1');
    const cancelled = await call<{ announcementDelivered: boolean }>(
      `/owner/casino/batches/${batch.data.batchId}/cancel`,
      {},
    );
    expect(cancelled.data.announcementDelivered).toBe(false);
    await admit('casino');
    await runJourneyRound(db);
    expect(
      (await letters()).filter((l) => l.action?.kind === 'return'),
    ).toEqual([]);
  });
});

/**
 * Codex P1 (`f7eff13`, "Casino cancellation after admission"): one batch
 * issued with announce:false, the 23 Oct opening run, the stored Letter of
 * Admission verified to promise spins, then the untouched batch cancelled.
 * Before the fix: announcementDelivered:false, available 0, and the letter
 * still promised spins.
 */
describe('cancelling spins never leaves a letter promising them (Codex P1)', () => {
  const letterOfAdmission = async () =>
    (
      await call<{
        admissions: { roomId: string; letter: { body: string } | null }[];
      }>('/journey', undefined, 'member')
    ).data.admissions.find((a) => a.roomId === 'casino')?.letter?.body ?? '';
  const cancel = (id: string) =>
    call<{
      error?: string;
      status?: string;
      duplicate?: boolean;
      announcementDelivered?: boolean;
    }>(`/owner/casino/batches/${id}/cancel`, {});
  const openCasino = async () => {
    await at('2026-10-23T14:00:30Z'); // 09:00:30 Jamaica
    await runJourneyRound(db);
  };
  const issueQuiet = (quantity: number, key: string) =>
    call<{ batchId: string }>('/owner/casino/batches', {
      quantity,
      prizeIds: [],
      idempotencyKey: key,
      announce: false,
    });

  it('the exact reproduction: the promised batch cannot be cancelled', async () => {
    await at('2026-10-23T13:30:00Z');
    const batch = await issueQuiet(3, 'codex-repro-batch');
    await openCasino();
    expect(await letterOfAdmission()).toContain('three complimentary spins');
    const cancelled = await cancel(batch.data.batchId);
    expect(cancelled.status).toBe(409);
    expect(cancelled.data.error).toBe('spins-promised');
    // The promise and the spins still agree.
    expect(await letterOfAdmission()).toContain('complimentary spins');
    await call('/journey/admissions/casino/accept', {}, 'member');
    expect(await available()).toBe(3);
  });

  it('a replacement batch issued first lets the wrong one be cancelled', async () => {
    await at('2026-10-23T13:30:00Z');
    const wrong = await issueQuiet(3, 'wrong-prizes-batch');
    await openCasino();
    const replacement = await issueQuiet(3, 'replacement-batch');
    expect(replacement.status).toBe(201);
    const cancelled = await cancel(wrong.data.batchId);
    expect(cancelled.status).toBe(200);
    expect(cancelled.data.status).toBe('cancelled');
    // The other batch now refuses: it is the last one keeping the promise.
    expect((await cancel(replacement.data.batchId)).status).toBe(409);
    await call('/journey/admissions/casino/accept', {}, 'member');
    expect(await available()).toBe(3);
  });

  it('a letter that promised nothing allows cancellation; a retry is the same result', async () => {
    await openCasino(); // spins milestone held: letter without spins
    expect(await letterOfAdmission()).not.toContain('spins');
    const batch = await issueQuiet(2, 'unpromised-batch');
    const first = await cancel(batch.data.batchId);
    expect(first.status).toBe(200);
    const again = await cancel(batch.data.batchId);
    expect(again.status).toBe(200);
    expect(again.data).toMatchObject({ status: 'cancelled', duplicate: true });
    await call('/journey/admissions/casino/accept', {}, 'member');
    expect(await available()).toBe(0);
  });

  it('a delivered spins announcement is a promise too; it is never rewritten', async () => {
    await admit('casino');
    const batch = await issue(3, [], 'announced-batch-1'); // announced
    await runJourneyRound(db);
    const announced = (await letters()).filter((l) =>
      l.title.includes('spins'),
    );
    expect(announced).toHaveLength(1);
    const refused = await cancel(batch.data.batchId);
    expect(refused.status).toBe(409);
    expect(refused.data.error).toBe('spins-promised');
    const after = (await letters()).filter((l) => l.title.includes('spins'));
    expect(after.map((l) => l.body)).toEqual(announced.map((l) => l.body));
    expect(await available()).toBe(3);
  });

  it('a partially played batch cannot be cancelled, and play continues', async () => {
    await admit('casino');
    const batch = await issueQuiet(3, 'partly-played-batch');
    expect((await spin('partly-played-spin-1')).status).toBe(201);
    expect((await cancel(batch.data.batchId)).status).toBe(409);
    expect(await available()).toBe(2);
  });

  it('cancelling before the opening invites without promising spins', async () => {
    await at('2026-10-23T13:30:00Z');
    const batch = await issueQuiet(3, 'early-cancel-batch');
    expect((await cancel(batch.data.batchId)).status).toBe(200);
    await openCasino();
    expect(await letterOfAdmission()).not.toContain('spins');
  });
});

/**
 * Codex counterexample on 282c4ea: a delivered promise of three spins, a
 * quiet one-spin "replacement", then the three-spin batch cancelled — the
 * promise became one spin. A promise is a quantity (ADR-023 amended).
 */
describe('a promised quantity of spins is protected (Codex, 282c4ea)', () => {
  const cancel = (id: string) =>
    call<{ error?: string; status?: string }>(
      `/owner/casino/batches/${id}/cancel`,
      {},
    );
  const quiet = (quantity: number, key: string) =>
    call<{ batchId: string }>('/owner/casino/batches', {
      quantity,
      prizeIds: [],
      idempotencyKey: key,
      announce: false,
    });
  const openWithPromise = async (quantity: number, key: string) => {
    await at('2026-10-23T13:30:00Z');
    const batch = await quiet(quantity, key);
    await at('2026-10-23T14:00:30Z');
    await runJourneyRound(db);
    await call('/journey/admissions/casino/accept', {}, 'member');
    return batch.data.batchId;
  };

  it('the exact counterexample: three promised, one quietly added, the three cannot be cancelled', async () => {
    const three = await openWithPromise(3, 'promised-three-batch');
    expect((await quiet(1, 'quiet-one-replacement')).status).toBe(201);
    const refused = await cancel(three);
    expect(refused.status).toBe(409);
    expect(refused.data.error).toBe('spins-promised');
    expect(await available()).toBe(4);
  });

  it('a partial replacement is refused; a full one is accepted, and then protected itself', async () => {
    const three = await openWithPromise(3, 'promised-three-batch-b');
    await quiet(2, 'partial-replacement-two');
    expect((await cancel(three)).status).toBe(409);
    const full = await quiet(3, 'full-replacement-three');
    // 2 + 3 left after cancelling the original: at least the three promised.
    expect((await cancel(three)).status).toBe(200);
    expect(await available()).toBe(5);
    // Now the two can go (three remain) but then the three cannot.
    const two = (
      await pg.query<{ id: string }>(
        'select id from public.ttc_casino_batches where quantity = 2 and status = $1',
        ['active'],
      )
    ).rows[0]!.id;
    expect((await cancel(two)).status).toBe(200);
    expect((await cancel(full.data.batchId)).status).toBe(409);
    expect(await available()).toBe(3);
  });

  it('spins already played count towards the promise; the remaining balance is protected', async () => {
    await openWithPromise(3, 'promised-three-batch-c');
    expect((await spin('promised-spin-played-1')).status).toBe(201);
    const extra = await quiet(2, 'extra-after-play');
    // Played 1 + remaining 2 still meets the three promised without the extra.
    expect((await cancel(extra.data.batchId)).status).toBe(200);
    expect(await available()).toBe(2);
  });

  it('two cancellations that are each fine alone cannot both succeed', async () => {
    const three = await openWithPromise(3, 'promised-three-batch-d');
    const other = await quiet(3, 'second-three-batch');
    // The member row lock serialises them: the second sees the first.
    const [a, b] = await Promise.all([
      cancel(three),
      cancel(other.data.batchId),
    ]);
    expect([a.status, b.status].sort()).toEqual([200, 409]);
    expect(await available()).toBe(3);
  });
});
