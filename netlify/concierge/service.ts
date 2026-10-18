/**
 * The concierge's records and the rules that act on them: activations,
 * redemptions and their delivery to Arron, scheduled messages to Alise.
 * Pure of any HTTP or Netlify detail; every dependency is injected.
 */
import {
  choiceLabel,
  findPrivilege,
  isPrivilegeId,
  type PrivilegeId,
} from '../../src/features/concierge/domain/catalogue.ts';
import type {
  ConciergeState,
  DeliveryStatus,
  PublicRedemption,
} from '../../src/features/concierge/domain/contract.ts';
import {
  CREDENTIAL_IDS,
  normaliseCode,
  type CredentialId,
} from '../../src/features/concierge/domain/credentials.ts';
import {
  composeMessage,
  findMessage,
  MESSAGES,
  type MessageId,
} from '../../src/features/concierge/domain/messages.ts';
import {
  effectiveSchedule,
  parseOverrides,
  type EffectiveSchedule,
  type ScheduleOverrides,
} from '../../src/features/concierge/domain/schedule.ts';
import type {
  Realm,
  SessionClaims,
} from '../../src/features/concierge/domain/session.ts';
import { UK_ZONE } from '../../src/features/concierge/domain/time.ts';
import { secretsEqual } from './auth.ts';
import { telegramMessage, type Channels } from './channels.ts';
import type { ConciergeConfig } from './config.ts';
import type { KvStore } from './store.ts';

export interface ServiceDeps {
  store: KvStore;
  config: ConciergeConfig;
  channels: Channels;
  /** Real time, epoch ms. */
  clock: () => number;
  log?: (event: string, detail?: Record<string, unknown>) => void;
}

// ---------- Records ----------

export interface NotificationState {
  status: DeliveryStatus;
  attempts: number;
  lastAttemptAt?: string;
  deliveredAt?: string;
  lastError?: string;
}

export interface RedemptionRecord {
  privilegeId: PrivilegeId;
  redeemedAt: string;
  idempotencyKey: string;
  choice?: string;
  note?: string;
  notification: NotificationState;
}

export interface ActivationRecord {
  credential: CredentialId;
  at: string;
  via: 'link' | 'code';
}

export type DispatchStatus = 'sending' | 'sent' | 'manual' | 'failed';

export interface DispatchRecord {
  messageId: MessageId;
  status: DispatchStatus;
  /** How it went out: SMS, handed to Arron to forward, or marked by him. */
  channel: 'sms' | 'arron-forward' | 'owner' | 'none';
  attempts: number;
  at: string;
  updatedAt: string;
  error?: string;
}

export const keys = {
  activation: (realm: Realm, id: CredentialId) => `${realm}/activations/${id}`,
  redemption: (realm: Realm, id: PrivilegeId) => `${realm}/redemptions/${id}`,
  dispatch: (realm: Realm, id: MessageId) => `${realm}/dispatch/${id}`,
  overrides: (realm: Realm) => `${realm}/overrides`,
};

/** Virtual time for a session: rehearsals may run at another moment. */
export function realmNow(deps: ServiceDeps, claims: SessionClaims | null) {
  return (
    deps.clock() + (claims?.realm === 'rehearsal' ? (claims.offsetMs ?? 0) : 0)
  );
}

export async function loadOverrides(
  deps: ServiceDeps,
  realm: Realm,
): Promise<ScheduleOverrides> {
  const entry = await deps.store.get<unknown>(keys.overrides(realm));
  return parseOverrides(entry?.value);
}

export async function scheduleFor(
  deps: ServiceDeps,
  realm: Realm,
): Promise<EffectiveSchedule> {
  return effectiveSchedule(await loadOverrides(deps, realm), deps.config.env);
}

export function publicRedemption(record: RedemptionRecord): PublicRedemption {
  return {
    privilegeId: record.privilegeId,
    redeemedAt: record.redeemedAt,
    ...(record.choice ? { choice: record.choice } : {}),
    ...(record.note ? { note: record.note } : {}),
    delivery: record.notification.status,
  };
}

async function readAll<T>(store: KvStore, prefix: string): Promise<T[]> {
  const found = await store.list(prefix);
  const entries = await Promise.all(found.map((key) => store.get<T>(key)));
  return entries.flatMap((entry) => (entry ? [entry.value] : []));
}

