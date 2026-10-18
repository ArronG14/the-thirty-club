/**
 * The vault's client. Every call resolves to a result and nothing throws; a
 * failed call is reported as failed, never turned into an opening. The
 * server is the only authority on state, clues and locations.
 */
import type {
  ApiErrorCode,
  MemberVaultList,
  OwnerVault,
  OwnerVaultList,
  Session,
  VaultInput,
  VaultOpenInput,
  VaultOpenResult,
  VaultPreview,
  VaultVerifyResult,
} from '../../../shared/concierge/types';
import { activeSession } from '../../concierge/client/sessionStore';

export type VaultFailure =
  | { ok: false; kind: 'offline' }
  | { ok: false; kind: 'network' }
  | {
      ok: false;
      kind: 'http';
      status: number;
      code: ApiErrorCode | null;
      message: string;
    };

export type VaultResult<T> = { ok: true; data: T } | VaultFailure;

const TIMEOUT_MS = 15_000;

export async function vaultRequest<T>(
  path: string,
  init: {
    method?: 'GET' | 'POST' | 'PATCH';
    body?: unknown;
    headers?: Record<string, string>;
  } = {},
): Promise<VaultResult<T>> {
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
    message: body.message ?? 'The vault is momentarily unavailable.',
  };
}

export type Standing =
  | { kind: 'member' }
  | { kind: 'owner' }
  | { kind: 'needs-membership' }
  | { kind: 'unavailable'; failure: VaultFailure };

/**
 * Who is at the vault door. A member cookie is used as it stands; failing
 * that, the membership credential this device already presented (the card
 * or travel pass) is exchanged server-side for one. The physical vault key
 * is never treated as proof of identity.
 */
export async function establishStanding(): Promise<Standing> {
  const current = await vaultRequest<{ session: Session }>('/auth/session');
  if (current.ok)
    return { kind: current.data.session.role === 'owner' ? 'owner' : 'member' };
  if (current.kind !== 'http' || current.status !== 401)
    return { kind: 'unavailable', failure: current };
  const legacy = activeSession();
  if (!legacy || legacy.claims.realm !== 'live')
    return { kind: 'needs-membership' };
  const bridged = await vaultRequest<{ session: Session }>(
    '/auth/member/concierge',
    { body: {}, headers: { authorization: `Bearer ${legacy.token}` } },
  );
  if (bridged.ok) return { kind: 'member' };
  if (bridged.kind === 'http' && bridged.status < 500)
    return { kind: 'needs-membership' };
  return { kind: 'unavailable', failure: bridged };
}

export const listVaults = () => vaultRequest<MemberVaultList>('/vaults');

export const openVault = (input: VaultOpenInput) =>
  vaultRequest<VaultOpenResult>('/vaults/open', { body: input });

/* Owner (the Butler's Office and its rehearsal). */

export const ownerVaults = () => vaultRequest<OwnerVaultList>('/owner/vaults');

export const previewVault = (id: string) =>
  vaultRequest<VaultPreview>(`/owner/vaults/${id}/preview`);

export const verifyVaultKey = (input: VaultOpenInput) =>
  vaultRequest<VaultVerifyResult>('/owner/vaults/verify', { body: input });

export const saveVault = (input: VaultInput, id?: string) =>
  vaultRequest<{ vault: OwnerVault }>(
    id ? `/owner/vaults/${id}` : '/owner/vaults',
    { method: id ? 'PATCH' : 'POST', body: input },
  );

export type VaultCommand =
  'ready' | 'lock' | 'open' | 'rotate-credential' | 'rotate-code';

export const commandVault = (id: string, command: VaultCommand) =>
  vaultRequest<{ vault: OwnerVault }>(`/owner/vaults/${id}/${command}`, {
    body: {},
  });

export function failureText(failure: VaultFailure): string {
  if (failure.kind === 'offline')
    return 'Your device appears to be offline. The vault answers only when connected.';
  if (failure.kind === 'network')
    return 'The vault did not answer. Please try again in a moment.';
  return failure.message;
}
