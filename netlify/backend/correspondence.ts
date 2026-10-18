/**
 * The Correspondence Desk routes (docs/CORRESPONDENCE_DESK.md). The database
 * decides every state change (`ttc_correspondence_action`); this layer
 * validates input and supplies the Butler's centrally defined words. SMS go
 * through the existing outbox and are sent by the existing every-minute
 * round only while SMS_SENDING_ENABLED is true.
 */
import type { Session } from '../../src/shared/concierge/types.ts';
import {
  ARRON_NOTIFICATION,
  INVITATION_TEMPLATES,
  LETTER_BODY_MAX_LENGTH,
  LETTER_TIMEZONES,
  REPLY_MAX_LENGTH,
  THANKS_RESPONSE,
} from '../../src/shared/correspondence/templates.ts';
import { BackendError, type Database } from './database.ts';
import * as v from './validation.ts';

/** Every correspondence call carries the invitations, for lazy publication. */
const withTemplates = (input: Record<string, unknown> = {}) => ({
  ...input,
  templates: INVITATION_TEMPLATES,
});

/** Publishes due letters and queues their invitations. Run every minute. */
export async function publishDueLetters(
  db: Database,
): Promise<{ published: number }> {
  return db.action<{ published: number }>(
    null,
    'system',
    'system-correspondence-publish',
    withTemplates(),
  );
}

const lines = (value: string) => value.replace(/\r\n?/g, '\n');
// Control characters other than newline and tab never reach a letter or SMS.
// eslint-disable-next-line no-control-regex
const controls = /[\u0000-\u0008\u000B-\u001F\u007F]/g;

function letterInput(body: Record<string, unknown>) {
  v.keys(body, ['title', 'salutation', 'body', 'timezone', 'deliverAt']);
  const title = v.text(body.title, 1, 120).replace(controls, '');
  const salutation = v.text(body.salutation, 1, 80).replace(controls, '');
  if (typeof body.body !== 'string') v.invalid();
  const text = lines(body.body).replace(controls, '').trimEnd();
  if (text.length > LETTER_BODY_MAX_LENGTH) v.invalid();
  if (!LETTER_TIMEZONES.includes(body.timezone as never)) v.invalid();
  if (!title || !salutation) v.invalid();
  return {
    title,
    salutation,
    body: text,
    timezone: body.timezone,
    deliverAt: v.instant(body.deliverAt, true),
  };
}

/** Her exact words, minus anything that is not text. */
export function replyText(value: unknown): string {
  if (typeof value !== 'string') v.invalid();
  const text = lines(value)
    .replace(controls, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  if (text.length < 1 || text.length > REPLY_MAX_LENGTH) v.invalid();
  return text;
}

interface CorrespondenceRouteContext {
  route: string;
  path: string;
  method: string;
  body: Record<string, unknown>;
  session: Session;
  db: Database;
  env: NodeJS.ProcessEnv;
}

const ID = '[A-Fa-f0-9-]{36}';

/** The Desk's routes, or undefined when the request is not one of them. */
export async function correspondenceRoute({
  route,
  path,
  method,
  body,
  session,
  db,
  env,
}: CorrespondenceRouteContext): Promise<
  { data: unknown; status?: number } | undefined
> {
  const call = <T = Record<string, unknown>>(
    action: string,
    input: Record<string, unknown> = {},
  ) =>
    db.action<T>(session.memberId, session.role, action, withTemplates(input));

  if (path === '/correspondence' || path.startsWith('/correspondence/')) {
    if (session.role !== 'member') throw new BackendError('forbidden');
    if (route === 'GET /correspondence')
      return { data: await call('correspondence-list') };
    if (route === 'GET /correspondence/summary')
      return { data: await call('correspondence-summary') };
    const match = new RegExp(
      `^/correspondence/(${ID})/(open|thank|reply)$`,
    ).exec(path);
    if (!match || method !== 'POST') return undefined;
    const id = v.uuid(match[1]).toLowerCase();
    if (match[2] === 'open') {
      v.keys(body, []);
      return { data: await call('correspondence-open', { id }) };
    }
    if (match[2] === 'thank') {
      v.keys(body, []);
      const result = await call<{ duplicate: boolean }>(
        'correspondence-thank',
        { id, response: THANKS_RESPONSE },
      );
      return { data: result, status: result.duplicate ? 200 : 201 };
    }
    v.keys(body, ['body', 'idempotencyKey']);
    const result = await call<{ duplicate: boolean }>('correspondence-reply', {
      id,
      body: replyText(body.body),
      idempotencyKey: v.idempotency(body.idempotencyKey),
      notification: ARRON_NOTIFICATION,
    });
    return { data: result, status: result.duplicate ? 200 : 201 };
  }

  if (
    path !== '/owner/correspondence' &&
    !path.startsWith('/owner/correspondence/')
  )
    return undefined;
  if (session.role !== 'owner') throw new BackendError('forbidden');
  if (route === 'GET /owner/correspondence')
    return {
      data: {
        ...(await call('owner-correspondence-list')),
        smsEnabled: env.SMS_SENDING_ENABLED === 'true',
      },
    };
  if (route === 'POST /owner/correspondence')
    return {
      data: await call('owner-correspondence-create', letterInput(body)),
      status: 201,
    };
  const retry = new RegExp(
    `^/owner/correspondence/messages/(${ID})/retry$`,
  ).exec(path);
  if (retry && method === 'POST') {
    v.keys(body, []);
    return {
      data: await call('owner-correspondence-sms-retry', {
        messageId: v.uuid(retry[1]).toLowerCase(),
      }),
    };
  }
  const match = new RegExp(
    `^/owner/correspondence/(${ID})(?:/(schedule|send-now|cancel|delete))?$`,
  ).exec(path);
  if (!match) return undefined;
  const id = v.uuid(match[1]).toLowerCase();
  if (method === 'PATCH' && !match[2])
    return {
      data: await call('owner-correspondence-update', {
        ...letterInput(body),
        id,
      }),
    };
  if (method !== 'POST' || !match[2]) return undefined;
  v.keys(body, []);
  return { data: await call(`owner-correspondence-${match[2]}`, { id }) };
}
