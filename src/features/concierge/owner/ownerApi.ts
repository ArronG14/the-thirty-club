/**
 * The owner console's client. The owner key is sent as `x-owner-key`; the
 * service compares it in constant time and rate-limits wrong guesses.
 */
import type { PrivilegeId } from '../domain/catalogue';
import type { CredentialId } from '../domain/credentials';
import type { MessageId } from '../domain/messages';
import type { EffectiveSchedule, ScheduleOverrides } from '../domain/schedule';
import type { Realm, Scope } from '../domain/session';
import type { DeliveryStatus } from '../domain/contract';

export const OWNER_KEY_STORAGE = 'thirty-club:owner-key';

export interface OwnerOverview {
  realm: Realm;
  now: number;
  health: {
    sessions: boolean;
    owner: boolean;
    departureCredential: { link: boolean; code: boolean };
    membershipCredential: { link: boolean; code: boolean };
    telegram: boolean;
    telegramRehearsalChat: boolean;
    sms: boolean;
    aliseDispatch: 'manual' | 'sms';
    siteUrl: string;
  };
  schedule: EffectiveSchedule;
  overrides: ScheduleOverrides;
  activations: { credential: CredentialId; at: string; via: 'link' | 'code' }[];
  /** The Shopping Privilege, read-only (absent from older servers). */
  shopping?:
    | { status: 'available' }
    | {
        status: 'awaiting-settlement';
        amountPence: number;
        requestedAt: string;
      };
  redemptions: {
    privilegeId: PrivilegeId;
    redeemedAt: string;
    choice?: string;
    note?: string;
    notification: {
      status: DeliveryStatus;
      attempts: number;
      lastAttemptAt?: string;
      deliveredAt?: string;
      lastError?: string;
    };
  }[];
  dispatches: {
    messageId: MessageId;
    status: 'sending' | 'sent' | 'manual' | 'failed';
    channel: string;
    attempts: number;
    at: string;
    updatedAt: string;
    error?: string;
  }[];
  privileges: {
    id: PrivilegeId;
    title: string;
    kind: 'request' | 'correspondence';
    provisional: boolean;
  }[];
  messages: {
    id: MessageId;
    label: string;
    timing: 'manual' | 'at' | 'privilege';
    sendAt: number | null;
    text: string;
  }[];
  credentials: Record<
    CredentialId,
    { link: string | null; code: string | null }
  >;
}

export type OwnerResult<T> =
  { ok: true; data: T } | { ok: false; status: number; message: string };

async function request<T>(
  key: string,
  path: string,
  body?: unknown,
): Promise<OwnerResult<T>> {
  try {
    const response = await fetch(path, {
      method: body === undefined ? 'GET' : 'POST',
      headers: {
        'x-owner-key': key,
        accept: 'application/json',
        ...(body === undefined ? {} : { 'content-type': 'application/json' }),
      },
      cache: 'no-store',
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    const data = (await response.json().catch(() => null)) as
      (T & { message?: string; error?: string }) | null;
    if (response.ok && data) return { ok: true, data };
    return {
      ok: false,
      status: response.status,
      message: data?.message ?? data?.error ?? `HTTP ${response.status}`,
    };
  } catch {
    return {
      ok: false,
      status: 0,
      message: 'The service could not be reached.',
    };
  }
}

export function ownerApi(key: string) {
  return {
    overview: (realm: Realm) =>
      request<OwnerOverview>(key, `/api/owner/overview?realm=${realm}`),
    test: (realm: Realm) =>
      request<{ ok: boolean; error?: string }>(key, '/api/owner/test', {
        realm,
      }),
    resend: (realm: Realm, privilegeId: PrivilegeId) =>
      request(key, '/api/owner/resend', { realm, privilegeId }),
    message: (
      realm: Realm,
      messageId: MessageId,
      action: 'send' | 'mark-sent' | 'reset',
    ) => request(key, '/api/owner/message', { realm, messageId, action }),
    schedule: (
      realm: Realm,
      target: { privilegeId: PrivilegeId } | { messageId: MessageId },
      change: { at?: string | null; disabled?: boolean },
    ) => request(key, '/api/owner/schedule', { realm, ...target, ...change }),
    rehearsal: (at: number, scopes: Scope[]) =>
      request<{ session: string }>(key, '/api/owner/session', {
        kind: 'rehearsal',
        at,
        scopes,
      }),
    display: (realm: Realm) =>
      request<{ session: string }>(key, '/api/owner/session', {
        kind: 'display',
        realm,
      }),
    reset: (realm: Realm, confirm?: string) =>
      request<{ cleared: number }>(key, '/api/owner/reset', {
        realm,
        ...(confirm ? { confirm } : {}),
      }),
  };
}
