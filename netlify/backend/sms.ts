import { createHmac, timingSafeEqual } from 'node:crypto';
import type { ScheduledMessage } from '../../src/shared/concierge/types.ts';
import { BackendError, type Database } from './database.ts';
interface ClaimedMessage extends ScheduledMessage {
  claimId: string;
}
export async function processMessages(
  db: Database,
  env: NodeJS.ProcessEnv,
  send: typeof fetch = fetch,
): Promise<{ processed: number }> {
  // This is deliberately opt-in. Tests inject a fake provider.
  if (env.SMS_SENDING_ENABLED !== 'true') return { processed: 0 };
  if (
    !env.TWILIO_ACCOUNT_SID ||
    !env.TWILIO_AUTH_TOKEN ||
    !env.TWILIO_MESSAGING_SERVICE_SID ||
    !env.CONCIERGE_SITE_URL ||
    !env.ALISE_PHONE ||
    !env.ARRON_PHONE
  )
    throw new BackendError('not-configured');
  let processed = 0;
  // At most one eight-second request, safely inside Netlify's scheduler budget.
  for (let n = 0; n < 1; n++) {
    const item = await db.action<ClaimedMessage | null>(
      null,
      'system',
      'system-message-claim',
    );
    if (!item) break;
    const to =
      item.category === 'scheduled-alise' ? env.ALISE_PHONE : env.ARRON_PHONE;
    let result: Record<string, unknown>;
    try {
      const response = await send(
        `https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(env.TWILIO_ACCOUNT_SID)}/Messages.json`,
        {
          method: 'POST',
          headers: {
            authorization: `Basic ${Buffer.from(`${env.TWILIO_ACCOUNT_SID}:${env.TWILIO_AUTH_TOKEN}`).toString('base64')}`,
            'content-type': 'application/x-www-form-urlencoded',
          },
          body: new URLSearchParams({
            To: to!,
            MessagingServiceSid: env.TWILIO_MESSAGING_SERVICE_SID,
            Body: item.body,
            StatusCallback: `${env.CONCIERGE_SITE_URL.replace(/\/$/, '')}/api/v1/twilio/status?messageId=${item.id}&claimId=${item.claimId}`,
          }),
          signal: AbortSignal.timeout(8000),
        },
      );
      const data = (await response.json().catch(() => null)) as {
        sid?: string;
        status?: string;
        code?: number;
      } | null;
      if (response.ok && data?.sid && /^SM[a-f0-9]{32}$/i.test(data.sid))
        result = { state: 'accepted', providerSid: data.sid };
      else if (response.status === 429)
        result = {
          state: 'approved',
          error: 'Twilio rate limit; retry scheduled.',
        };
      else if (response.status >= 400 && response.status < 500)
        result = {
          state: 'failed',
          error: `Twilio rejected request (${response.status}, code ${data?.code ?? 'unknown'}).`,
        };
      else
        result = {
          state: 'uncertain',
          error: 'Ambiguous provider response; reconcile before resending.',
        };
    } catch {
      result = {
        state: 'uncertain',
        error: 'Provider request interrupted; reconcile before resending.',
      };
    }
    await db.action(null, 'system', 'system-message-result', {
      id: item.id,
      claimId: item.claimId,
      ...result,
    });
    processed++;
  }
  return { processed };
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
