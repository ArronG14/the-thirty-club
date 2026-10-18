import { database } from '../backend/database.ts';
import { postgresLegacyStore } from '../backend/legacyStore.ts';
import { processMessages } from '../backend/sms.ts';
import { blobStore } from '../concierge/blobStore.ts';
import { createChannels } from '../concierge/channels.ts';
import { readConfig } from '../concierge/config.ts';
import { scheduledRound } from '../backend/scheduledRound.ts';

/**
 * Every minute on the published production deploy. PostgreSQL is the only
 * scheduler of Butler SMS (approved outbox). The legacy concierge keeps only
 * its retries of undelivered redemption notifications to Arron; its own
 * scheduled messages to Alise are no longer sent, so nothing goes twice.
 */
export default async function conciergeDispatch(): Promise<Response> {
  const config = readConfig(process.env);
  const result = await scheduledRound({
    outbox: () => processMessages(database(process.env), process.env),
    legacy: {
      store:
        process.env.CONCIERGE_LEGACY_STORAGE === 'postgres'
          ? postgresLegacyStore(process.env)
          : blobStore(),
      config,
      channels: createChannels(config, fetch),
      clock: () => Date.now(),
      log: (event, detail) => console.log(`[concierge] ${event}`, detail ?? {}),
    },
  });
  if (result.outbox !== 0 || result.retried.live.length > 0)
    console.log('[dispatch]', JSON.stringify(result));
  return new Response(null, { status: 204 });
}

export const config = { schedule: '* * * * *' };