export async function loadRedemptions(
  deps: ServiceDeps,
  realm: Realm,
): Promise<RedemptionRecord[]> {
  const all = await readAll<RedemptionRecord>(
    deps.store,
    `${realm}/redemptions/`,
  );
  return all.filter((record) => isPrivilegeId(record.privilegeId));
}

export async function loadActivations(
  deps: ServiceDeps,
  realm: Realm,
): Promise<ActivationRecord[]> {
  const all = await readAll<ActivationRecord>(
    deps.store,
    `${realm}/activations/`,
  );
  return all.filter((record) => CREDENTIAL_IDS.includes(record.credential));
}

export async function loadDispatches(
  deps: ServiceDeps,
  realm: Realm,
): Promise<DispatchRecord[]> {
  return readAll<DispatchRecord>(deps.store, `${realm}/dispatch/`);
}

export async function conciergeState(
  deps: ServiceDeps,
  claims: SessionClaims | null,
): Promise<ConciergeState> {
  const realm = claims?.realm ?? 'live';
  const schedule = await scheduleFor(deps, realm);
  const state: ConciergeState = {
    now: realmNow(deps, claims),
    realm,
    scopes: claims?.scopes ?? [],
    schedule: {
      departureOpensAt: schedule.departureOpensAt,
      privileges: schedule.privileges,
    },
    activations: {},
    redemptions: {},
  };
  // Without a session the schedule is all anyone may see.
  if (!claims) return state;
  for (const activation of await loadActivations(deps, realm)) {
    state.activations[activation.credential] = activation.at;
  }
  for (const record of await loadRedemptions(deps, realm)) {
    state.redemptions[record.privilegeId] = publicRedemption(record);
  }
  return state;
}

// ---------- Credentials ----------

export async function matchCredential(
  config: ConciergeConfig,
  input: { token?: string; code?: string },
): Promise<{ credential: CredentialId; via: 'link' | 'code' } | null> {
  for (const credential of CREDENTIAL_IDS) {
    const secret = config.credentials[credential];
    if (input.token && (await secretsEqual(input.token, secret.token))) {
      return { credential, via: 'link' };
    }
    if (
      input.code &&
      (await secretsEqual(normaliseCode(input.code), secret.code))
    ) {
      return { credential, via: 'code' };
    }
  }
  return null;
}

const ACTIVATION_NOTES: Record<CredentialId, string[]> = {
  departure: [
    'Alise has presented her travel credential.',
    'The Departure Lounge is open to her.',
  ],
  membership: [
    'Alise has presented her membership card.',
    'The doors of The Thirty Club are opening.',
  ],
};

/** Records an activation once; tells Arron the first time. */
export async function recordActivation(
  deps: ServiceDeps,
  realm: Realm,
  credential: CredentialId,
  via: 'link' | 'code',
  at: number,
): Promise<{ record: ActivationRecord; firstTime: boolean }> {
  const record: ActivationRecord = {
    credential,
    via,
    at: new Date(at).toISOString(),
  };
  const key = keys.activation(realm, credential);
  const firstTime = await deps.store.create(key, record);
  if (!firstTime) {
    const existing = await deps.store.get<ActivationRecord>(key);
    return { record: existing?.value ?? record, firstTime };
  }
  // Informational only: a failure here never blocks Alise.
  const sent = await deps.channels.arron(
    telegramMessage(
      'THE THIRTY CLUB',
      ACTIVATION_NOTES[credential],
      stampFooter(at),
    ),
    realm,
  );
  if (!sent.ok) deps.log?.('activation-note-failed', { error: sent.error });
  return { record, firstTime };
}

// ---------- Redemption delivery ----------

/** Delay before attempt n+1 (n attempts already made). */
const BACKOFF_MS = [0, 60_000, 120_000, 300_000, 600_000, 900_000, 1_800_000];
export const MAX_DELIVERY_ATTEMPTS = 10;

export function deliveryDue(state: NotificationState, now: number): boolean {
  if (state.status === 'delivered' || state.status === 'failed') return false;
  if (!state.lastAttemptAt) return true;
  const wait = BACKOFF_MS[Math.min(state.attempts, BACKOFF_MS.length - 1)] ?? 0;
  return now - Date.parse(state.lastAttemptAt) >= wait;
}

