// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { decodeSessionClaims } from '../../src/features/concierge/domain/session.ts';
import { createConciergeApi } from './api.ts';
import { signSession, verifySession } from './auth.ts';
import { createChannels } from './channels.ts';
import { readConfig } from './config.ts';
import { runDispatch } from './dispatch.ts';
import { keys, MAX_DELIVERY_ATTEMPTS, type ServiceDeps } from './service.ts';
import { memoryStore, type MemoryStore } from './store.ts';
import { fakeChannels, TEST_ENV, type FakeChannels } from './testing.ts';

const ORIGIN = 'https://club.example';
/** Thursday 22 October, 14:00 in London (BST, UTC+1). */
const LOUNGE_OPENS = Date.parse('2026-10-22T13:00:00Z');
/** The provisional in-flight release, 18:30 in London. */
const IN_FLIGHT = Date.parse('2026-10-22T17:30:00Z');
const MINUTE = 60_000;

let now: number;
let store: MemoryStore;
let channels: FakeChannels;
let deps: ServiceDeps;
let handle: ReturnType<typeof createConciergeApi>;

function setup(env: Record<string, string> = TEST_ENV) {
  store = memoryStore();
  channels = fakeChannels(() => now);
  deps = {
    store,
    config: readConfig(env),
    channels,
    clock: () => now,
  };
  handle = createConciergeApi(deps);
}

beforeEach(() => {
  now = LOUNGE_OPENS + 5 * MINUTE;
  setup();
});

async function call(
  method: string,
  path: string,
  options: {
    body?: unknown;
    session?: string;
    owner?: string;
    ip?: string;
    headers?: Record<string, string>;
  } = {},
) {
  const headers: Record<string, string> = { ...options.headers };
  if (options.session) headers.authorization = `Bearer ${options.session}`;
  if (options.owner) headers['x-owner-key'] = options.owner;
  if (options.body !== undefined) headers['content-type'] = 'application/json';
  const response = await handle(
    new Request(ORIGIN + path, {
      method,
      headers,
      ...(options.body !== undefined
        ? { body: JSON.stringify(options.body) }
        : {}),
    }),
    options.ip ?? '203.0.113.7',
  );
  return { status: response.status, body: await response.json() };
}

async function presentDeparture(session?: string) {
  const result = await call('POST', '/api/concierge/activate', {
    body: { token: TEST_ENV.CREDENTIAL_DEPARTURE_TOKEN },
    ...(session ? { session } : {}),
  });
  expect(result.status).toBe(200);
  return result.body.session as string;
}

let keyCounter = 0;
const idem = () => `key-${(keyCounter += 1).toString().padStart(6, '0')}`;

