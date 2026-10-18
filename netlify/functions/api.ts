import { blobStore } from '../concierge/blobStore.ts';
import { createConciergeApi } from '../concierge/api.ts';
import { createChannels } from '../concierge/channels.ts';
import { readConfig } from '../concierge/config.ts';

interface NetlifyContext {
  ip?: string;
}

/** The concierge API (see netlify/concierge/api.ts for every route). */
export default async function api(
  request: Request,
  context: NetlifyContext,
): Promise<Response> {
  const config = readConfig(process.env);
  const handle = createConciergeApi({
    store: blobStore(),
    config,
    channels: createChannels(config, fetch),
    clock: () => Date.now(),
    log: (event, detail) => console.log(`[concierge] ${event}`, detail ?? {}),
  });
  const ip =
    context.ip ?? request.headers.get('x-nf-client-connection-ip') ?? 'unknown';
  return handle(request, ip);
}

export const config = { path: '/api/*' };