function stampFooter(at: number): string {
  return (
    new Intl.DateTimeFormat('en-GB', {
      timeZone: UK_ZONE,
      weekday: 'short',
      day: 'numeric',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    }).format(new Date(at)) + ' UK time'
  );
}

export function arronRequestMessage(record: RedemptionRecord): string {
  const privilege = findPrivilege(record.privilegeId);
  if (privilege.kind !== 'request') return '';
  const choice = choiceLabel(privilege, record.choice);
  const { title, lines } = privilege.notify({
    ...(choice ? { choice } : {}),
    ...(record.note ? { note: record.note } : {}),
  });
  return telegramMessage(
    title,
    lines,
    stampFooter(Date.parse(record.redeemedAt)),
  );
}

/**
 * Attempts delivery of one redemption's notification and records the
 * outcome. `delivered` is written only when the channel confirmed it.
 */
export async function deliverRedemption(
  deps: ServiceDeps,
  realm: Realm,
  privilegeId: PrivilegeId,
): Promise<RedemptionRecord | null> {
  const key = keys.redemption(realm, privilegeId);
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const entry = await deps.store.get<RedemptionRecord>(key);
    if (!entry) return null;
    const record = entry.value;
    if (record.notification.status === 'delivered') return record;
    const nowIso = new Date(deps.clock()).toISOString();
    const result = await deps.channels.arron(
      arronRequestMessage(record),
      realm,
    );
    const attempts = record.notification.attempts + 1;
    const notification: NotificationState = result.ok
      ? {
          status: 'delivered',
          attempts,
          lastAttemptAt: nowIso,
          deliveredAt: nowIso,
        }
      : {
          status:
            'unconfigured' in result && result.unconfigured
              ? 'unconfigured'
              : attempts >= MAX_DELIVERY_ATTEMPTS
                ? 'failed'
                : 'pending',
          attempts,
          lastAttemptAt: nowIso,
          lastError: result.error,
        };
    const next = { ...record, notification };
    if (await deps.store.replace(key, next, entry.etag)) {
      if (!result.ok) {
        deps.log?.('delivery-failed', {
          privilegeId,
          realm,
          error: result.error,
        });
      }
      return next;
    }
    // Someone else updated it meanwhile: read again and reconsider.
  }
  return (await deps.store.get<RedemptionRecord>(key))?.value ?? null;
}

/** Retries every undelivered notification whose backoff has elapsed. */
export async function retryDeliveries(deps: ServiceDeps, realm: Realm) {
  const now = deps.clock();
  const results: { privilegeId: PrivilegeId; status: DeliveryStatus }[] = [];
  for (const record of await loadRedemptions(deps, realm)) {
    const retryable =
      record.notification.status === 'pending' ||
      (record.notification.status === 'unconfigured' &&
        deps.channels.telegramConfigured);
    if (!retryable || !deliveryDue(record.notification, now)) continue;
    const next = await deliverRedemption(deps, realm, record.privilegeId);
    if (next) {
      results.push({
        privilegeId: next.privilegeId,
        status: next.notification.status,
      });
    }
  }
  return results;
}

// ---------- Messages to Alise ----------

export const MAX_DISPATCH_ATTEMPTS = 3;
const DISPATCH_RETRY_MS = 120_000;
/** A send that crashed mid-flight is retried after this long. */
const STALE_SENDING_MS = 300_000;
/** Messages more than this late are not sent automatically. */
export const DISPATCH_WINDOW_MS = 36 * 3_600_000;

