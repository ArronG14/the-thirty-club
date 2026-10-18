/**
 * The website's client for the concierge service. Every call resolves to a
 * result; nothing throws. A failed call is reported as failed and never
 * turned into success.
 */
import type {
  ActivateRequest,
  ActivateResponse,
  ApiErrorBody,
  ConciergeState,
  RedeemRequest,
  RedeemResponse,
} from '../domain/contract';

export type ApiFailure =
  /** The device reports no connection. */
  | { ok: false; kind: 'offline' }
  /** The request did not complete (no answer, timeout). */
  | { ok: false; kind: 'network' }
  /** The service answered with an error. */
  | { ok: false; kind: 'http'; status: number; body: ApiErrorBody | null };

export type ApiResult<T> = { ok: true; data: T } | ApiFailure;

export interface ConciergeApi {
  state(session?: string): Promise<ApiResult<ConciergeState>>;
  activate(
    request: ActivateRequest,
    session?: string,
  ): Promise<ApiResult<ActivateResponse>>;
  redeem(
    request: RedeemRequest,
    session: string,
  ): Promise<ApiResult<RedeemResponse>>;
}

const TIMEOUT_MS = 15_000;

async function call<T>(
  path: string,
  init: { method: 'GET' | 'POST'; body?: unknown; session?: string },
): Promise<ApiResult<T>> {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    return { ok: false, kind: 'offline' };
  }
  const headers: Record<string, string> = { accept: 'application/json' };
  if (init.session) headers.authorization = `Bearer ${init.session}`;
  if (init.body !== undefined) headers['content-type'] = 'application/json';
  let response: Response;
  try {
    response = await fetch(path, {
      method: init.method,
      headers,
      cache: 'no-store',
      ...(init.body !== undefined ? { body: JSON.stringify(init.body) } : {}),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch {
    return { ok: false, kind: 'network' };
  }
  const type = response.headers.get('content-type') ?? '';
  const data: unknown = type.includes('application/json')
    ? await response.json().catch(() => null)
    : null;
  if (response.ok && data !== null) return { ok: true, data: data as T };
  return {
    ok: false,
    kind: 'http',
    status: response.status,
    body:
      data && typeof data === 'object' && 'error' in data
        ? (data as ApiErrorBody)
        : null,
  };
}

export const httpConciergeApi: ConciergeApi = {
  state: (session) =>
    call('/api/concierge/state', {
      method: 'GET',
      ...(session ? { session } : {}),
    }),
  activate: (request, session) =>
    call('/api/concierge/activate', {
      method: 'POST',
      body: request,
      ...(session ? { session } : {}),
    }),
  redeem: (request, session) =>
    call('/api/concierge/redeem', { method: 'POST', body: request, session }),
};

/** A short random key; stable across retries of one redemption. */
export function newIdempotencyKey(): string {
  const bytes = new Uint8Array(12);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}
