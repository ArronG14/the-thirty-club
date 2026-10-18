import { blobStore } from '../concierge/blobStore.ts';
import { createChannels } from '../concierge/channels.ts';
import { readConfig } from '../concierge/config.ts';
import { runDispatch } from '../concierge/dispatch.ts';

/**
 * Every minute on the published production deploy (Netlify runs scheduled
 * functions only there): Alise's due messages and notification retries.
 */
export default async function conciergeDispatch(): Promise<Response> {
  const config = readConfig(process.env);
  const result = await runDispatch({
    store: blobStore(),
    config,
    channels: createChannels(config, fetch),
    clock: () => Date.now(),
    log: (event, detail) => console.log(`[concierge] ${event}`, detail ?? {}),
  });
  if (result.sent.length > 0 || result.retried.live.length > 0) {
    console.log('[concierge] dispatch', JSON.stringify(result));
  }
  return new Response(null, { status: 204 });
}

export const config = { schedule: '* * * * *' };
