// @vitest-environment node
import { beforeEach, describe, expect, it } from 'vitest';
import { createConciergeApi } from './api.ts';
import { signSession } from './auth.ts';
import { readConfig } from './config.ts';
import { parseAmountPence } from './shopping.ts';
import { memoryStore, type MemoryStore } from './store.ts';
import { fakeChannels, TEST_ENV, type FakeChannels } from './testing.ts';
import type { ServiceDeps } from './service.ts';
import type { Scope } from '../../src/features/concierge/domain/session.ts';

const ORIGIN = 'https://club.example';
const ARRON = '+447000000001';
let store: MemoryStore;
let channels: FakeChannels;
let handle: ReturnType<typeof createConciergeApi>;
let n = 0;

beforeEach(() => {
  store = memoryStore();
  channels = fakeChannels();
  channels.setConfigured('sms', true);
  const deps: ServiceDeps = {
    store,
    config: readConfig({ ...TEST_ENV, ARRON_PHONE: ARRON }),
    channels,
    clock: () => Date.parse('2026-10-20T12:00:00Z'),
  };
  handle = createConciergeApi(deps);
});

const session = (scopes: Scope[], realm: 'live' | 'rehearsal' = 'live') =>
  signSession(
    { v: 1, realm, scopes, iat: 1 },
    TEST_ENV.CONCIERGE_SESSION_SECRET,
  );

async function call(
  method: 'GET' | 'POST',
  token: string | null,
  body?: unknown,
) {
  const headers: Record<string, string> = {};
  if (token) headers.authorization = `Bearer ${token}`;
  if (body !== undefined) headers['content-type'] = 'application/json';
  const response = await handle(
    new Request(`${ORIGIN}/api/concierge/shopping`, {
      method,
      headers,
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    }),
    '203.0.113.9',
  );
  return { status: response.status, body: await response.json() };
}
const ask = (
  token: string,
  amount: unknown,
  key = `key-${(n += 1)}-abcdefgh`,
) => call('POST', token, { amount, idempotencyKey: key });

describe('parseAmountPence', () => {
  it('reads sensible sums as integer pence', () => {
    expect(parseAmountPence('75')).toBe(7500);
    expect(parseAmountPence('£75.5')).toBe(7550);
    expect(parseAmountPence(' 1,000.00 ')).toBe(100000);
    expect(parseAmountPence('0.01')).toBe(1);
  });
  it.each([
    '',
    '0',
    '-5',
    'abc',
    '1e3',
    '12.345',
    '£',
    '5 pounds',
    '9'.repeat(12),
  ])('refuses %j', (value) => expect(parseAmountPence(value)).toBeNull());
});

describe('Shopping Privilege', () => {
  it('requires a membership or departure session', async () => {
    expect((await call('GET', null)).status).toBe(401);
    expect((await ask(await session(['display']), '10')).status).toBe(403);
    expect((await ask('forged.token', '10')).status).toBe(401);
    expect(channels.outbox).toHaveLength(0);
  });

  it('accepts up to £100 inclusive and texts Arron once', async () => {
    const token = await session(['membership']);
    expect((await call('GET', token)).body).toEqual({ status: 'available' });
    const result = await ask(token, '100');
    expect(result.status).toBe(201);
    expect(result.body).toMatchObject({
      status: 'awaiting-settlement',
      amountPence: 10000,
    });
    expect(channels.outbox).toHaveLength(1);
    expect(channels.outbox[0]).toMatchObject({ channel: 'sms', to: ARRON });
    expect(channels.outbox[0]?.text).toBe(
      'THE THIRTY CLUB — SHOPPING REQUEST\nMadam has requested £100.00 through her Shopping Privilege.\nPlease arrange settlement.',
    );
    expect((await call('GET', token)).body.status).toBe('awaiting-settlement');
  });

  it('refuses above £100 without revealing the limit, and consumes nothing', async () => {
    const token = await session(['membership']);
    for (const amount of ['100.01', '150', '1000']) {
      const result = await ask(token, amount);
      expect(result.status).toBe(422);
      expect(JSON.stringify(result.body)).not.toMatch(/100/);
    }
    expect(channels.outbox).toHaveLength(0);
    expect((await ask(token, '75')).status).toBe(201);
  });

  it('is single-use, with a safe retry of the same request', async () => {
    const token = await session(['membership']);
    expect((await ask(token, '20', 'same-key-0001')).status).toBe(201);
    const again = await ask(token, '20', 'same-key-0001');
    expect(again.status).toBe(200);
    expect(again.body.duplicate).toBe(true);
    expect((await ask(token, '30', 'other-key-0002')).status).toBe(409);
    expect(channels.outbox).toHaveLength(1);
  });

  it('does not confirm when the SMS fails, and allows a retry', async () => {
    const token = await session(['membership']);
    channels.failNext('sms');
    const failed = await ask(token, '40');
    expect(failed.status).toBe(502);
    expect((await call('GET', token)).body).toEqual({ status: 'available' });
    expect((await ask(token, '40')).status).toBe(201);
  });

  it('refuses when SMS is not configured', async () => {
    channels.setConfigured('sms', false);
    const result = await ask(await session(['membership']), '10');
    expect(result.status).toBe(503);
  });

  it('keeps rehearsal and live separate and marks tests', async () => {
    const test = await session(['membership'], 'rehearsal');
    expect((await ask(test, '25')).status).toBe(201);
    expect(channels.outbox[0]?.text).toMatch(/^\[TEST/);
    const live = await session(['membership']);
    expect((await call('GET', live)).body.status).toBe('available');
    expect((await ask(live, '25')).status).toBe(201);
  });

  it('explains a too-short owner key without accepting it', async () => {
    const short = createConciergeApi({
      store,
      config: readConfig({ ...TEST_ENV, CONCIERGE_OWNER_KEY: '1414' }),
      channels,
      clock: () => 0,
    });
    const response = await short(
      new Request(`${ORIGIN}/api/owner/overview`, {
        headers: { 'x-owner-key': '1414' },
      }),
      '203.0.113.9',
    );
    expect(response.status).toBe(503);
    expect((await response.json()).message).toMatch(/16 characters/);
  });
});