describe('sessions', () => {
  it('signs and verifies, and rejects tampering', async () => {
    const secret = TEST_ENV.CONCIERGE_SESSION_SECRET;
    const token = await signSession(
      { v: 1, realm: 'live', scopes: ['departure'], iat: 1 },
      secret,
    );
    expect(await verifySession(token, secret)).toMatchObject({
      scopes: ['departure'],
    });
    const [payload, signature] = token.split('.');
    const forged = btoa(
      JSON.stringify({ v: 1, realm: 'live', scopes: ['membership'], iat: 1 }),
    )
      .replace(/=+$/, '')
      .replace(/\+/g, '-')
      .replace(/\//g, '_');
    expect(await verifySession(`${forged}.${signature}`, secret)).toBeNull();
    expect(await verifySession(`${payload}.AAAA`, secret)).toBeNull();
    expect(
      await verifySession(token, 'another-secret-another-secret'),
    ).toBeNull();
    expect(await verifySession('nonsense', secret)).toBeNull();
  });
});

describe('credentials', () => {
  it('recognises the NFC link token and issues a departure session', async () => {
    const { status, body } = await call('POST', '/api/concierge/activate', {
      body: { token: TEST_ENV.CREDENTIAL_DEPARTURE_TOKEN },
    });
    expect(status).toBe(200);
    expect(body.credential).toBe('departure');
    expect(decodeSessionClaims(body.session)).toMatchObject({
      realm: 'live',
      scopes: ['departure'],
    });
    expect(body.state.activations.departure).toBeTruthy();
    // Arron hears about it, once.
    expect(channels.outbox.filter((m) => m.channel === 'arron')).toHaveLength(
      1,
    );
    await presentDeparture();
    expect(channels.outbox.filter((m) => m.channel === 'arron')).toHaveLength(
      1,
    );
  });

  it('accepts the manual code regardless of case, spacing and punctuation', async () => {
    const { status, body } = await call('POST', '/api/concierge/activate', {
      body: { code: ' brass 2210 ' },
    });
    expect(status).toBe(200);
    expect(body.credential).toBe('departure');
    expect(store.dump()['live/activations/departure']).toMatchObject({
      via: 'code',
    });
  });

  it('distinguishes the membership credential and keeps earlier scopes', async () => {
    const departure = await presentDeparture();
    const { body } = await call('POST', '/api/concierge/activate', {
      body: { code: TEST_ENV.CREDENTIAL_MEMBERSHIP_CODE },
      session: departure,
    });
    expect(body.credential).toBe('membership');
    expect(decodeSessionClaims(body.session)?.scopes.sort()).toEqual([
      'departure',
      'membership',
    ]);
  });

  it('rejects unknown credentials and rate-limits repeated failures', async () => {
    for (let i = 0; i < 8; i += 1) {
      const { status, body } = await call('POST', '/api/concierge/activate', {
        body: { code: `WRONG${i}000` },
      });
      expect(status).toBe(404);
      expect(body.error).toBe('unrecognised');
    }
    const blocked = await call('POST', '/api/concierge/activate', {
      body: { code: TEST_ENV.CREDENTIAL_DEPARTURE_CODE },
    });
    expect(blocked.status).toBe(429);
    // Another address is unaffected; the window also expires.
    expect(
      (
        await call('POST', '/api/concierge/activate', {
          body: { code: TEST_ENV.CREDENTIAL_DEPARTURE_CODE },
          ip: '198.51.100.2',
        })
      ).status,
    ).toBe(200);
    now += 16 * MINUTE;
    expect(
      (
        await call('POST', '/api/concierge/activate', {
          body: { code: TEST_ENV.CREDENTIAL_DEPARTURE_CODE },
        })
      ).status,
    ).toBe(200);
  });

  it('refuses malformed tokens and empty requests', async () => {
    expect(
      (
        await call('POST', '/api/concierge/activate', {
          body: { token: '../../etc' },
        })
      ).status,
    ).toBe(404);
    expect(
      (await call('POST', '/api/concierge/activate', { body: {} })).status,
    ).toBe(400);
  });

  it('reports an unconfigured service honestly', async () => {
    setup({});
    const { status, body } = await call('POST', '/api/concierge/activate', {
      body: { code: 'BRASS-2210' },
    });
    expect(status).toBe(503);
    expect(body.error).toBe('not-configured');
  });

  it('refuses cross-site posts', async () => {
    const { status } = await call('POST', '/api/concierge/activate', {
      body: { code: 'BRASS-2210' },
      headers: { origin: 'https://elsewhere.example' },
    });
    expect(status).toBe(403);
  });
});

describe('state', () => {
  it('shows only the schedule without a session', async () => {
    const departure = await presentDeparture();
    await call('POST', '/api/concierge/redeem', {
      session: departure,
      body: { privilegeId: 'duty-free', idempotencyKey: idem() },
    });
    const anonymous = await call('GET', '/api/concierge/state');
    expect(anonymous.body.schedule.departureOpensAt).toBe(LOUNGE_OPENS);
    expect(anonymous.body.redemptions).toEqual({});
    expect(anonymous.body.activations).toEqual({});
    const member = await call('GET', '/api/concierge/state', {
      session: departure,
    });
    expect(member.body.redemptions['duty-free'].delivery).toBe('delivered');
  });

  it('rejects a session signed with another secret', async () => {
    const stranger = await signSession(
      { v: 1, realm: 'live', scopes: ['departure'], iat: 1 },
      'not-the-real-secret-not-the-real',
    );
    expect(
      (await call('GET', '/api/concierge/state', { session: stranger })).status,
    ).toBe(401);
  });
});

describe('redemption', () => {
  it('redeems once, records the note and tells Arron', async () => {
    const session = await presentDeparture();
    channels.outbox.length = 0;
    const { status, body } = await call('POST', '/api/concierge/redeem', {
      session,
      body: {
        privilegeId: 'duty-free',
        idempotencyKey: idem(),
        note: '  Jo Malone,\nplease  ',
      },
    });
    expect(status).toBe(201);
    expect(body.redemption).toMatchObject({
      privilegeId: 'duty-free',
      note: 'Jo Malone, please',
      delivery: 'delivered',
    });
    expect(channels.outbox).toHaveLength(1);
    expect(channels.outbox[0]?.text).toContain('CONCIERGE REQUEST');
    expect(channels.outbox[0]?.text).toContain('Duty-Free Indulgence');
    expect(channels.outbox[0]?.text).toContain('Jo Malone, please');
  });

  it('treats a retried request as the same redemption', async () => {
    const session = await presentDeparture();
    const key = idem();
    const first = await call('POST', '/api/concierge/redeem', {
      session,
      body: { privilegeId: 'duty-free', idempotencyKey: key },
    });
    const again = await call('POST', '/api/concierge/redeem', {
      session,
      body: { privilegeId: 'duty-free', idempotencyKey: key },
    });
    expect(first.status).toBe(201);
    expect(again.status).toBe(200);
    expect(again.body.duplicate).toBe(true);
    expect(
      channels.outbox.filter((m) => m.text.includes('CONCIERGE REQUEST')),
    ).toHaveLength(1);
  });

  it('never redeems the same privilege twice', async () => {
    const session = await presentDeparture();
    await call('POST', '/api/concierge/redeem', {
      session,
      body: { privilegeId: 'duty-free', idempotencyKey: idem(), note: 'First' },
    });
    const second = await call('POST', '/api/concierge/redeem', {
      session,
      body: {
        privilegeId: 'duty-free',
        idempotencyKey: idem(),
        note: 'Second',
      },
    });
    expect(second.status).toBe(409);
    expect(second.body.error).toBe('already-redeemed');
    expect(second.body.redemption.note).toBe('First');
  });

  it('is atomic under concurrent requests', async () => {
    const session = await presentDeparture();
    const results = await Promise.all(
      Array.from({ length: 5 }, () =>
        call('POST', '/api/concierge/redeem', {
          session,
          body: { privilegeId: 'duty-free', idempotencyKey: idem() },
        }),
      ),
    );
    expect(results.filter((r) => r.status === 201)).toHaveLength(1);
    expect(results.filter((r) => r.status === 409)).toHaveLength(4);
  });

  it('requires the travel credential', async () => {
    const anonymous = await call('POST', '/api/concierge/redeem', {
      body: { privilegeId: 'duty-free', idempotencyKey: idem() },
    });
    expect(anonymous.status).toBe(401);
    const membershipOnly = await call('POST', '/api/concierge/activate', {
      body: { code: TEST_ENV.CREDENTIAL_MEMBERSHIP_CODE },
    });
    const refused = await call('POST', '/api/concierge/redeem', {
      session: membershipOnly.body.session,
      body: { privilegeId: 'duty-free', idempotencyKey: idem() },
    });
    expect(refused.status).toBe(403);
  });

  it('refuses before release, using the service clock', async () => {
    now = LOUNGE_OPENS - MINUTE;
    const session = await presentDeparture();
    const early = await call('POST', '/api/concierge/redeem', {
      session,
      body: { privilegeId: 'duty-free', idempotencyKey: idem() },
    });
    expect(early.status).toBe(403);
    expect(early.body.error).toBe('not-released');
    now = LOUNGE_OPENS;
    const onTime = await call('POST', '/api/concierge/redeem', {
      session,
      body: { privilegeId: 'duty-free', idempotencyKey: idem() },
    });
    expect(onTime.status).toBe(201);
  });

  it('validates the in-flight choice and records its label for Arron', async () => {
    now = IN_FLIGHT + MINUTE;
    const session = await presentDeparture();
    const missing = await call('POST', '/api/concierge/redeem', {
      session,
      body: { privilegeId: 'in-flight', idempotencyKey: idem() },
    });
    expect(missing.status).toBe(400);
    const invalid = await call('POST', '/api/concierge/redeem', {
      session,
      body: { privilegeId: 'in-flight', idempotencyKey: idem(), choice: 'gin' },
    });
    expect(invalid.status).toBe(400);
    channels.outbox.length = 0;
    const ok = await call('POST', '/api/concierge/redeem', {
      session,
      body: {
        privilegeId: 'in-flight',
        idempotencyKey: idem(),
        choice: 'champagne',
        note: 'Something pink',
      },
    });
    expect(ok.status).toBe(201);
    expect(channels.outbox[0]?.text).toContain(
      'Selection: Champagne — Something pink',
    );
    expect(channels.outbox[0]?.text).toContain('suitably refreshed');
  });

  it('cannot redeem correspondence or unknown privileges', async () => {
    now = Date.parse('2026-10-23T15:00:00Z');
    const session = await presentDeparture();
    expect(
      (
        await call('POST', '/api/concierge/redeem', {
          session,
          body: { privilegeId: 'jamaica-arrival', idempotencyKey: idem() },
        })
      ).status,
    ).toBe(400);
    expect(
      (
        await call('POST', '/api/concierge/redeem', {
          session,
          body: { privilegeId: 'yacht', idempotencyKey: idem() },
        })
      ).status,
    ).toBe(404);
  });

  it('escapes HTML in notes sent to Telegram', async () => {
    const session = await presentDeparture();
    channels.outbox.length = 0;
    await call('POST', '/api/concierge/redeem', {
      session,
      body: {
        privilegeId: 'duty-free',
        idempotencyKey: idem(),
        note: '<b>bold</b> & co',
      },
    });
    expect(channels.outbox[0]?.text).toContain(
      '&lt;b&gt;bold&lt;/b&gt; &amp; co',
    );
  });

  it('rejects oversized bodies', async () => {
    const session = await presentDeparture();
    const { status } = await call('POST', '/api/concierge/redeem', {
      session,
      body: {
        privilegeId: 'duty-free',
        idempotencyKey: idem(),
        note: 'x'.repeat(5000),
      },
    });
    expect(status).toBe(413);
  });
});

describe('notification delivery', () => {
  it('records a failed delivery as pending, never delivered, then retries', async () => {
    const session = await presentDeparture();
    channels.failNext('arron', 1);
    const { body } = await call('POST', '/api/concierge/redeem', {
      session,
      body: { privilegeId: 'duty-free', idempotencyKey: idem() },
    });
    expect(body.redemption.delivery).toBe('pending');
    const stored = store.dump()['live/redemptions/duty-free'] as {
      notification: { attempts: number; lastError: string };
    };
    expect(stored.notification.attempts).toBe(1);
    expect(stored.notification.lastError).toBe('simulated outage');

    // The scheduled round waits for the backoff, then delivers.
    await runDispatch(deps);
    expect(
      (
        store.dump()['live/redemptions/duty-free'] as {
          notification: { attempts: number };
        }
      ).notification.attempts,
    ).toBe(1);
    now += 61_000;
    const round = await runDispatch(deps);
    expect(round.retried.live).toEqual([
      { privilegeId: 'duty-free', status: 'delivered' },
    ]);
    const state = await call('GET', '/api/concierge/state', { session });
    expect(state.body.redemptions['duty-free'].delivery).toBe('delivered');
  });

  it('gives up after the maximum attempts and lets the owner resend', async () => {
    const session = await presentDeparture();
    channels.failNext('arron', 50);
    await call('POST', '/api/concierge/redeem', {
      session,
      body: { privilegeId: 'duty-free', idempotencyKey: idem() },
    });
    for (let i = 0; i < 20; i += 1) {
      now += 31 * MINUTE;
      await runDispatch(deps);
    }
    const stored = store.dump()['live/redemptions/duty-free'] as {
      notification: { status: string; attempts: number };
    };
    expect(stored.notification).toMatchObject({
      status: 'failed',
      attempts: MAX_DELIVERY_ATTEMPTS,
    });
    // The provider recovers; the owner resends from the console.
    deps.channels = fakeChannels(() => now);
    handle = createConciergeApi(deps);
    const resent = await call('POST', '/api/owner/resend', {
      owner: TEST_ENV.CONCIERGE_OWNER_KEY,
      body: { realm: 'live', privilegeId: 'duty-free' },
    });
    expect(resent.body.redemption.notification.status).toBe('delivered');
  });

  it('is honest when Telegram is not configured', async () => {
    channels.setConfigured('arron', false);
    const session = await presentDeparture();
    const { body } = await call('POST', '/api/concierge/redeem', {
      session,
      body: { privilegeId: 'duty-free', idempotencyKey: idem() },
    });
    expect(body.redemption.delivery).toBe('unconfigured');
    // Once configured, the next round after the backoff delivers it.
    channels.setConfigured('arron', true);
    now += 61_000;
    await runDispatch(deps);
    expect(
      (
        store.dump()['live/redemptions/duty-free'] as {
          notification: { status: string };
        }
      ).notification.status,
    ).toBe('delivered');
  });
});

describe('real channels with a fake network', () => {
  it('counts Telegram as delivered only on ok: true', async () => {
    const config = readConfig(TEST_ENV);
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ ok: true, result: { message_id: 9 } })),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ ok: false, description: 'chat not found' }),
          {
            status: 400,
          },
        ),
      )
      .mockRejectedValueOnce(new TypeError('network down'));
    const real = createChannels(config, fetchImpl as unknown as typeof fetch);
    expect(await real.arron('<b>hi</b>', 'live')).toEqual({
      ok: true,
      reference: '9',
    });
    expect(await real.arron('hi', 'live')).toMatchObject({
      ok: false,
      error: expect.stringContaining('chat not found'),
    });
    expect(await real.arron('hi', 'live')).toMatchObject({ ok: false });
    const [url, init] = fetchImpl.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://api.telegram.org/botfake-bot-token/sendMessage');
    expect(JSON.parse(init.body as string)).toMatchObject({
      chat_id: '1',
      parse_mode: 'HTML',
    });
  });

  it('suppresses rehearsal messages even when a rehearsal chat is configured', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(
        new Response(JSON.stringify({ ok: true, result: {} })),
      );
    const real = createChannels(
      readConfig({ ...TEST_ENV, TELEGRAM_REHEARSAL_CHAT_ID: '2' }),
      fetchImpl as unknown as typeof fetch,
    );
    expect(await real.arron('hello', 'rehearsal')).toEqual({
      ok: true,
      reference: 'rehearsal-suppressed',
    });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('sends Twilio SMS with basic auth and treats failures honestly', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ sid: 'SM1', status: 'queued' }), {
          status: 201,
        }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ message: 'invalid number' }), {
          status: 400,
        }),
      );
    const real = createChannels(
      readConfig({
        ...TEST_ENV,
        TWILIO_ACCOUNT_SID: 'AC1',
        TWILIO_AUTH_TOKEN: 'secret',
        TWILIO_FROM: 'ThirtyClub',
      }),
      fetchImpl as unknown as typeof fetch,
    );
    expect(await real.sms('+447700900000', 'Hello')).toEqual({
      ok: true,
      reference: 'SM1',
    });
    expect(await real.sms('+447700900000', 'Hello')).toMatchObject({
      ok: false,
    });
    const init = (fetchImpl.mock.calls[0] as [string, RequestInit])[1];
    expect((init.headers as Record<string, string>).authorization).toBe(
      `Basic ${btoa('AC1:secret')}`,
    );
  });

  it('reports missing configuration without calling the network', async () => {
    const fetchImpl = vi.fn();
    const real = createChannels(
      readConfig({}),
      fetchImpl as unknown as typeof fetch,
    );
    expect(await real.arron('x', 'live')).toMatchObject({
      ok: false,
      unconfigured: true,
    });
    expect(await real.sms('+1', 'x')).toMatchObject({
      ok: false,
      unconfigured: true,
    });
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});

