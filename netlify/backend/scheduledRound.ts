/**
 * The every-minute round, framework-free so it is testable. The PostgreSQL
 * outbox and the legacy notification retries run independently: a failure
 * in one never stops the other.
 */
import { runRetries } from '../concierge/dispatch.ts';
import type { ServiceDeps } from '../concierge/service.ts';

export interface ScheduledRoundDeps {
  outbox(): Promise<{ processed: number }>;
  legacy: ServiceDeps;
}

export async function scheduledRound({ outbox, legacy }: ScheduledRoundDeps) {
  const [sms, retries] = await Promise.allSettled([
    outbox(),
    runRetries(legacy),
  ]);
  if (sms.status === 'rejected') console.error('[dispatch] SMS outbox failed');
  if (retries.status === 'rejected')
    console.error('[dispatch] legacy notification retries failed');
  return {
    outbox: sms.status === 'fulfilled' ? sms.value.processed : 'failed',
    retried:
      retries.status === 'fulfilled'
        ? retries.value
        : { live: [], rehearsal: [] },
  };
}
