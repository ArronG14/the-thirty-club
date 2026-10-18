import type { Entry, KvStore } from '../concierge/store.ts';
import { BackendError } from './database.ts';
export function postgresLegacyStore(
  env: NodeJS.ProcessEnv,
  send: typeof fetch = fetch,
): KvStore {
  async function rpc<T>(
    operation: string,
    key: string,
    value: unknown = null,
    etag: string | null = null,
  ): Promise<T> {
    if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY)
      throw new BackendError('not-configured');
    const response = await send(
      `${env.SUPABASE_URL.replace(/\/$/, '')}/rest/v1/rpc/ttc_legacy_store`,
      {
        method: 'POST',
        headers: {
          apikey: env.SUPABASE_SERVICE_ROLE_KEY,
          authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          p_operation: operation,
          p_key: key,
          p_value: value,
          p_etag: etag,
        }),
        signal: AbortSignal.timeout(8000),
      },
    );
    if (!response.ok) throw new BackendError('server');
    return (await response.json()) as T;
  }
  return {
    get: <T>(key: string) => rpc<Entry<T> | null>('get', key),
    create: (key, value) => rpc<boolean>('create', key, value),
    replace: (key, value, etag) => rpc<boolean>('replace', key, value, etag),
    put: async (key, value) => {
      await rpc('put', key, value);
    },
    list: (prefix) => rpc<string[]>('list', prefix),
    remove: async (key) => {
      await rpc('remove', key);
    },
  };
}
