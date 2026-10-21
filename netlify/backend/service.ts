/**
 * The Butler's Service routes (docs/BUTLERS_SERVICE.md): Alise's requests
 * from the service bell, Arron's responses to them, and his direct Butler
 * SMS. The database decides every state change (`ttc_service_action`). SMS
 * go through the existing outbox and are sent by the existing every-minute
 * round only while SMS_SENDING_ENABLED is true.
 */
import type { Session } from '../../src/shared/concierge/types.ts';
import {
  ARRON_REQUEST_NOTIFICATION,
  BUTLER_SMS_MAX_LENGTH,
  LETTER_TIMEZONES,
} from '../../src/shared/correspondence/templates.ts';
import { BackendError, type Database } from './database.ts';
import { replyText } from './correspondence.ts';
import * as v from './validation.ts';

// Control characters other than newline and tab never reach an SMS.
// eslint-disable-next-line no-control-regex
const controls = /[\u0000-\u0008\u000B-\u001F\u007F]/g;

function smsText(value: unknown): string {
  if (typeof value !== 'string') v.invalid();
  const text = value.replace(/\r\n?/g, '\n').replace(controls, '').trim();
  if (text.length < 1 || text.length > BUTLER_SMS_MAX_LENGTH) v.invalid();
  return text;
}

interface ServiceRouteContext {
  route: string;
  path: string;
  method: string;
  body: Record<string, unknown>;
  session: Session;
  db: Database;
  env: NodeJS.ProcessEnv;
}

const ID = '[A-Fa-f0-9-]{36}';

/** The service routes, or undefined when the request is not one of them. */
export async function serviceRoute({
  route,
  path,
  method,
  body,
  session,
  db,
  env,
}: ServiceRouteContext): Promise<
  { data: unknown; status?: number } | undefined
> {
  const call = <T = Record<string, unknown>>(
    action: string,
    input: Record<string, unknown> = {},
  ) => db.action<T>(session.memberId, session.role, action, input);
  const smsEnabled = env.SMS_SENDING_ENABLED === 'true';

  if (path === '/service/requests') {
    if (session.role !== 'member') throw new BackendError('forbidden');
    if (route === 'GET /service/requests')
      return { data: await call('service-requests') };
    if (method !== 'POST') return undefined;
    v.keys(body, ['body', 'idempotencyKey', 'purpose']);
    if (body.purpose !== undefined && body.purpose !== 'departure-introduction')
      v.invalid();
    const result = await call<{ duplicate: boolean }>('service-request', {
      body: replyText(body.body),
      idempotencyKey: v.idempotency(body.idempotencyKey),
      notification: ARRON_REQUEST_NOTIFICATION,
      ...(body.purpose === 'departure-introduction'
        ? { purpose: body.purpose }
        : {}),
    });
    return { data: result, status: result.duplicate ? 200 : 201 };
  }

  if (path === '/owner/requests' || path.startsWith('/owner/requests/')) {
    if (session.role !== 'owner') throw new BackendError('forbidden');
    if (route === 'GET /owner/requests')
      return {
        data: { ...(await call('owner-requests-list')), smsEnabled },
      };
    const match = new RegExp(
      `^/owner/requests/(${ID})/(sms|letter|resolve)$`,
    ).exec(path);
    if (!match || method !== 'POST') return undefined;
    const id = v.uuid(match[1]).toLowerCase();
    if (match[2] === 'resolve') {
      v.keys(body, ['resolved']);
      if (typeof body.resolved !== 'boolean') v.invalid();
      return {
        data: await call('owner-request-resolve', {
          id,
          resolved: body.resolved,
        }),
      };
    }
    if (match[2] === 'sms') {
      v.keys(body, ['body', 'idempotencyKey']);
      const result = await call<{ duplicate: boolean }>('owner-request-sms', {
        id,
        body: smsText(body.body),
        idempotencyKey: v.idempotency(body.idempotencyKey),
      });
      return { data: result, status: result.duplicate ? 200 : 201 };
    }
    v.keys(body, ['letterId', 'idempotencyKey']);
    const result = await call<{ duplicate: boolean }>('owner-request-letter', {
      id,
      letterId: v.uuid(body.letterId).toLowerCase(),
      idempotencyKey: v.idempotency(body.idempotencyKey),
    });
    return { data: result, status: result.duplicate ? 200 : 201 };
  }

  if (path === '/owner/butler-sms' || path.startsWith('/owner/butler-sms/')) {
    if (session.role !== 'owner') throw new BackendError('forbidden');
    if (route === 'GET /owner/butler-sms')
      return {
        data: { ...(await call('owner-direct-sms-list')), smsEnabled },
      };
    if (route === 'POST /owner/butler-sms') {
      v.keys(body, ['body', 'timezone', 'sendAt', 'idempotencyKey']);
      if (!LETTER_TIMEZONES.includes(body.timezone as never)) v.invalid();
      const result = await call<{ duplicate: boolean }>(
        'owner-direct-sms-create',
        {
          body: smsText(body.body),
          timezone: body.timezone,
          sendAt: v.instant(body.sendAt, true),
          idempotencyKey: v.idempotency(body.idempotencyKey),
        },
      );
      return { data: result, status: result.duplicate ? 200 : 201 };
    }
    const cancel = new RegExp(`^/owner/butler-sms/(${ID})/cancel$`).exec(path);
    if (!cancel || method !== 'POST') return undefined;
    v.keys(body, []);
    return {
      data: await call('owner-direct-sms-cancel', {
        id: v.uuid(cancel[1]).toLowerCase(),
      }),
    };
  }
  return undefined;
}
