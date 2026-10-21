// @vitest-environment node
import { readFileSync, readdirSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { rpcFor } from './database';
import { withJourneyTemplates } from './journey';
import { STORY_COPY } from '../../src/shared/story/copy';

let pg: PGlite;
let member: string;
let casinoOutboxBefore = 0;
let casinoLettersBefore = 0;
async function clock(at: string) {
  await pg.query('update public.ttc_sim_clock set offset_ms=$1', [
    Date.parse(at) - Date.now(),
  ]);
}
async function action<T = Record<string, unknown>>(
  name: string,
  input: Record<string, unknown> = {},
  role = 'owner',
): Promise<T> {
  return (
    await pg.query<{ result: T }>(
      `select public.${rpcFor(name)}($1,$2,$3,$4::jsonb) result`,
      [
        role === 'member' ? member : null,
        role,
        name,
        JSON.stringify(
          name.includes('journey') ? withJourneyTemplates(input) : input,
        ),
      ],
    )
  ).rows[0]!.result;
}
const approve = async (key: string, extra: Record<string, unknown> = {}) => {
  await action('owner-journey-milestone-update', { key, ...extra });
  await action('owner-journey-milestone-update', { key, storyApproved: true });
};
const fire = (key: string) =>
  action<{ milestone: { state: string; lastError: string } }>(
    'owner-journey-milestone-fire',
    { key },
  );
const round = () => action('system-journey-round', {}, 'system');
const scalar = async (sql: string) =>
  (await pg.query<{ n: number }>(sql)).rows[0]!.n;
const count = (table: string) =>
  scalar(`select count(*)::int n from public.${table}`);
const milestone = async (key: string) =>
  (
    await pg.query<{
      state: string;
      story_approved: boolean;
      last_error: string;
    }>(
      'select state,story_approved,last_error from public.ttc_journey_milestones where key=$1',
      [key],
    )
  ).rows[0]!;

beforeAll(async () => {
  pg = new PGlite();
  await pg.exec(`create role anon; create role authenticated; create role service_role bypassrls;
 create table public.ttc_sim_clock(offset_ms bigint); insert into public.ttc_sim_clock values(0);
 create function public.ttc_sim_now() returns timestamptz language sql stable as $$select pg_catalog.now()+make_interval(secs=>(select offset_ms/1000.0 from public.ttc_sim_clock))$$;`);
  for (const file of readdirSync('supabase/migrations').sort())
    await pg.exec(
      readFileSync(`supabase/migrations/${file}`, 'utf8').replace(
        /(?<![\w.])now\(\)/g,
        'public.ttc_sim_now()',
      ),
    );
  member = (
    await pg.query<{ id: string }>(
      "select id from public.ttc_members where slug='alise'",
    )
  ).rows[0]!.id;
  await pg.exec(
    "update public.ttc_communication_hold set active=false,released_at=now(); update public.ttc_sms_operations set mode='live',live_since='2026-01-01';",
  );
  await clock('2026-10-21T18:01:00Z');
}, 60000);
afterAll(async () => {
  await pg?.close();
});

describe('the recipient journey, in chronological server time', () => {
  it('owner SMS rehearsal uses the exact reviewed story text, including SMS-only scenes', async () => {
    const result = await action<{ liveBody: string }>(
      'owner-sms-rehearsal-source',
      { kind: 'milestone', id: 'flight-departure' },
    );
    const record = (
      await pg.query<{ story_sms: string }>(
        "select story_sms from public.ttc_journey_milestones where key='flight-departure'",
      )
    ).rows[0]!;
    expect(result.liveBody).toBe(record.story_sms);
    expect(result.liveBody.length).toBeGreaterThan(100);
    await expect(
      action(
        'owner-sms-rehearsal-source',
        { kind: 'milestone', id: 'flight-departure' },
        'member',
      ),
    ).rejects.toThrow('forbidden');
  });
  it('21 Oct: eligibility and authenticated recognition never substitute for a card action', async () => {
    await action('owner-journey-milestone-resume', { key: 'early-membership' });
    expect(
      (await action('system-journey-entrance', {}, 'system')).eligible,
    ).toBe(true);
    await expect(action('system-journey-card', {}, 'system')).rejects.toThrow(
      'card-required',
    );
    await expect(action('journey-enter', {}, 'member')).rejects.toThrow(
      'card-required',
    );
    expect(await count('ttc_room_admissions')).toBe(0);
    await action(
      'system-journey-card',
      { cardPresentedAt: Date.parse('2026-10-21T18:02:00Z') },
      'system',
    );
    expect((await action('journey-enter', {}, 'member')).duplicate).toBe(false);
    expect((await action('journey-enter', {}, 'member')).duplicate).toBe(true);
  });
  it('22 Oct: morning gifts require a mapped ready compartment, with no early contents', async () => {
    await clock('2026-10-22T07:30:00Z');
    await round();
    expect((await milestone('departure-ugg')).state).toBe('held');
    await expect(
      action('owner-journey-milestone-resume', { key: 'departure-ugg' }),
    ).rejects.toThrow('invalid');
    await approve('departure-ugg');
    expect((await fire('departure-ugg')).milestone.state).toBe('failed');
    const created = await action<{ vault: { id: string } }>(
      'owner-vault-create',
      {
        slug: 'test-ugg',
        displayNumber: 1,
        clue: 'TEST: key beside the pillow',
        giftLocation: STORY_COPY.uggReveal,
        trigger: 'manual',
        availableAt: null,
        casinoRewardId: null,
        nfcToken: 'A'.repeat(43),
        nfcTokenHash: 'test-ugg-key',
        backupCode: 'AAAA-BBBB-CCCC',
        backupCodeHash: 'test-ugg-code',
        opensAt: '2026-10-22T07:00:00Z',
      },
    );
    const id = created.vault.id;
    await action('owner-vault-ready', { id });
    await approve('departure-ugg', { storyVaultId: id });
    expect((await fire('departure-ugg')).milestone.state).toBe('fired');
    expect(
      (
        await pg.query<{ body: string }>(
          "select body from public.ttc_messages where seed_key='story:departure-ugg'",
        )
      ).rows[0]!.body,
    ).toBe(STORY_COPY.ugg);
    expect(
      await scalar(
        "select count(*)::int n from public.ttc_letters where journey_ref like 'milestone:departure-ugg:%'",
      ),
    ).toBe(0);
    const list = await action<{ vaults: { giftLocation: string | null }[] }>(
      'vault-list',
      {},
      'member',
    );
    expect(JSON.stringify(list)).not.toContain('shoe cupboard');
    const opened = await action<{
      vault: { giftLocation: string };
      alreadyOpened: boolean;
    }>('vault-open', { credentialHash: 'test-ugg-key' }, 'member');
    expect(opened.vault.giftLocation).toBe(STORY_COPY.uggReveal);
    expect(
      (await action('vault-open', { credentialHash: 'test-ugg-key' }, 'member'))
        .alreadyOpened,
    ).toBe(true);
  });
  it('22 Oct: departure request is real, durable and queued once; airport precedes gate gift', async () => {
    await approve('departure-privileges', {
      storySms: 'TEST invitation https://30.ag14.co/departure',
    });
    expect((await fire('departure-privileges')).milestone.state).toBe('fired');
    const request = {
      body: 'TEST: Hello Butler. We are on our way.',
      idempotencyKey: 'departure-intro-0001',
      purpose: 'departure-introduction',
      notification: 'A Word with the Butler: {message}',
    };
    await action('service-request', request, 'member');
    expect((await action('service-request', request, 'member')).duplicate).toBe(
      true,
    );
    expect(await count('ttc_departure_introduction')).toBe(1);
    expect(
      await scalar(
        "select count(*)::int n from public.ttc_messages where category='correspondence-arron'",
      ),
    ).toBe(1);
    await approve('airport-drinks', {
      storySms: 'TEST airport mail https://30.ag14.co/lounge',
    });
    expect((await fire('airport-drinks')).milestone.state).toBe('fired');
    const drinks = {
      kind: 'airport',
      beverage: 'TEST: coffee',
      idempotencyKey: 'airport-order-0001',
      notification: 'AIRPORT: {beverage}',
    };
    await action('drinks-request', drinks, 'member');
    expect((await action('drinks-request', drinks, 'member')).duplicate).toBe(
      true,
    );
    expect(
      (
        await action<{ airport: { available: number } }>(
          'drinks-status',
          {},
          'member',
        )
      ).airport.available,
    ).toBe(1);
    await approve('departure-airpods');
    expect((await fire('departure-airpods')).milestone.state).toBe('failed');
    // The gate gift cannot be released until the real NFC compartment is mapped.
    expect((await milestone('departure-airpods')).last_error).toMatch(
      /Map the physical gift/,
    );
  });
  it('22 Oct: flight/arrival are SMS only, held without approved missing arrival copy', async () => {
    await clock('2026-10-22T15:49:59Z');
    await approve('flight-departure');
    // Simulate completion of the physically configured gate gift in this TEST fixture only.
    await pg.exec(
      "update public.ttc_journey_milestones set state='fired',fired_at=now() where key='departure-airpods'",
    );
    await action('owner-journey-milestone-resume', { key: 'flight-departure' });
    expect((await milestone('flight-departure')).state).toBe('pending');
    await clock('2026-10-22T15:50:01Z');
    await round();
    await round();
    expect((await milestone('flight-departure')).state).toBe('fired');
    expect(
      await scalar(
        "select count(*)::int n from public.ttc_messages where seed_key='story:flight-departure'",
      ),
    ).toBe(1);
    expect(
      await scalar(
        "select count(*)::int n from public.ttc_letters where journey_ref like 'milestone:flight-departure:%'",
      ),
    ).toBe(0);
    await clock('2026-10-23T02:30:00Z');
    await round();
    expect((await milestone('jamaica-arrival')).state).toBe('held');
  });
  it('23 Oct: opening invitation follows three issued spins; CLAIM persists and grants once', async () => {
    casinoOutboxBefore = await scalar(
      'select count(*)::int n from public.ttc_messages where public.ttc_alise_category(category)',
    );
    casinoLettersBefore = await count('ttc_letters');
    await clock('2026-10-23T13:59:59Z');
    await approve('casino-opening', {
      storySms: 'TEST Casino invitation https://30.ag14.co/lounge',
    });
    await approve('casino-opening-spins');
    await action('owner-journey-milestone-resume', {
      key: 'casino-opening-spins',
    });
    await action('owner-journey-milestone-resume', { key: 'casino-opening' });
    expect(
      (
        await action<{ admissions: { roomId: string }[] }>(
          'journey-state',
          {},
          'member',
        )
      ).admissions.some((a) => a.roomId === 'casino'),
    ).toBe(false);
    await clock('2026-10-23T14:00:01Z');
    await round();
    expect((await milestone('casino-opening')).state).toBe('fired');
    await action('journey-accept', { roomId: 'casino' }, 'member');
    const spins = [];
    const before = await count('ttc_letters');
    for (let i = 0; i < 3; i++)
      spins.push(
        await action<{ prize: unknown; entitlementId: string }>(
          'casino-spin',
          { idempotencyKey: `morning-spin-000${i}` },
          'member',
        ),
      );
    expect(spins[0]!.prize).toBeNull();
    expect(spins[1]!.prize).toBeNull();
    expect(spins[2]!.prize).toMatchObject({
      drinksKind: 'jamaica',
      drinksQuantity: 3,
    });
    await round();
    expect(await count('ttc_letters')).toBe(before);
    expect(
      (
        await action<{ jamaica: { available: number }; unclaimed: unknown[] }>(
          'drinks-status',
          {},
          'member',
        )
      ).unclaimed,
    ).toHaveLength(1);
    expect(
      (
        await action<{ jamaica: { available: number } }>(
          'drinks-status',
          {},
          'member',
        )
      ).jamaica.available,
    ).toBe(0);
    await action('voucher-claim', { id: spins[2]!.entitlementId }, 'member');
    expect(
      (await action('voucher-claim', { id: spins[2]!.entitlementId }, 'member'))
        .duplicate,
    ).toBe(true);
    expect(
      (
        await action<{ jamaica: { available: number } }>(
          'drinks-status',
          {},
          'member',
        )
      ).jamaica.available,
    ).toBe(3);
  });
  it('23 Oct: Nyla belongs only to the third afternoon spin; missing media prevents the grant', async () => {
    await clock('2026-10-23T19:30:00Z');
    await approve('casino-afternoon-spins', {
      storySms: 'TEST: return to Casino https://30.ag14.co/rooms/casino',
    });
    expect((await fire('casino-afternoon-spins')).milestone.state).toBe(
      'failed',
    );
    expect((await milestone('casino-afternoon-spins')).last_error).toMatch(
      /Nyla media/,
    );
    await pg.exec(
      "update public.ttc_prize_catalogue set active=true,video_url='/api/v1/media/nyla-film' where slug='nyla-film'",
    );
    expect((await fire('casino-afternoon-spins')).milestone.state).toBe(
      'fired',
    );
    const spins = [];
    for (let i = 0; i < 3; i++)
      spins.push(
        await action<{ prize: unknown }>(
          'casino-spin',
          { idempotencyKey: `afternoon-spin-000${i}` },
          'member',
        ),
      );
    expect(spins[0]!.prize).toBeNull();
    expect(spins[1]!.prize).toBeNull();
    expect(spins[2]!.prize).toMatchObject({
      slug: 'nyla-film',
      presentation: STORY_COPY.nyla,
    });
    expect(
      (
        await action(
          'casino-spin',
          { idempotencyKey: 'afternoon-spin-0002' },
          'member',
        )
      ).duplicate,
    ).toBe(true);
    await expect(
      action('casino-spin', { idempotencyKey: 'no-extra-spin-0001' }, 'member'),
    ).rejects.toThrow('not-open');
  });
  it('23 Oct: the evening third spin reveals only a riddle until its distinct NFC opens breakfast', async () => {
    await clock('2026-10-24T01:29:59Z');
    const created = await action<{ vault: { id: string } }>(
      'owner-vault-create',
      {
        displayNumber: 3,
        clue: 'TEST: little things you carry',
        giftLocation:
          'TEST: Birthday Breakfast in Bed — 24 October, 10:30 Jamaica.',
        trigger: 'casino',
        availableAt: null,
        casinoRewardId: 'casino.evening-jackpot',
        nfcToken: 'C'.repeat(43),
        nfcTokenHash: 'breakfast-key',
        backupCode: 'CCCC-DDDD-EEEE',
        backupCodeHash: 'breakfast-code',
        opensAt: '2026-10-24T01:00:00Z',
      },
    );
    await action('owner-casino-prize-create', {
      slug: 'evening-jackpot',
      title: 'TEST breakfast hidden title',
      description: 'TEST breakfast hidden description',
      presentation: 'TEST breakfast hidden presentation',
      kind: 'VAULT_GIFT',
      vaultId: created.vault.id,
      active: true,
      ownerNotes: 'TEST',
      instructions: 'TEST breakfast hidden instructions',
    });
    await approve('casino-evening-spins', {
      storySms: 'TEST evening return https://30.ag14.co/rooms/casino',
    });
    await action('owner-journey-milestone-resume', {
      key: 'casino-evening-spins',
    });
    expect((await milestone('casino-evening-spins')).state).toBe('pending');
    await clock('2026-10-24T01:30:01Z');
    await round();
    await round();
    expect((await milestone('casino-evening-spins')).state).toBe('fired');
    await expect(
      action('vault-open', { credentialHash: 'breakfast-key' }, 'member'),
    ).rejects.toThrow('vault-locked');
    // An old Casino outcome must not release this story compartment.
    await action(
      'system-vault-casino',
      { rewardId: 'casino.vault-key-one' },
      'system',
    );
    await expect(
      action('vault-open', { credentialHash: 'breakfast-key' }, 'member'),
    ).rejects.toThrow('vault-locked');
    const spins = [];
    for (let i = 0; i < 3; i++)
      spins.push(
        await action<{ prize: unknown }>(
          'casino-spin',
          { idempotencyKey: `evening-spin-000${i}` },
          'member',
        ),
      );
    expect(spins[0]!.prize).toBeNull();
    expect(spins[1]!.prize).toBeNull();
    expect(spins[2]!.prize).toMatchObject({
      title: 'A Most Extraordinary Victory!',
      presentation: STORY_COPY.jackpot,
    });
    expect(JSON.stringify(spins[2]!.prize)).not.toMatch(/breakfast/i);
    const before = await action('vault-list', {}, 'member');
    expect(JSON.stringify(before)).not.toMatch(/Breakfast in Bed/);
    await action('vault-open', { credentialHash: 'breakfast-key' }, 'member');
    const after = await action('vault-list', {}, 'member');
    expect(JSON.stringify(after)).toContain('Birthday Breakfast in Bed');
    expect(
      (await action('vault-open', { codeHash: 'breakfast-code' }, 'member'))
        .alreadyOpened,
    ).toBe(true);
  });
  it('all NINE planned spins: three exact batches, outcomes, notifications and retry invariants', async () => {
    const batches = (
      await pg.query<{
        quantity: number;
        state: string;
        key: string;
        fire_at: string;
        slug: string;
        position: number;
      }>(`
      select b.quantity,b.status state,m.key,m.fire_at,a.snapshot->>'slug' slug,a.position
      from public.ttc_casino_batches b
      join public.ttc_journey_milestones m on b.idempotency_key='milestone:'||m.key||':0'
      join public.ttc_casino_allocations a on a.batch_id=b.id
      order by m.fire_at
    `)
    ).rows;
    expect(
      batches.map((b) => ({
        key: b.key,
        quantity: b.quantity,
        slug: b.slug,
        position: b.position,
        state: b.state,
      })),
    ).toEqual([
      {
        key: 'casino-opening-spins',
        quantity: 3,
        slug: 'jamaica-drinks',
        position: 3,
        state: 'completed',
      },
      {
        key: 'casino-afternoon-spins',
        quantity: 3,
        slug: 'nyla-film',
        position: 3,
        state: 'completed',
      },
      {
        key: 'casino-evening-spins',
        quantity: 3,
        slug: 'evening-jackpot',
        position: 3,
        state: 'completed',
      },
    ]);
    expect(batches.map((b) => new Date(b.fire_at).toISOString())).toEqual([
      '2026-10-23T14:00:00.000Z',
      '2026-10-23T19:30:00.000Z',
      '2026-10-24T01:30:00.000Z',
    ]);
    expect(await count('ttc_casino_batches')).toBe(3);
    expect(batches.reduce((n, b) => n + b.quantity, 0)).toBe(9);
    expect(await count('ttc_casino_spins')).toBe(9);
    expect(await count('ttc_reward_entitlements')).toBe(3);
    for (const key of [
      'casino-opening-spins',
      'casino-afternoon-spins',
      'casino-evening-spins',
    ])
      await fire(key);
    await round();
    await round();
    expect(
      (
        await action(
          'casino-spin',
          { idempotencyKey: 'evening-spin-0002' },
          'member',
        )
      ).duplicate,
    ).toBe(true);
    await expect(
      action(
        'casino-spin',
        { idempotencyKey: 'forbidden-tenth-spin' },
        'member',
      ),
    ).rejects.toThrow('not-open');
    const first = await action('voucher-list', {}, 'member');
    expect(await action('voucher-list', {}, 'member')).toEqual(first);
    expect(await count('ttc_casino_spins')).toBe(9);
    expect(await count('ttc_casino_batches')).toBe(3);
    expect(
      (await scalar(
        'select count(*)::int n from public.ttc_messages where public.ttc_alise_category(category)',
      )) - casinoOutboxBefore,
    ).toBe(3);
    expect((await count('ttc_letters')) - casinoLettersBefore).toBe(2);
    const suppressed = (
      await pg.query<{ state: string; last_error: string }>(
        "select state,last_error from public.ttc_messages where body='TEST Casino invitation https://30.ag14.co/lounge'",
      )
    ).rows[0]!;
    expect(suppressed.state).toBe('cancelled');
    expect(suppressed.last_error).toContain(
      'accepted her admission before the invitation was sent',
    );
    for (const body of [
      'TEST Casino invitation https://30.ag14.co/lounge',
      'TEST: return to Casino https://30.ag14.co/rooms/casino',
      'TEST evening return https://30.ag14.co/rooms/casino',
    ]) {
      const rows = (
        await pg.query<{ n: number }>(
          'select count(*)::int n from public.ttc_messages where body=$1',
          [body],
        )
      ).rows;
      expect(rows[0]!.n).toBe(1);
    }
  });
  it('24 Oct: UK midnight reveals nothing; Jamaica midnight leaves a persistent optional invitation', async () => {
    await clock('2026-10-23T23:00:00Z');
    await approve('birthday-screening');
    expect((await fire('birthday-screening')).milestone.state).toBe('failed');
    await action('owner-journey-milestone-hold', { key: 'birthday-screening' });
    await action('owner-journey-milestone-resume', {
      key: 'birthday-screening',
    });
    await round();
    expect(
      await scalar(
        "select count(*)::int n from public.ttc_room_admissions where room_id='screening-room'",
      ),
    ).toBe(0);
    await clock('2026-10-24T05:00:01Z');
    await round();
    await round();
    const state = await action<{
      admissions: { roomId: string; state: string; letter: { body: string } }[];
    }>('journey-state', {}, 'member');
    expect(
      state.admissions.find((a) => a.roomId === 'screening-room'),
    ).toMatchObject({
      state: 'invited',
      letter: { body: STORY_COPY.midnight },
    });
    expect(state.admissions.some((a) => a.roomId === 'gift-vault')).toBe(false);
    expect(
      await scalar(
        "select count(*)::int n from public.ttc_letters where action_room='screening-room'",
      ),
    ).toBe(1);
    await action('journey-state', {}, 'member');
    expect(
      (
        await action<typeof state>('journey-state', {}, 'member')
      ).admissions.find((a) => a.roomId === 'screening-room')!.state,
    ).toBe('invited');
    await action('journey-accept', { roomId: 'screening-room' }, 'member');
    expect(
      (await action('journey-accept', { roomId: 'screening-room' }, 'member'))
        .duplicate,
    ).toBe(true);
  });
  it('24–25 Oct: no scheduled breakfast/card/farewell and no unbooked excursion', async () => {
    await clock('2026-10-25T23:30:00Z');
    await round();
    for (const key of ['birthday-breakfast', 'birthday-card', 'farewell'])
      expect((await milestone(key)).state).toBe('held');
    await expect(
      action('owner-journey-milestone-resume', { key: 'birthday-breakfast' }),
    ).rejects.toThrow('invalid');
    const farewell = (
      await pg.query<{ effects: unknown }>(
        'select effects from public.ttc_journey_milestones where key=$1',
        ['farewell'],
      )
    ).rows[0]!.effects;
    expect(JSON.stringify(farewell)).not.toMatch(
      /excursion|11:30|Seven Mile|Rick/,
    );
    const admitted = await count('ttc_room_admissions');
    await action('journey-state', {}, 'member');
    expect(await count('ttc_room_admissions')).toBe(admitted);
    expect(
      await scalar(
        "select count(*)::int n from public.ttc_messages where state in ('accepted','delivered','sending')",
      ),
    ).toBe(0);
  });
});
