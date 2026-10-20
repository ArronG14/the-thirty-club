// @vitest-environment node
import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { rpcFor } from './database.ts';

let pg: PGlite;
let member: string;
const call = async <T>(
  role: 'owner' | 'member',
  action: string,
  input: object = {},
): Promise<T> => {
  const result = await pg.query<{ result: T }>(
    `select public.${rpcFor(action)}($1,$2,$3,$4::jsonb) result`,
    [role === 'member' ? member : null, role, action, JSON.stringify(input)],
  );
  return result.rows[0]!.result;
};
const owner = <T>(action: string, input: object = {}) =>
  call<T>('owner', action, input);
const memberCall = <T>(action: string, input: object = {}) =>
  call<T>('member', action, input);
const prize = async (
  kind: 'VOUCHER' | 'VAULT_GIFT' = 'VOUCHER',
  vaultId: string | null = null,
) => {
  const result = await owner<{ prize: { id: string } }>(
    'owner-casino-prize-create',
    {
      title: kind === 'VOUCHER' ? 'Two cocktails' : 'Mystery gift',
      description: 'A birthday treat',
      presentation: 'With our compliments.',
      kind,
      imageUrl: null,
      instructions: '',
      validUntil: null,
      active: true,
      ownerNotes: '',
      vaultId,
    },
  );
  return result.prize.id;
};
const issue = (
  quantity: number,
  prizeIds: string[],
  key: string = crypto.randomUUID(),
) =>
  owner<{ batchId: string; duplicate: boolean }>('owner-casino-issue', {
    quantity,
    prizeIds,
    idempotencyKey: key,
  });
const spin = (key: string = crypto.randomUUID()) =>
  memberCall<{
    id: string;
    batchId: string;
    prize: { title: string } | null;
    entitlementId: string | null;
    duplicate: boolean;
  }>('casino-spin', { idempotencyKey: key });

beforeAll(async () => {
  pg = new PGlite();
  await pg.exec(
    'create role anon; create role authenticated; create role service_role bypassrls;',
  );
  for (const filename of readdirSync(resolve('supabase/migrations'))
    .filter((x) => x.endsWith('.sql'))
    .sort())
    await pg.exec(
      readFileSync(resolve('supabase/migrations', filename), 'utf8'),
    );
  // These tests exercise delivery; the communication hold (ADR-021) has
  // its own tests in hold.test.ts.
  await pg.exec(
    "update public.ttc_communication_hold set active = false, released_at = now(), release_note = 'test harness'; update public.ttc_sms_operations set mode = 'live', live_since = '2026-01-01T00:00:00Z'",
  );
  member = (
    await pg.query<{ id: string }>(
      "select id from public.ttc_members where slug='alise'",
    )
  ).rows[0]!.id;
  // The real journey migration (20261022090000) provides
  // ttc_journey_publish and ttc_room_admitted; she is admitted to the
  // Casino before each test unless a test says otherwise.
}, 30000);
beforeEach(async () => {
  await pg.exec(
    'truncate public.ttc_casino_batches,public.ttc_prize_catalogue,public.ttc_voucher_requests,public.ttc_reward_entitlements,public.ttc_casino_spins,public.ttc_casino_allocations,public.ttc_vaults,public.ttc_journey_events,public.ttc_room_admissions,public.ttc_letters cascade;',
  );
  await pg.query(
    `insert into public.ttc_room_admissions(member_id,room_id,state,invited_via,letter_title,letter_body,admitted_at)
     values($1,'casino','admitted','owner','Letter','Words',now())`,
    [member],
  );
});
afterAll(async () => {
  await pg?.close();
});

