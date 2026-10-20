/**
 * The Correspondence Desk's client. Every call resolves to a result and
 * nothing throws; a failed call is reported as failed and never turned into
 * a success. The server is the only authority on letters and their states.
 */
import type {
  ApiErrorCode,
  CorrespondenceSummary,
  LetterInput,
  LetterSms,
  MemberLetter,
  MemberLetterReply,
  OwnerCorrespondence,
  OwnerLetter,
  Session,
} from '../../../shared/concierge/types';
import { establishStanding } from '../../vault/client/vaultApi';

export type DeskFailure =
  | { ok: false; kind: 'offline' }
  | { ok: false; kind: 'network' }
  | {
      ok: false;
      kind: 'http';
      status: number;
      code: ApiErrorCode | null;
      message: string;
    };

export type DeskResult<T> = { ok: true; data: T } | DeskFailure;

const TIMEOUT_MS = 15_000;

export async function deskRequest<T>(
  path: string,
  init: {
    method?: 'GET' | 'POST' | 'PATCH';
    body?: unknown;
    headers?: Record<string, string>;
  } = {},
): Promise<DeskResult<T>> {
  if (typeof navigator !== 'undefined' && navigator.onLine === false)
    return { ok: false, kind: 'offline' };
  const method = init.method ?? (init.body === undefined ? 'GET' : 'POST');
  let response: Response;
  try {
    response = await fetch(`/api/v1${path}`, {
      method,
      credentials: 'same-origin',
      cache: 'no-store',
      headers: {
        accept: 'application/json',
        ...(method !== 'GET'
          ? {
              'content-type': 'application/json',
              'x-concierge-request': '1',
            }
          : {}),
        ...init.headers,
      },
      ...(method !== 'GET' ? { body: JSON.stringify(init.body ?? {}) } : {}),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch {
    return { ok: false, kind: 'network' };
  }
  let data: unknown = null;
  try {
    data = await response.json();
  } catch {
    // A non-JSON answer (an HTML error page, a proxy) is a failure.
  }
  if (response.ok && data !== null) return { ok: true, data: data as T };
  const body = (data ?? {}) as { error?: ApiErrorCode; message?: string };
  return {
    ok: false,
    kind: 'http',
    status: response.status,
    code: body.error ?? null,
    message: body.message ?? 'The Butler is momentarily unavailable.',
  };
}

export function failureText(failure: DeskFailure): string {
  if (failure.kind === 'offline')
    return 'Your device appears to be offline, Madam. Your correspondence will be here once you are connected.';
  if (failure.kind === 'network')
    return 'The club’s office did not answer. Please try again in a moment.';
  if (failure.code === 'rate-limited')
    return 'Forgive me, Madam — a great many messages in quick succession. Might I ask you to wait a few minutes?';
  return failure.message;
}

/* ---------- Member ---------- */

export type MemberStanding =
  | { kind: 'member' }
  | { kind: 'owner' }
  | { kind: 'needs-membership' }
  | { kind: 'unavailable'; failure: DeskFailure };

const INVITATION_FRAGMENT = /^#invitation=([A-Za-z0-9_-]{43})$/;

/**
 * An owner-issued invitation link (`/correspondence#invitation=<token>`)
 * is exchanged once for a member session, and removed from the address bar
 * whatever the outcome so the token is never kept or shared further.
 */
export async function consumeInvitationFragment(): Promise<
  'none' | 'accepted' | 'refused'
> {
  const match = INVITATION_FRAGMENT.exec(window.location.hash);
  if (!match) return 'none';
  window.history.replaceState(
    window.history.state,
    '',
    window.location.pathname + window.location.search,
  );
  const result = await deskRequest<{ session: Session }>('/auth/member', {
    body: { token: match[1] },
  });
  return result.ok ? 'accepted' : 'refused';
}

/** Who is reading: a member cookie, or the membership this device holds. */
export async function memberStanding(): Promise<MemberStanding> {
  const standing = await establishStanding();
  if (standing.kind !== 'unavailable') return standing;
  return { kind: 'unavailable', failure: standing.failure };
}

export const correspondenceSummary = () =>
  deskRequest<CorrespondenceSummary>('/correspondence/summary');

export const listLetters = () =>
  deskRequest<{ letters: MemberLetter[] }>('/correspondence');

export const openLetter = (id: string) =>
  deskRequest<{ letter: MemberLetter }>(`/correspondence/${id}/open`, {
    body: {},
  });

export const thankButler = (id: string) =>
  deskRequest<{ letter: MemberLetter; duplicate: boolean }>(
    `/correspondence/${id}/thank`,
    { body: {} },
  );

export const sendWord = (id: string, body: string, idempotencyKey: string) =>
  deskRequest<{ reply: MemberLetterReply; duplicate: boolean }>(
    `/correspondence/${id}/reply`,
    { body: { body, idempotencyKey } },
  );

/* ---------- Owner (the Butler's Office) ---------- */

export const ownerCorrespondence = () =>
  deskRequest<OwnerCorrespondence>('/owner/correspondence');

export const saveLetter = (input: LetterInput, id?: string) =>
  deskRequest<{ letter: OwnerLetter }>(
    id ? `/owner/correspondence/${id}` : '/owner/correspondence',
    { method: id ? 'PATCH' : 'POST', body: input },
  );

export type LetterCommand = 'schedule' | 'send-now' | 'cancel' | 'delete';

export const commandLetter = (id: string, command: LetterCommand) =>
  deskRequest<{ letter?: OwnerLetter; deleted?: string }>(
    `/owner/correspondence/${id}/${command}`,
    { body: {} },
  );

export const retrySms = (messageId: string) =>
  deskRequest<{ sms: LetterSms }>(
    `/owner/correspondence/messages/${messageId}/retry`,
    { body: {} },
  );
