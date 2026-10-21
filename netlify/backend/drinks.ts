/**
 * The drinks privileges (ADR-024): her two balances (airport, Jamaica), her
 * requests (each queues an SMS to the owner in the same transaction) and the
 * owner's grants. The database decides every balance (`ttc_drinks_action`).
 */
import type { Session } from '../../src/shared/concierge/types.ts';
import {
  DRINK_NOTIFICATIONS,
  isDrinkKind,
  MAX_BEVERAGE_LENGTH,
} from '../../src/shared/drinks/templates.ts';
import { BackendError, type Database } from './database.ts';
import * as v from './validation.ts';

interface Context {
  route: string;
  body: Record<string, unknown>;
  session: Session;
  db: Database;
}

// Control characters other than newline never reach an SMS.
// eslint-disable-next-line no-control-regex
const controls = /[\u0000-\u0009\u000B-\u001F\u007F]/g;

export function beverageText(value: unknown): string {
  if (typeof value !== 'string') v.invalid();
  const text = value.replace(/\r\n?/g, '\n').replace(controls, '').trim();
  if (text.length < 1 || text.length > MAX_BEVERAGE_LENGTH) v.invalid();
  return text;
}

/** The drinks routes, or undefined when the request is not one of them. */
export async function drinksRoute({ route, body, session, db }: Context) {
  const call = <T = Record<string, unknown>>(
    action: string,
    input: Record<string, unknown> = {},
  ) => db.action<T>(session.memberId, session.role, action, input);

  if (route === 'GET /drinks') {
    if (session.role !== 'member') throw new BackendError('forbidden');
    return { data: await call('drinks-status') };
  }
  if (route === 'POST /drinks/requests') {
    if (session.role !== 'member') throw new BackendError('forbidden');
    v.keys(body, ['kind', 'beverage', 'idempotencyKey']);
    if (!isDrinkKind(body.kind)) v.invalid();
    const data = await call<{ duplicate: boolean }>('drinks-request', {
      kind: body.kind,
      beverage: beverageText(body.beverage),
      idempotencyKey: v.idempotency(body.idempotencyKey),
      notification: DRINK_NOTIFICATIONS[body.kind],
    });
    return { data, status: data.duplicate ? 200 : 201, notify: true };
  }
  if (route === 'GET /owner/drinks') {
    if (session.role !== 'owner') throw new BackendError('forbidden');
    return { data: await call('owner-drinks') };
  }
  if (route === 'POST /owner/drinks/grants') {
    if (session.role !== 'owner') throw new BackendError('forbidden');
    v.keys(body, ['kind', 'quantity', 'note', 'idempotencyKey']);
    if (!isDrinkKind(body.kind)) v.invalid();
    const quantity = v.integer(body.quantity);
    if (quantity > 10) v.invalid();
    const note =
      body.note === undefined || body.note === null
        ? ''
        : v.text(body.note, 0, 300);
    const data = await call<{ duplicate: boolean }>('owner-drinks-grant', {
      kind: body.kind,
      quantity,
      note,
      idempotencyKey: v.idempotency(body.idempotencyKey),
    });
    return { data, status: data.duplicate ? 200 : 201 };
  }
  return undefined;
}
