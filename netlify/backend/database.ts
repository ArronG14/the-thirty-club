import type { ApiErrorCode } from '../../src/shared/concierge/types.ts';
export class BackendError extends Error {
  constructor(
    readonly code: ApiErrorCode,
    readonly extra: Record<string, unknown> = {},
  ) {
    super(code);
  }
}
export interface Database {
  action<T = Record<string, unknown>>(
    actor: string | null,
    role: 'system' | 'owner' | 'member',
    action: string,
    input?: Record<string, unknown>,
  ): Promise<T>;
}
const codes = new Set<ApiErrorCode>([
  'invalid',
  'unauthorised',
  'forbidden',
  'not-found',
  'not-open',
  'expired',
  'already-redeemed',
  'idempotency-conflict',
  'insufficient-balance',
  'rate-limited',
  'conflict',
  'not-configured',
  'vault-locked',
  'credential-invalid',
  'server',
]);
/** Gift Vault actions live in their own RPC so `ttc_action` stays untouched. */
export const rpcFor = (action: string) =>
  /^(vault-|owner-vault-|system-vault-|system-member-bridge$)/.test(action)
    ? 'ttc_vault_action'
    : 'ttc_action';
export function database(
  env: NodeJS.ProcessEnv,
  send: typeof fetch = fetch,
): Database {
  const url = env.SUPABASE_URL;
  const key = env.SUPABASE_SERVICE_ROLE_KEY;
  return {
    async action<T>(
      actor: string | null,
      role: string,
      action: string,
      input = {},
    ): Promise<T> {
      if (!url || !key) throw new BackendError('not-configured');
      const response = await send(
        `${url.replace(/\/$/, '')}/rest/v1/rpc/${rpcFor(action)}`,
        {
          method: 'POST',
          headers: {
            apikey: key,
            authorization: `Bearer ${key}`,
            'content-type': 'application/json',
          },
          body: JSON.stringify({
            p_actor: actor,
            p_role: role,
            p_action: action,
            p_input: input,
          }),
          signal: AbortSignal.timeout(8000),
        },
      );
      const data = (await response.json()) as {
        message?: string;
        code?: string;
      };
      if (!response.ok) {
        if (codes.has(data.message as ApiErrorCode))
          throw new BackendError(data.message as ApiErrorCode);
        if (
          data.code?.startsWith('22') ||
          data.code === '23514' ||
          data.code === '23502'
        )
          throw new BackendError('invalid');
        if (data.code === '23505') throw new BackendError('conflict');
        throw new BackendError('server');
      }
      return data as T;
    },
  };
}
