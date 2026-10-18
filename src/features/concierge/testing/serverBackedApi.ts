/**
 * TESTS ONLY. A ConciergeApi that runs the real service handlers in memory
 * (memory store, fake channels, adjustable clock), so component tests
 * exercise the whole path without a network or any real notification.
 */
import { createConciergeApi } from '../../../../netlify/concierge/api';
import { readConfig } from '../../../../netlify/concierge/config';
import { memoryStore } from '../../../../netlify/concierge/store';
import { fakeChannels, TEST_ENV } from '../../../../netlify/concierge/testing';
import type { ApiResult, ConciergeApi } from '../client/api';
import type { ApiErrorBody } from '../domain/contract';

export function serverBackedApi(clock: () => number) {
  const store = memoryStore();
  const channels = fakeChannels(clock);
  const handle = createConciergeApi({
    store,
    config: readConfig(TEST_ENV),
    channels,
    clock,
  });
  let offline = false;

  async function call<T>(
    method: 'GET' | 'POST',
    path: string,
    body?: unknown,
    session?: string,
  ): Promise<ApiResult<T>> {
    if (offline) return { ok: false, kind: 'network' };
    const headers: Record<string, string> = {};
    if (session) headers.authorization = `Bearer ${session}`;
    const response = await handle(
      new Request(`https://club.example${path}`, {
        method,
        headers,
        ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
      }),
      '203.0.113.9',
    );
    const data = (await response.json()) as unknown;
    if (response.ok) return { ok: true, data: data as T };
    return {
      ok: false,
      kind: 'http',
      status: response.status,
      body: data as ApiErrorBody,
    };
  }

  const api: ConciergeApi = {
    state: (session) => call('GET', '/api/concierge/state', undefined, session),
    activate: (request, session) =>
      call('POST', '/api/concierge/activate', request, session),
    redeem: (request, session) =>
      call('POST', '/api/concierge/redeem', request, session),
  };

  return {
    api,
    store,
    channels,
    setOffline(value: boolean) {
      offline = value;
    },
  };
}
