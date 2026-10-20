import { database } from '../backend/database.ts';
import { postgresLegacyStore } from '../backend/legacyStore.ts';
import { processMessages } from '../backend/sms.ts';
import { publishDueLetters } from '../backend/correspondence.ts';
import { runJourneyRound } from '../backend/journey.ts';
import { blobStore } from '../concierge/blobStore.ts';
import { createChannels } from '../concierge/channels.ts';
import {
  legacyCommunicationsHeld,
  legacySmsBoundary,
} from '../backend/legacySms.ts';
import { readConfig } from '../concierge/config.ts';
import { scheduledRound } from '../backend/scheduledRound.ts';

/**
 * Every minute on the published production deploy. Due birthday-journey
 * milestones fire first and open journey events are processed (ADR-020).
 * PostgreSQL is the only
 * scheduler of Butler SMS (approved outbox); due Correspondence Desk letters
 * are published in the same round, before the outbox is sent. The legacy concierge keeps only
 * its retries of undelivered redemption notifications to Arron; its own
 * scheduled messages to Alise are no longer sent, so nothing goes twice.
 */
export default async function conciergeDispatch(): Promise<Response> {
  const config = readConfig(process.env);
  const result = await scheduledRound({
    journey: () => runJourneyRound(database(process.env)),
    correspondence: () => publishDueLetters(database(process.env)),
    outbox: () => processMessages(database(process.env), process.env),
    legacy: {
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
    },
  });
  if (
    result.journey === 'failed' ||
    result.journey.fired !== 0 ||
    result.journey.processed !== 0 ||
    result.published !== 0 ||
    result.outbox !== 0 ||
    result.retried.live.length > 0
  )
    console.log('[dispatch]', JSON.stringify(result));
  return new Response(null, { status: 204 });
}

export const config = { schedule: '* * * * *' };
