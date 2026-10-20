/**
 * The one SMS dispatch policy (ADR-022), enforced at every sending
 * boundary: the PostgreSQL outbox, the legacy concierge sender and owner
 * rehearsals all call `deliverSms`, which re-reads the policy from the
 * database immediately before the provider is contacted.
 *
 * - Transport: `SMS_SENDING_ENABLED=true` and Twilio credentials make the
 *   transport *available*; they never authorise a message.
 * - Mode (database, owner-controlled, default and fallback `off`):
 *   off → nothing; rehearsal → only the owner's verified test number;
 *   live → Arron's notifications, and Alise only while the communication
 *   hold is released (the outbox also requires a post-LIVE approval).
 * - If the policy cannot be read, nothing is sent.
 */
import type { Database } from './database.ts';

export type SmsMode = 'off' | 'rehearsal' | 'live';
export type SmsAudience = 'alise' | 'arron' | 'owner-test';

export interface SmsPolicyState {
  mode: SmsMode;
  holdActive: boolean;
  liveSince: string | null;
}

const CLOSED: SmsPolicyState = {
  mode: 'off',
  holdActive: true,
  liveSince: null,
};

const PHONE = /^\+[1-9][0-9]{7,14}$/;
const digits = (value: string | undefined) => value?.replace(/[^0-9+]/g, '');

/** The database's policy; anything unreadable is the closed policy. */
export async function readSmsPolicy(db: Database): Promise<SmsPolicyState> {
  try {
    const state = await db.action<Partial<SmsPolicyState>>(
      null,
      'system',
      'system-sms-policy',
    );
    const mode =
      state.mode === 'live' || state.mode === 'rehearsal' ? state.mode : 'off';
    return {
      mode,
      holdActive: state.holdActive !== false,
      liveSince: typeof state.liveSince === 'string' ? state.liveSince : null,
    };
  } catch {
    return CLOSED;
  }
}

export interface TransportStatus {
  /** `SMS_SENDING_ENABLED=true`. */
  enabled: boolean;
  /** Twilio account, token and a sender are present. */
  configured: boolean;
  /** A valid owner test number, different from Alise's. */
  rehearsalConfigured: boolean;
}

export function transportStatus(env: NodeJS.ProcessEnv): TransportStatus {
  const rehearsal = digits(env.SMS_REHEARSAL_TO);
  return {
    enabled: env.SMS_SENDING_ENABLED === 'true',
    configured: Boolean(
      env.TWILIO_ACCOUNT_SID &&
      env.TWILIO_AUTH_TOKEN &&
      (env.TWILIO_MESSAGING_SERVICE_SID || env.TWILIO_FROM),
    ),
    rehearsalConfigured: Boolean(
      rehearsal &&
      PHONE.test(rehearsal) &&
      rehearsal !== digits(env.ALISE_PHONE),
    ),
  };
}

export type SmsDecision =
  { ok: true; to: string } | { ok: false; reason: string };

/** Who may receive an SMS now. Pure: the caller supplies a fresh policy. */
export function decideSms(
  policy: SmsPolicyState,
  env: NodeJS.ProcessEnv,
  audience: SmsAudience,
): SmsDecision {
  const transport = transportStatus(env);
  if (!transport.enabled)
    return { ok: false, reason: 'SMS transport is switched off.' };
  if (!transport.configured)
    return { ok: false, reason: 'SMS transport is not configured.' };
  if (policy.mode === 'off')
    return { ok: false, reason: 'SMS operations are OFF.' };
  if (audience === 'owner-test') {
    if (policy.mode !== 'rehearsal')
      return { ok: false, reason: 'Rehearsal sends need REHEARSAL mode.' };
    if (!transport.rehearsalConfigured)
      return {
        ok: false,
        reason: 'No verified owner test number is configured.',
      };
    return { ok: true, to: digits(env.SMS_REHEARSAL_TO)! };
  }
  if (policy.mode !== 'live')
    return { ok: false, reason: 'REHEARSAL mode: nothing real is sent.' };
  if (audience === 'arron') {
    const to = digits(env.ARRON_PHONE);
    return to && PHONE.test(to)
      ? { ok: true, to }
      : { ok: false, reason: 'No owner number is configured.' };
  }
  if (policy.holdActive)
    return { ok: false, reason: 'Communications to Alise are on hold.' };
  const to = digits(env.ALISE_PHONE);
  return to && PHONE.test(to)
    ? { ok: true, to }
    : { ok: false, reason: 'No member number is configured.' };
}

export type ProviderResult =
  | { state: 'accepted'; providerSid: string }
  | { state: 'refused'; error: string }
  | { state: 'rate-limited'; error: string }
  | { state: 'rejected'; error: string }
  | { state: 'uncertain'; error: string };

/**
 * The only function in the server that contacts Twilio. It re-reads the
 * policy from the database first; a refusal never reaches the provider.
 */
export async function deliverSms(
  db: Database,
  env: NodeJS.ProcessEnv,
  send: typeof fetch,
  message: { audience: SmsAudience; body: string; statusCallback?: string },
): Promise<ProviderResult> {
  const decision = decideSms(await readSmsPolicy(db), env, message.audience);
  if (!decision.ok) return { state: 'refused', error: decision.reason };
  if (message.body.length < 1 || message.body.length > 1600)
    return { state: 'rejected', error: 'The message is empty or too long.' };
  const params = new URLSearchParams({ To: decision.to, Body: message.body });
  if (env.TWILIO_MESSAGING_SERVICE_SID)
    params.set('MessagingServiceSid', env.TWILIO_MESSAGING_SERVICE_SID);
  else params.set('From', env.TWILIO_FROM!);
  if (message.statusCallback)
    params.set('StatusCallback', message.statusCallback);
  try {
    const response = await send(
      `https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(env.TWILIO_ACCOUNT_SID!)}/Messages.json`,
      {
        method: 'POST',
        headers: {
          authorization: `Basic ${btoa(`${env.TWILIO_ACCOUNT_SID}:${env.TWILIO_AUTH_TOKEN}`)}`,
          'content-type': 'application/x-www-form-urlencoded',
        },
        body: params,
        signal: AbortSignal.timeout(8000),
      },
    );
    const data = (await response.json().catch(() => null)) as {
      sid?: string;
      status?: string;
      code?: number;
    } | null;
    if (
      response.ok &&
      data?.sid &&
      /^SM[a-f0-9]{32}$/i.test(data.sid) &&
      data.status !== 'failed'
    )
      return { state: 'accepted', providerSid: data.sid };
    if (response.status === 429)
      return { state: 'rate-limited', error: 'Twilio rate limit.' };
    if (response.status >= 400 && response.status < 500)
      return {
        state: 'rejected',
        error: `Twilio rejected the request (${response.status}, code ${data?.code ?? 'unknown'}).`,
      };
    return {
      state: 'uncertain',
      error: 'Ambiguous provider response; reconcile before resending.',
    };
  } catch {
    return {
      state: 'uncertain',
      error: 'Provider request interrupted; reconcile before resending.',
    };
  }
}
