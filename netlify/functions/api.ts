import { createBackendApi } from '../backend/api.ts';
import { database } from '../backend/database.ts';
import { blobStore } from '../concierge/blobStore.ts';
import { postgresLegacyStore } from '../backend/legacyStore.ts';
import { createConciergeApi } from '../concierge/api.ts';
import { createChannels } from '../concierge/channels.ts';
import {
  legacyCommunicationsHeld,
  legacySmsBoundary,
} from '../backend/legacySms.ts';
import { readConfig } from '../concierge/config.ts';

interface NetlifyContext {
  ip?: string;
}

/** The concierge API (see netlify/concierge/api.ts for every route). */
export default async function api(
  request: Request,
  context: NetlifyContext,
): Promise<Response> {
  if (new URL(request.url).pathname.startsWith('/api/v1/')) {
    return createBackendApi({ db: database(process.env), env: process.env })(
      request,
      context.ip ?? 'unknown',
    );
  }
  const config = readConfig(process.env);
  const handle = createConciergeApi({
    store:
      process.env.CONCIERGE_LEGACY_STORAGE === 'postgres'
        ? postgresLegacyStore(process.env)
        : blobStore(),
    config,
    channels: createChannels(
      config,
      fetch,
      legacySmsBoundary(database(process.env), process.env, config, fetch),
    ),
    communicationsHeld: legacyCommunicationsHeld(database(process.env)),
    clock: () => Date.now(),
    log: (event, detail) => console.log(`[concierge] ${event}`, detail ?? {}),
  });
  const ip =
    context.ip ?? request.headers.get('x-nf-client-connection-ip') ?? 'unknown';
  return handle(request, ip);
}

export const config = { path: '/api/*' };
