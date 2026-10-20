import { createHmac, timingSafeEqual } from 'node:crypto';
import type { ScheduledMessage } from '../../src/shared/concierge/types.ts';
import { BackendError, type Database } from './database.ts';
import { deliverSms, transportStatus, type SmsAudience } from './smsPolicy.ts';
interface ClaimedMessage extends ScheduledMessage {
  claimId: string;
}
/** Every outbox category goes to exactly one known phone. */
export function recipientFor(
  category: ScheduledMessage['category'],
  env: NodeJS.ProcessEnv,
): string | undefined {
  if (category === 'scheduled-alise' || category === 'correspondence-alise')
    return env.ALISE_PHONE;
  if (category === 'transactional-arron' || category === 'correspondence-arron')
    return env.ARRON_PHONE;
  return undefined;
}
/**
 * The every-minute outbox worker. Claims one message the SMS policy allows
 * (mode LIVE; for Alise also the released hold and a post-LIVE approval —
 * `ttc_sms_claim`), then sends it through `deliverSms`, which re-reads the
 * policy immediately before Twilio. If the policy changed in between, the
 * message is put back unsent (`system-sms-unclaim`). ADR-022.
 */
export async function processMessages(
  db: Database,
  env: NodeJS.ProcessEnv,
  send: typeof fetch = fetch,
): Promise<{ processed: number }> {
  const transport = transportStatus(env);
  // The transport must be available; it never authorises anything itself.
  if (!transport.enabled) return { processed: 0 };
  if (!transport.configured || !env.CONCIERGE_SITE_URL)
    throw new BackendError('not-configured');
  let processed = 0;
  // At most one eight-second request, safely inside Netlify's scheduler budget.
  for (let n = 0; n < 1; n++) {
    const item = await db.action<ClaimedMessage | null>(
      null,
      'system',
      'system-sms-claim',
    );
    if (!item) break;
    const audience = audienceFor(item.category);
    if (!audience) {
      await db.action(null, 'system', 'system-message-result', {
        id: item.id,
        claimId: item.claimId,
        state: 'failed',
        error: 'No recipient is defined for this message category.',
      });
      processed++;
      continue;
    }
    const sent = await deliverSms(db, env, send, {
      audience,
      body: item.body,
      statusCallback: `${env.CONCIERGE_SITE_URL.replace(/\/$/, '')}/api/v1/twilio/status?messageId=${item.id}&claimId=${item.claimId}`,
    });
    if (sent.state === 'refused') {
      await db.action(null, 'system', 'system-sms-unclaim', {
        id: item.id,
        claimId: item.claimId,
        reason: `Not sent: ${sent.error}`,
      });
      continue;
    }
    const result =
      sent.state === 'accepted'
        ? { state: 'accepted', providerSid: sent.providerSid }
        : sent.state === 'rate-limited'
          ? { state: 'approved', error: 'Twilio rate limit; retry scheduled.' }
          : sent.state === 'rejected'
            ? { state: 'failed', error: sent.error }
            : { state: 'uncertain', error: sent.error };
    await db.action(null, 'system', 'system-message-result', {
      id: item.id,
      claimId: item.claimId,
      ...result,
    });
    processed++;
  }
  return { processed };
}

/** Which policy audience an outbox category belongs to. */
export function audienceFor(
  category: ScheduledMessage['category'],
): SmsAudience | undefined {
  if (category === 'scheduled-alise' || category === 'correspondence-alise')
    return 'alise';
  if (category === 'transactional-arron' || category === 'correspondence-arron')
    return 'arron';
  return undefined;
}
export function validTwilioSignature(
  url: string,
  params: URLSearchParams,
  signature: string | null,
  authToken: string,
): boolean {
  if (!signature) return false;
  // Twilio sorts form parameter names; the callback URL must match byte for byte.
  const signed =
    url +
    [...new Set(params.keys())]
      .sort()
      .map((k) => k + [...new Set(params.getAll(k))].sort().join(''))
      .join('');
  const expected = createHmac('sha1', authToken)
    .update(signed)
    .digest('base64');
  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}
export async function statusCallback(
  request: Request,
  db: Database,
  env: NodeJS.ProcessEnv,
): Promise<Response> {
  if (!env.TWILIO_AUTH_TOKEN || !env.CONCIERGE_SITE_URL)
    throw new BackendError('not-configured');
  const url = new URL(request.url);
  const raw = await request.text();
  if (raw.length > 16384) throw new BackendError('invalid');
  const params = new URLSearchParams(raw);
  const canonical =
    env.CONCIERGE_SITE_URL.replace(/\/$/, '') + url.pathname + url.search;
  if (
    !validTwilioSignature(
      canonical,
      params,
      request.headers.get('x-twilio-signature'),
      env.TWILIO_AUTH_TOKEN,
    )
  )
    throw new BackendError('forbidden');
  const id = url.searchParams.get('messageId');
  const claimId = url.searchParams.get('claimId');
  const sid = params.get('MessageSid');
  const state = params.get('MessageStatus');
  if (
    !claimId ||
    !/^[a-f0-9-]{36}$/i.test(claimId) ||
    !id ||
    !/^[a-f0-9-]{36}$/i.test(id) ||
    !sid ||
    !/^SM[a-f0-9]{32}$/i.test(sid) ||
    !state ||
    ![
      'accepted',
      'scheduled',
      'queued',
      'sending',
      'sent',
      'delivered',
      'undelivered',
      'failed',
      'canceled',
    ].includes(state)
  )
    throw new BackendError('invalid');
  await db.action(null, 'system', 'system-message-callback', {
    id,
    claimId,
    providerSid: sid,
    state,
    error: params.get('ErrorCode'),
  });
  return new Response(null, {
    status: 204,
    headers: { 'cache-control': 'no-store' },
  });
}
