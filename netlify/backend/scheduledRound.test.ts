// @vitest-environment node
import { beforeEach, describe, expect, it } from 'vitest';
import { signSession } from '../concierge/auth.ts';
import { createConciergeApi } from '../concierge/api.ts';
import { readConfig } from '../concierge/config.ts';
import type { ServiceDeps } from '../concierge/service.ts';
import { shoppingKey } from '../concierge/shopping.ts';
import { memoryStore, type MemoryStore } from '../concierge/store.ts';
import {
  fakeChannels,
  TEST_ENV,
  type FakeChannels,
} from '../concierge/testing.ts';
import { scheduledRound } from './scheduledRound.ts';

/** Thursday 22 October, 14:05 UK: the legacy Departure message is due. */
let now = Date.parse('2026-10-22T13:05:00Z');
let store: MemoryStore;
let channels: FakeChannels;
let legacy: ServiceDeps;

beforeEach(() => {
  now = Date.parse('2026-10-22T13:05:00Z');
  store = memoryStore();
  channels = fakeChannels(() => now);
  legacy = { store, config: readConfig(TEST_ENV), channels, clock: () => now };
});

async function redeemWithFailedNotification(realm: 'live' | 'rehearsal') {
  const handle = createConciergeApi(legacy);
  const session = await signSession(
    {
      v: 1,
      realm,
      scopes: ['departure'],
      iat: now,
      ...(realm === 'rehearsal' ? { offsetMs: 0 } : {}),
    },
    TEST_ENV.CONCIERGE_SESSION_SECRET,
  );
  channels.failNext('arron', 1);
  const response = await handle(
    new Request('https://club.example/api/concierge/redeem', {
      method: 'POST',
      headers: {
        authorization: `Bearer ${session}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        privilegeId: 'duty-free',
        idempotencyKey: `key-${realm}-000001`,
      }),
    }),
    '203.0.113.7',
  );
  return (await response.json()) as { redemption: { delivery: string } };
}

const outbox = async () => ({ processed: 0 });

describe('the every-minute round with PostgreSQL as the scheduler', () => {
  it('still retries a failed legacy notification to Arron after the backoff', async () => {
    const first = await redeemWithFailedNotification('live');
    expect(first.redemption.delivery).toBe('pending');
    now += 61_000;
    const round = await scheduledRound({ outbox, legacy });
    expect(round.retried.live).toEqual([
      { privilegeId: 'duty-free', status: 'delivered' },
    ]);
    expect(
      (
        store.dump()['live/redemptions/duty-free'] as {
          notification: { status: string };
        }
      ).notification.status,
    ).toBe('delivered');
  });

  it('never sends a legacy scheduled message, even when one is due', async () => {
    const round = await scheduledRound({ outbox, legacy });
    expect(round.retried.live).toEqual([]);
    expect(channels.outbox).toEqual([]);
    expect(
      Object.keys(store.dump()).filter((k) => k.includes('/dispatch/')),
    ).toEqual([]);
  });

  it('leaves the redeemed Shopping Privilege exactly as it is', async () => {
    const record = {
      amountPence: 7500,
      redeemedAt: '2026-10-18T10:00:00.000Z',
      notified: true,
    };
    await store.create(shoppingKey('live'), record);
    const before = JSON.stringify(store.dump());
    now += 3_600_000;
    await scheduledRound({ outbox, legacy });
    expect(JSON.stringify(store.dump())).toBe(before);
    expect(store.dump()[shoppingKey('live')]).toEqual(record);
  });

  it('retries rehearsal notifications without contacting any channel', async () => {
    await redeemWithFailedNotification('rehearsal');
    const sent = channels.outbox.length;
    now += 61_000;
    await scheduledRound({ outbox, legacy });
    expect(channels.outbox.length).toBe(sent);
  });

  it('keeps each half running when the other fails', async () => {
    await redeemWithFailedNotification('live');
    now += 61_000;
    const broken = await scheduledRound({
      outbox: () => Promise.reject(new Error('database down')),
      legacy,
    });
    expect(broken.outbox).toBe('failed');
    expect(broken.retried.live).toHaveLength(1);

    let ran = false;
    const failingStore = {
      ...store,
      list: () => Promise.reject(new Error('blobs down')),
    } as unknown as MemoryStore;
    const other = await scheduledRound({
      outbox: async () => {
        ran = true;
        return { processed: 1 };
      },
      legacy: { ...legacy, store: failingStore },
    });
    expect(ran).toBe(true);
    expect(other.outbox).toBe(1);
    expect(other.retried).toEqual({ live: [], rehearsal: [] });
  });
});