describe('owner-controlled Casino and rewards', () => {
  it('allocates one prize in three positions, preserving it through reads', async () => {
    const id = await prize();
    const batch = await issue(3, [id], 'batch-one-123');
    const rows = await pg.query<{ position: number }>(
      'select position from public.ttc_casino_allocations where batch_id=$1',
      [batch.batchId],
    );
    expect(rows.rows).toHaveLength(1);
    expect(rows.rows[0]!.position).toBeGreaterThanOrEqual(1);
    expect(rows.rows[0]!.position).toBeLessThanOrEqual(3);
    expect(
      await memberCall<{ available: number; spins: unknown[] }>(
        'casino-status',
      ),
    ).toEqual({ available: 3, spins: [] });
    const plays = await Promise.all([spin(), spin(), spin()]);
    expect(plays.filter((s) => s.prize)).toHaveLength(1);
    expect(new Set(plays.map((s) => s.id)).size).toBe(3);
    expect(
      (await memberCall<{ available: number }>('casino-status')).available,
    ).toBe(0);
    expect(
      (await pg.query('select * from public.ttc_reward_entitlements')).rows,
    ).toHaveLength(1);
    const events = await pg.query<{
      type: string;
      payload: Record<string, unknown>;
    }>(
      "select type,payload from public.ttc_journey_events where source <> 'journey'",
    );
    expect(events.rows.map((e) => e.type)).toContain('casino.spins.issued');
    expect(events.rows.map((e) => e.type)).toContain('reward.voucher.issued');
    expect(
      events.rows.find((e) => e.type === 'reward.voucher.issued')?.payload,
    ).not.toHaveProperty('roomId');
  });
  it('allocates three unique prizes over five spins, and keeps batches independent', async () => {
    const ids = await Promise.all([prize(), prize(), prize()]);
    const one = await issue(5, ids);
    const two = await issue(2, []);
    const positions = await pg.query<{ batch_id: string; position: number }>(
      'select batch_id,position from public.ttc_casino_allocations',
    );
    expect(
      positions.rows.filter((x) => x.batch_id === one.batchId),
    ).toHaveLength(3);
    expect(new Set(positions.rows.map((x) => x.position)).size).toBe(3);
    expect(positions.rows.some((x) => x.batch_id === two.batchId)).toBe(false);
    expect(
      (await memberCall<{ available: number }>('casino-status')).available,
    ).toBe(7);
    const plays = await Promise.all(Array.from({ length: 7 }, () => spin()));
    expect(
      plays.filter((x) => x.batchId === one.batchId && x.prize),
    ).toHaveLength(3);
    expect(
      plays.filter((x) => x.batchId === two.batchId && x.prize === null),
    ).toHaveLength(2);
  });
  it('rejects too many prizes, replays batch keys, and hides future positions from member status', async () => {
    const id = await prize();
    await expect(issue(1, [id, id])).rejects.toThrow('invalid');
    const first = await issue(3, [id], 'batch-idempotent');
    expect((await issue(3, [id], 'batch-idempotent')).batchId).toBe(
      first.batchId,
    );
    await expect(issue(4, [id], 'batch-idempotent')).rejects.toThrow(
      'idempotency-conflict',
    );
    const status = await memberCall<object>('casino-status');
    expect(JSON.stringify(status)).not.toContain('position');
    expect(JSON.stringify(status)).not.toContain('Two cocktails');
  });
  it('serialises retries and awards a voucher once', async () => {
    const id = await prize();
    await issue(1, [id]);
    const key = 'same-spin-key';
    const first = await spin(key);
    const second = await spin(key);
    expect(second).toMatchObject({ id: first.id, duplicate: true });
    expect(
      (await pg.query('select id from public.ttc_casino_spins')).rows,
    ).toHaveLength(1);
    expect(
      (await pg.query('select id from public.ttc_reward_entitlements')).rows,
    ).toHaveLength(1);
    const status = await memberCall<{ spins: { idempotencyKey: string }[] }>(
      'casino-status',
    );
    expect(status.spins[0]!.idempotencyKey).toBe(key);
  });
  it('serialises simultaneous requests with the same key', async () => {
    await issue(2, []);
    const [first, second] = await Promise.all([
      spin('parallel-spin-key'),
      spin('parallel-spin-key'),
    ]);
    expect(first.id).toBe(second.id);
    expect(
      (await memberCall<{ available: number }>('casino-status')).available,
    ).toBe(1);
  });
  it('keeps the issued prize snapshot after the owner edits its catalogue item', async () => {
    const id = await prize();
    await issue(1, [id]);
    await owner('owner-casino-prize-update', {
      id,
      title: 'Three cocktails',
      description: 'A changed catalogue entry',
      presentation: '',
      kind: 'VOUCHER',
      imageUrl: null,
      instructions: '',
      validUntil: null,
      active: false,
      ownerNotes: '',
      vaultId: null,
    });
    const won = await spin();
    expect(won.prize?.title).toBe('Two cocktails');
  });
  it('cancels only an unplayed batch', async () => {
    const batch = await issue(2, []);
    await owner('owner-casino-cancel', { id: batch.batchId });
    expect(
      (await memberCall<{ available: number }>('casino-status')).available,
    ).toBe(0);
    await expect(spin()).rejects.toThrow('not-open');
    await expect(
      owner('owner-casino-cancel', { id: batch.batchId }),
    ).rejects.toThrow('conflict');
  });
  it('requests, cancels, re-requests and fulfils a voucher without implying delivery early', async () => {
    const id = await prize();
    await issue(1, [id]);
    const won = await spin();
    const first = await memberCall<{ requestId: string; duplicate: boolean }>(
      'voucher-request',
      { id: won.entitlementId },
    );
    expect(
      await memberCall<{ requestId: string; duplicate: boolean }>(
        'voucher-request',
        { id: won.entitlementId },
      ),
    ).toMatchObject({ requestId: first.requestId, duplicate: true });
    let wallet = await memberCall<{ entitlements: { state: string }[] }>(
      'voucher-list',
    );
    expect(wallet.entitlements[0]!.state).toBe('REQUESTED');
    await owner('owner-voucher-cancel', { id: first.requestId });
    const again = await memberCall<{ requestId: string }>('voucher-request', {
      id: won.entitlementId,
    });
    expect(again.requestId).not.toBe(first.requestId);
    await owner('owner-voucher-fulfil', { id: again.requestId });
    wallet = await memberCall('voucher-list');
    expect(wallet.entitlements[0]!.state).toBe('FULFILLED');
    await expect(
      memberCall('voucher-request', { id: won.entitlementId }),
    ).rejects.toThrow('already-redeemed');
  });
  it('rejects member owner actions and member access before admission', async () => {
    await expect(memberCall('owner-casino-prizes')).rejects.toThrow(
      'forbidden',
    );
    // Not admitted (the journey's real record): issuing works, play does not.
    await pg.exec('delete from public.ttc_room_admissions');
    await issue(1, []);
    await expect(spin()).rejects.toThrow('not-open');
  });
  it('unlocks only an awarded casino compartment and separates reveal from physical fulfilment', async () => {
    const vault = await pg.query<{
      id: string;
    }>(`insert into public.ttc_vaults(slug,display_number,clue,gift_location,trigger,casino_reward_id,nfc_token,nfc_token_hash,backup_code,backup_code_hash)
      values('vault-101',101,'A secret','A private place','casino','casino.mystery','${'A'.repeat(43)}','hash-a','ABCD-EFGH-IJKL','hash-b') returning id`);
    const vaultId = vault.rows[0]!.id;
    const giftId = await prize('VAULT_GIFT', vaultId);
    expect(
      (
        await pg.query<{ state: string }>(
          'select state from public.ttc_vaults where id=$1',
          [vaultId],
        )
      ).rows[0]!.state,
    ).toBe('locked');
    await expect(issue(2, [giftId, giftId])).rejects.toThrow('conflict');
    await issue(1, [giftId]);
    const won = await spin();
    expect(won.entitlementId).toBeTruthy();
    expect(
      (
        await pg.query<{ state: string }>(
          'select state from public.ttc_vaults where id=$1',
          [vaultId],
        )
      ).rows[0]!.state,
    ).toBe('ready');
    let wallet = await memberCall<{ entitlements: { state: string }[] }>(
      'voucher-list',
    );
    expect(wallet.entitlements[0]!.state).toBe('UNLOCKED');
    await expect(
      owner('owner-casino-gift-fulfil', { id: won.entitlementId }),
    ).rejects.toThrow('conflict');
    await pg.query(
      "update public.ttc_vaults set state='opened',opened_at=now(),opened_via='code' where id=$1",
      [vaultId],
    );
    wallet = await memberCall('voucher-list');
    expect(wallet.entitlements[0]!.state).toBe('REVEALED');
    await owner('owner-casino-gift-fulfil', { id: won.entitlementId });
    wallet = await memberCall('voucher-list');
    expect(wallet.entitlements[0]!.state).toBe('FULFILLED');
  });
});