describe('scheduled messages to Alise', () => {
  it('hands the Departure Lounge message to Arron at 14:00 UK, exactly once', async () => {
    now = LOUNGE_OPENS - MINUTE;
    expect((await runDispatch(deps)).sent).toEqual([]);
    now = LOUNGE_OPENS + 30_000;
    const first = await runDispatch(deps);
    expect(first.sent).toHaveLength(1);
    expect(first.sent[0]).toMatchObject({
      messageId: 'departure-ready',
      status: 'manual',
      channel: 'arron-forward',
    });
    const forwarded = channels.outbox.at(-1)!;
    expect(forwarded.text).toContain('PLEASE SEND TO ALISE');
    expect(forwarded.text).toContain('Your Departure Lounge is now ready.');
    expect(forwarded.text).toContain('https://club.example/departure');
    now += MINUTE;
    expect((await runDispatch(deps)).sent).toEqual([]);
    expect(
      channels.outbox.filter((m) => m.text.includes('PLEASE SEND')),
    ).toHaveLength(1);
  });

  it('sends by SMS to Alise in sms mode, copying Arron', async () => {
    setup({
      ...TEST_ENV,
      ALISE_DISPATCH: 'sms',
      TWILIO_ACCOUNT_SID: 'AC1',
      TWILIO_AUTH_TOKEN: 'secret',
      TWILIO_FROM: 'ThirtyClub',
      ALISE_PHONE: '+447700900001',
    });
    channels.setConfigured('sms', true);
    now = LOUNGE_OPENS + 30_000;
    const { sent } = await runDispatch(deps);
    expect(sent[0]).toMatchObject({ status: 'sent', channel: 'sms' });
    expect(channels.outbox[0]).toMatchObject({
      channel: 'sms',
      to: '+447700900001',
    });
    expect(channels.outbox[1]?.text).toContain('Sent to Alise by SMS');
  });

  it('falls back to Arron when the SMS fails', async () => {
    setup({
      ...TEST_ENV,
      ALISE_DISPATCH: 'sms',
      TWILIO_ACCOUNT_SID: 'AC1',
      TWILIO_AUTH_TOKEN: 'secret',
      TWILIO_FROM: 'ThirtyClub',
      ALISE_PHONE: '+447700900001',
    });
    channels.setConfigured('sms', true);
    channels.failNext('sms', 1, 'carrier rejected');
    now = LOUNGE_OPENS + 30_000;
    const { sent } = await runDispatch(deps);
    expect(sent[0]).toMatchObject({
      status: 'manual',
      error: 'carrier rejected',
    });
    expect(channels.outbox.at(-1)?.text).toContain('could not be sent');
  });

  it('retries a failed hand-over and never double-sends under overlap', async () => {
    now = LOUNGE_OPENS + 30_000;
    channels.failNext('arron', 1);
    const [a, b] = await Promise.all([runDispatch(deps), runDispatch(deps)]);
    expect([...a.sent, ...b.sent]).toHaveLength(1);
    expect(store.dump()['live/dispatch/departure-ready']).toMatchObject({
      status: 'failed',
    });
    now += 3 * MINUTE;
    const retry = await runDispatch(deps);
    expect(retry.sent[0]).toMatchObject({ status: 'manual', attempts: 2 });
  });

  it('follows the in-flight release when the owner moves it', async () => {
    const owner = TEST_ENV.CONCIERGE_OWNER_KEY;
    await call('POST', '/api/owner/schedule', {
      owner,
      body: {
        realm: 'live',
        privilegeId: 'in-flight',
        at: '2026-10-22T19:15:00Z',
      },
    });
    now = IN_FLIGHT + MINUTE;
    const before = await runDispatch(deps);
    expect(before.sent.map((s) => s.messageId)).toEqual(['departure-ready']);
    now = Date.parse('2026-10-22T19:15:30Z');
    const after = await runDispatch(deps);
    expect(after.sent.map((s) => s.messageId)).toEqual(['in-flight']);
  });

  it('respects the PRIVILEGE_IN_FLIGHT_OPENS_AT environment override', async () => {
    setup({
      ...TEST_ENV,
      PRIVILEGE_IN_FLIGHT_OPENS_AT: '2026-10-22T20:00:00Z',
    });
    const state = await call('GET', '/api/concierge/state');
    expect(state.body.schedule.privileges['in-flight']).toBe(
      Date.parse('2026-10-22T20:00:00Z'),
    );
  });

  it('never sends manual messages automatically or very late ones', async () => {
    now = Date.parse('2026-10-26T12:00:00Z');
    const { sent } = await runDispatch(deps);
    expect(sent).toEqual([]);
  });
});