async function deliverMessage(
  deps: ServiceDeps,
  realm: Realm,
  messageId: MessageId,
): Promise<Pick<DispatchRecord, 'status' | 'channel' | 'error'>> {
  const { config, channels } = deps;
  const message = findMessage(messageId);
  const text = composeMessage(message, config.siteUrl);
  const recipient = realm === 'live' ? config.alisePhone : config.arronPhone;
  let smsError: string | undefined;
  if (config.aliseDispatch === 'sms' && channels.smsConfigured && recipient) {
    const sent = await channels.sms(recipient, text);
    if (sent.ok) {
      await channels.arron(
        telegramMessage('THE THIRTY CLUB — MESSAGE SENT', [
          realm === 'live'
            ? `Sent to Alise by SMS: ${message.label}.`
            : `Rehearsal SMS sent to your phone: ${message.label}.`,
        ]),
        realm,
      );
      return { status: 'sent', channel: 'sms' };
    }
    smsError = sent.error;
  }
  // Manual mode, or SMS failed: hand Arron the text to forward himself.
  const handed = await channels.arron(
    telegramMessage('THE THIRTY CLUB — PLEASE SEND TO ALISE', [
      smsError
        ? `The SMS could not be sent (${smsError}). Please forward this yourself now:`
        : `It is time for “${message.label}”. Please forward this to Alise now:`,
      '',
      text,
    ]),
    realm,
  );
  if (handed.ok) {
    return {
      status: 'manual',
      channel: 'arron-forward',
      ...(smsError ? { error: smsError } : {}),
    };
  }
  return {
    status: 'failed',
    channel: 'none',
    error: [smsError, handed.error].filter(Boolean).join(' / '),
  };
}

/**
 * Sends a message to Alise once. The claim is written before sending, so
 * an overlapping scheduled run cannot send it twice. `force` (owner only)
 * sends again even if it already went out.
 */
export async function dispatchMessage(
  deps: ServiceDeps,
  realm: Realm,
  messageId: MessageId,
  options: { force?: boolean } = {},
): Promise<DispatchRecord | null> {
  const key = keys.dispatch(realm, messageId);
  const now = deps.clock();
  const nowIso = new Date(now).toISOString();
  const claim: DispatchRecord = {
    messageId,
    status: 'sending',
    channel: 'none',
    attempts: 1,
    at: nowIso,
    updatedAt: nowIso,
  };
  let etag: string | null;
  if (await deps.store.create(key, claim)) {
    etag = (await deps.store.get<DispatchRecord>(key))?.etag ?? null;
  } else {
    const existing = await deps.store.get<DispatchRecord>(key);
    if (!existing) return null;
    const record = existing.value;
    const stale =
      record.status === 'sending' &&
      now - Date.parse(record.updatedAt) >= STALE_SENDING_MS;
    const retry =
      record.status === 'failed' &&
      record.attempts < MAX_DISPATCH_ATTEMPTS &&
      now - Date.parse(record.updatedAt) >= DISPATCH_RETRY_MS;
    if (!options.force && !stale && !retry) return null;
    const next: DispatchRecord = {
      ...record,
      status: 'sending',
      attempts: record.attempts + 1,
      updatedAt: nowIso,
    };
    if (!(await deps.store.replace(key, next, existing.etag))) return null;
    claim.attempts = next.attempts;
    claim.at = record.at;
    etag = (await deps.store.get<DispatchRecord>(key))?.etag ?? null;
  }
  const outcome = await deliverMessage(deps, realm, messageId);
  const finished: DispatchRecord = {
    ...claim,
    ...outcome,
    updatedAt: new Date(deps.clock()).toISOString(),
  };
  if (!outcome.error) delete finished.error;
  if (etag) await deps.store.replace(key, finished, etag);
  else await deps.store.put(key, finished);
  return finished;
}

/** The owner confirms he forwarded the message himself. */
export async function markMessageSent(
  deps: ServiceDeps,
  realm: Realm,
  messageId: MessageId,
): Promise<DispatchRecord> {
  const key = keys.dispatch(realm, messageId);
  const existing = await deps.store.get<DispatchRecord>(key);
  const nowIso = new Date(deps.clock()).toISOString();
  const record: DispatchRecord = {
    messageId,
    status: 'sent',
    channel: 'owner',
    attempts: existing?.value.attempts ?? 0,
    at: existing?.value.at ?? nowIso,
    updatedAt: nowIso,
  };
  await deps.store.put(key, record);
  return record;
}

/** Every scheduled message that is due now and has not gone out. */
export function dueMessages(
  schedule: EffectiveSchedule,
  now: number,
): MessageId[] {
  return MESSAGES.flatMap((message) => {
    const at = schedule.messages[message.id];
    return at !== null && now >= at && now - at <= DISPATCH_WINDOW_MS
      ? [message.id]
      : [];
  });
}
