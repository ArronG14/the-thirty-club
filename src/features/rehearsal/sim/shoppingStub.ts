/**
 * REHEARSAL ONLY. The browser simulation's stand-in for
 * `netlify/concierge/shopping.ts`, aliased in for the browser build so the
 * real module (and its hidden ceiling) never reaches a public bundle.
 * Everything is identical except that rehearsal applies NO ceiling: any
 * clear amount is accepted. The real limit stays on the server.
 */
import { IDEMPOTENCY_PATTERN } from '../../concierge/domain/contract';
import type { Realm } from '../../concierge/domain/session';
import type { ServiceDeps } from '../../../../netlify/concierge/service';

export const OVER_AUTHORITY_MESSAGE =
  'My apologies, Madam. I’m afraid that particular sum exceeds my current authorisation. Might I suggest a slightly more modest arrangement?';
export const UNCLEAR_AMOUNT_MESSAGE =
  'Forgive me, Madam, I did not quite catch the sum. Might you state it once more?';

export interface ShoppingRecord {
  amountPence: number;
  requestedAt: string;
  idempotencyKey: string;
  /** True only once the SMS to Arron was accepted by Twilio. */
  notified: boolean;
}

export type PublicShopping =
  | { status: 'available' }
  | { status: 'awaiting-settlement'; amountPence: number; requestedAt: string };

export const shoppingKey = (realm: Realm) => `${realm}/shopping/privilege`;

/** "75", "£75", "75.5", "1,000.00" → integer pence; null when unusable. */
export function parseAmountPence(input: unknown): number | null {
  if (typeof input !== 'string' && typeof input !== 'number') return null;
  const text = String(input).trim().replace(/^£\s*/, '').replace(/,/g, '');
  if (!/^\d{1,9}(\.\d{1,2})?$/.test(text)) return null;
  const [pounds = '0', fraction = ''] = text.split('.');
  const pence = Number(pounds) * 100 + Number(fraction.padEnd(2, '0'));
  return Number.isSafeInteger(pence) && pence > 0 ? pence : null;
}

export function formatPounds(pence: number): string {
  return `£${(pence / 100).toFixed(2)}`;
}

export function shoppingNotification(pence: number, realm: Realm): string {
  const body = `THE THIRTY CLUB — SHOPPING REQUEST\nMadam has requested ${formatPounds(pence)} through her Shopping Privilege.\nPlease arrange settlement.`;
  return realm === 'rehearsal' ? `[TEST — NOT REAL]\n${body}` : body;
}

export function publicShopping(
  record: ShoppingRecord | undefined,
): PublicShopping {
  return record?.notified
    ? {
        status: 'awaiting-settlement',
        amountPence: record.amountPence,
        requestedAt: record.requestedAt,
      }
    : { status: 'available' };
}

export type ShoppingOutcome =
  | { status: 201 | 200; body: PublicShopping & { duplicate: boolean } }
  | { status: 400 | 409 | 422 | 502 | 503; error: string; message: string };

export async function readShopping(
  deps: ServiceDeps,
  realm: Realm,
): Promise<PublicShopping> {
  const entry = await deps.store.get<ShoppingRecord>(shoppingKey(realm));
  return publicShopping(entry?.value);
}

export async function requestShopping(
  deps: ServiceDeps,
  realm: Realm,
  input: { amount: unknown; idempotencyKey: unknown },
): Promise<ShoppingOutcome> {
  if (
    typeof input.idempotencyKey !== 'string' ||
    !IDEMPOTENCY_PATTERN.test(input.idempotencyKey)
  ) {
    return { status: 400, error: 'invalid', message: UNCLEAR_AMOUNT_MESSAGE };
  }
  const amountPence = parseAmountPence(input.amount);
  if (amountPence === null) {
    return { status: 400, error: 'invalid', message: UNCLEAR_AMOUNT_MESSAGE };
  }
  const to = deps.config.arronPhone;
  if (!to || !deps.channels.smsConfigured) {
    return {
      status: 503,
      error: 'not-configured',
      message:
        'I cannot reach the club’s office just now, Madam. Do try again shortly.',
    };
  }

  const key = shoppingKey(realm);
  const record: ShoppingRecord = {
    amountPence,
    requestedAt: new Date(deps.clock()).toISOString(),
    idempotencyKey: input.idempotencyKey,
    notified: false,
  };
  if (!(await deps.store.create(key, record))) {
    const existing = await deps.store.get<ShoppingRecord>(key);
    if (!existing) {
      return { status: 502, error: 'server', message: 'Please try again.' };
    }
    if (existing.value.notified) {
      return existing.value.idempotencyKey === input.idempotencyKey
        ? {
            status: 200,
            body: { ...publicShopping(existing.value), duplicate: true },
          }
        : {
            status: 409,
            error: 'already-redeemed',
            message: 'This privilege has already been taken up, Madam.',
          };
    }
    // An earlier attempt never reached Arron: this one takes its place.
    if (!(await deps.store.replace(key, record, existing.etag))) {
      return {
        status: 409,
        error: 'in-progress',
        message: 'Your request is being attended to, Madam.',
      };
    }
  }

  const sent = await deps.channels.sms(
    to,
    shoppingNotification(amountPence, realm),
  );
  if (!sent.ok) {
    deps.log?.('shopping-notify-failed', { realm, error: sent.error });
    // Not accepted: leave nothing behind, so a retry is possible.
    await deps.store.remove(key);
    return {
      status: 502,
      error: 'notify-failed',
      message:
        'I cannot reach the club’s office just now, Madam. Do try again in a moment.',
    };
  }
  const confirmed: ShoppingRecord = { ...record, notified: true };
  await deps.store.put(key, confirmed);
  return {
    status: 201,
    body: { ...publicShopping(confirmed), duplicate: false },
  };
}
