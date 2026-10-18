/**
 * Test doubles for the concierge service. Used by unit tests and by the
 * local development API (build/conciergeLocalApi.ts). Nothing here reaches
 * a real provider: every "send" is recorded in an outbox.
 */
import type { Realm } from '../../src/features/concierge/domain/session.ts';
import type { Channels, SendResult } from './channels.ts';

export interface OutboxEntry {
  channel: 'arron' | 'sms';
  realm?: Realm;
  to?: string;
  text: string;
  ok: boolean;
  at: number;
}

export interface FakeChannels extends Channels {
  outbox: OutboxEntry[];
  /** Results to return for the next sends, in order (default: success). */
  failNext(channel: 'arron' | 'sms', times?: number, error?: string): void;
  setConfigured(channel: 'arron' | 'sms', configured: boolean): void;
}

export function fakeChannels(clock: () => number = Date.now): FakeChannels {
  const outbox: OutboxEntry[] = [];
  const failures = { arron: [] as string[], sms: [] as string[] };
  const configured = { arron: true, sms: false };
  const result = (channel: 'arron' | 'sms'): SendResult => {
    if (!configured[channel]) {
      return {
        ok: false,
        unconfigured: true,
        error: `${channel} not configured`,
      };
    }
    const error = failures[channel].shift();
    return error ? { ok: false, error } : { ok: true, reference: 'fake' };
  };
  return {
    outbox,
    get telegramConfigured() {
      return configured.arron;
    },
    get smsConfigured() {
      return configured.sms;
    },
    async arron(text, realm) {
      const sent = result('arron');
      outbox.push({ channel: 'arron', realm, text, ok: sent.ok, at: clock() });
      return sent;
    },
    async sms(to, text) {
      const sent = result('sms');
      outbox.push({ channel: 'sms', to, text, ok: sent.ok, at: clock() });
      return sent;
    },
    failNext(channel, times = 1, error = 'simulated outage') {
      for (let i = 0; i < times; i += 1) failures[channel].push(error);
    },
    setConfigured(channel, value) {
      configured[channel] = value;
    },
  };
}

/** A complete, obviously fake configuration for tests and local use. */
export const TEST_ENV = {
  CONCIERGE_SESSION_SECRET: 'test-secret-test-secret-test-secret',
  CONCIERGE_OWNER_KEY: 'test-owner-key-0001',
  CREDENTIAL_DEPARTURE_TOKEN: 'departure-test-token-0001',
  CREDENTIAL_DEPARTURE_CODE: 'BRASS-2210',
  CREDENTIAL_MEMBERSHIP_TOKEN: 'membership-test-token-0001',
  CREDENTIAL_MEMBERSHIP_CODE: 'TC-3010-2410',
  TELEGRAM_BOT_TOKEN: 'fake-bot-token',
  TELEGRAM_CHAT_ID: '1',
  CONCIERGE_SITE_URL: 'https://club.example',
} as const;
