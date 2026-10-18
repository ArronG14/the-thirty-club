/**
 * The contract between the website and the concierge service (`/api/*`).
 * Shared so both sides validate a redemption identically; the service's
 * validation is the one that counts.
 */
import {
  findPrivilege,
  type PrivilegeDefinition,
  type PrivilegeId,
} from './catalogue.ts';
import type { CredentialId } from './credentials.ts';
import type { Realm, Scope } from './session.ts';

/**
 * Whether Arron has actually been told. Only a confirmed delivery is
 * `delivered`; nothing on either side may invent it.
 */
export type DeliveryStatus =
  /** The notification provider confirmed delivery. */
  | 'delivered'
  /** Not yet delivered; the service keeps retrying. */
  | 'pending'
  /** Retries exhausted; the owner console offers a resend. */
  | 'failed'
  /** No notification provider is configured. */
  | 'unconfigured'
  /** Rehearsal redemption recorded without contacting a provider. */
  | 'simulated';

export interface PublicRedemption {
  privilegeId: PrivilegeId;
  redeemedAt: string;
  /** Choice id, when the privilege offers choices. */
  choice?: string;
  note?: string;
  delivery: DeliveryStatus;
}

export interface ConciergeState {
  /** The service's clock (virtual in rehearsal). */
  now: number;
  realm: Realm;
  scopes: Scope[];
  schedule: {
    departureOpensAt: number;
    privileges: Record<PrivilegeId, number>;
  };
  activations: Partial<Record<CredentialId, string>>;
  redemptions: Partial<Record<PrivilegeId, PublicRedemption>>;
}

export interface ActivateRequest {
  token?: string;
  code?: string;
}

export interface ActivateResponse {
  session: string;
  credential: CredentialId;
  activatedAt: string;
  state: ConciergeState;
}

export interface RedeemRequest {
  privilegeId: PrivilegeId;
  idempotencyKey: string;
  choice?: string;
  note?: string;
}

export interface RedeemResponse {
  redemption: PublicRedemption;
  /** True when this exact request had already been processed. */
  duplicate: boolean;
}

export type ErrorCode =
  | 'invalid'
  | 'unauthorised'
  | 'forbidden'
  | 'not-found'
  | 'unrecognised'
  | 'not-released'
  | 'already-redeemed'
  | 'rate-limited'
  | 'not-configured'
  | 'server';

export interface ApiErrorBody {
  error: ErrorCode;
  message: string;
  /** Present on `already-redeemed`: the record that stands. */
  redemption?: PublicRedemption;
}

export const NOTE_MAX = 280;
export const IDEMPOTENCY_PATTERN = /^[A-Za-z0-9_-]{8,64}$/;

/** Trims, strips control characters and caps a free-text note. */
export function cleanNote(input: unknown): string | undefined {
  if (typeof input !== 'string') return undefined;
  const cleaned = input
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u001f\u007f-\u009f]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, NOTE_MAX);
  return cleaned === '' ? undefined : cleaned;
}

export type RedemptionCheck =
  | {
      ok: true;
      privilege: PrivilegeDefinition;
      choice?: string;
      note?: string;
    }
  | { ok: false; message: string };

export function checkRedemption(input: {
  privilegeId: PrivilegeId;
  choice?: unknown;
  note?: unknown;
}): RedemptionCheck {
  const privilege = findPrivilege(input.privilegeId);
  if (privilege.kind !== 'request') {
    return { ok: false, message: 'This correspondence cannot be redeemed.' };
  }
  const note = cleanNote(input.note);
  if (note && !privilege.note) {
    return { ok: false, message: 'This privilege takes no note.' };
  }
  let choice: string | undefined;
  if (privilege.choices) {
    if (typeof input.choice !== 'string') {
      return { ok: false, message: 'Please choose one of the options.' };
    }
    if (!privilege.choices.some((option) => option.id === input.choice)) {
      return { ok: false, message: 'That option is not available.' };
    }
    choice = input.choice;
  } else if (input.choice !== undefined) {
    return { ok: false, message: 'This privilege offers no options.' };
  }
  return {
    ok: true,
    privilege,
    ...(choice ? { choice } : {}),
    ...(note ? { note } : {}),
  };
}