describe('owner console and rehearsal isolation', () => {
  const owner = TEST_ENV.CONCIERGE_OWNER_KEY;

  it('requires the owner key and rate-limits guesses', async () => {
    expect((await call('GET', '/api/owner/overview')).status).toBe(401);
    for (let i = 0; i < 8; i += 1) {
      await call('GET', '/api/owner/overview', { owner: `wrong-key-${i}` });
    }
    expect((await call('GET', '/api/owner/overview', { owner })).status).toBe(
      429,
    );
  });

  it('shows health, links and messages without exposing provider secrets', async () => {
    const { status, body } = await call('GET', '/api/owner/overview', {
      owner,
    });
    expect(status).toBe(200);
    expect(body.health).toMatchObject({
      telegram: true,
      sms: false,
      aliseDispatch: 'manual',
    });
    expect(body.credentials.departure.link).toBe(
      'https://club.example/c/departure-test-token-0001',
    );
    expect(body.credentials.departure.code).toBe('BRASS2210');
    expect(JSON.stringify(body)).not.toContain(TEST_ENV.TELEGRAM_BOT_TOKEN);
    expect(JSON.stringify(body)).not.toContain(
      TEST_ENV.CONCIERGE_SESSION_SECRET,
    );
    expect(body.messages).toHaveLength(5);
  });

  it('keeps rehearsal records, clock and notifications apart from live', async () => {
    now = LOUNGE_OPENS - 3 * 24 * 60 * MINUTE; // days before the real opening
    const issued = await call('POST', '/api/owner/session', {
      owner,
      body: { kind: 'rehearsal', at: IN_FLIGHT + MINUTE },
    });
    const rehearsal = await presentDeparture(issued.body.session);
    expect(decodeSessionClaims(rehearsal)?.realm).toBe('rehearsal');
    const state = await call('GET', '/api/concierge/state', {
      session: rehearsal,
    });
    expect(state.body.realm).toBe('rehearsal');
    // Virtual time: the rehearsal lives at in-flight time.
    expect(state.body.now).toBeGreaterThan(IN_FLIGHT);
    channels.outbox.length = 0;
    const redeemed = await call('POST', '/api/concierge/redeem', {
      session: rehearsal,
      body: {
        privilegeId: 'in-flight',
        idempotencyKey: idem(),
        choice: 'wine',
      },
    });
    expect(redeemed.status).toBe(201);
    expect(redeemed.body.redemption.delivery).toBe('simulated');
    expect(channels.outbox).toEqual([]);
    expect(
      Object.keys(store.dump()).filter((k) => k.startsWith('live/')),
    ).toEqual([]);
    // The live journey is untouched and still closed at the real time.
    const live = await presentDeparture();
    const liveTry = await call('POST', '/api/concierge/redeem', {
      session: live,
      body: { privilegeId: 'duty-free', idempotencyKey: idem() },
    });
    expect(liveTry.body.error).toBe('not-released');
    // Resetting the rehearsal leaves live records alone.
    await call('POST', '/api/owner/reset', {
      owner,
      body: { realm: 'rehearsal' },
    });
    expect(
      Object.keys(store.dump()).some((k) => k.startsWith('rehearsal/')),
    ).toBe(false);
    expect(store.dump()[keys.activation('live', 'departure')]).toBeTruthy();
  });

  it('a live session cannot claim a rehearsal clock', async () => {
    const live = await presentDeparture();
    now = LOUNGE_OPENS - MINUTE;
    const state = await call('GET', '/api/concierge/state', { session: live });
    expect(state.body.now).toBe(now);
  });

  it('clears live records only with the confirmation phrase', async () => {
    await presentDeparture();
    expect(
      (
        await call('POST', '/api/owner/reset', {
          owner,
          body: { realm: 'live' },
        })
      ).status,
    ).toBe(400);
    const cleared = await call('POST', '/api/owner/reset', {
      owner,
      body: { realm: 'live', confirm: 'RESET LIVE' },
    });
    expect(cleared.body.cleared).toBeGreaterThan(0);
  });

  it('sends, marks and resets messages from the console', async () => {
    const sent = await call('POST', '/api/owner/message', {
      owner,
      body: { realm: 'rehearsal', messageId: 'invitation', action: 'send' },
    });
    expect(sent.body.dispatch.status).toBe('manual');
    expect(sent.body.dispatch.channel).toBe('rehearsal-suppressed');
    expect(channels.outbox).toEqual([]);
    const marked = await call('POST', '/api/owner/message', {
      owner,
      body: {
        realm: 'rehearsal',
        messageId: 'invitation',
        action: 'mark-sent',
      },
    });
    expect(marked.body.dispatch).toMatchObject({
      status: 'sent',
      channel: 'owner',
    });
  });

  it('issues display sessions that can read but not redeem', async () => {
    const display = await call('POST', '/api/owner/session', {
      owner,
      body: { kind: 'display', realm: 'live' },
    });
    const state = await call('GET', '/api/concierge/state', {
      session: display.body.session,
    });
    expect(state.status).toBe(200);
    const refused = await call('POST', '/api/concierge/redeem', {
      session: display.body.session,
      body: { privilegeId: 'duty-free', idempotencyKey: idem() },
    });
    expect(refused.status).toBe(403);
  });
});
