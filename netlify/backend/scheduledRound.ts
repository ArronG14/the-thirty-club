/**
 * The every-minute round, framework-free so it is testable. Due letters are
 * published first (queuing their Butler invitations in the outbox), then the
 * PostgreSQL outbox and the legacy notification retries run independently: a
 * failure in any part never stops the others.
 */
import { runRetries } from '../concierge/dispatch.ts';
import type { ServiceDeps } from '../concierge/service.ts';

export interface ScheduledRoundDeps {
  /** Correspondence Desk publication; absent where the Desk is not wired. */
  correspondence?: () => Promise<{ published: number }>;
  outbox(): Promise<{ processed: number }>;
  legacy: ServiceDeps;
}

export async function scheduledRound({
  correspondence,
  outbox,
  legacy,
}: ScheduledRoundDeps) {
  let published: number | 'failed' = 0;
  if (correspondence) {
    try {
      published = (await correspondence()).published;
    } catch {
      published = 'failed';
      console.error('[dispatch] correspondence publication failed');
    }
  }
  const [sms, retries] = await Promise.allSettled([
    outbox(),
    runRetries(legacy),
  ]);
  if (sms.status === 'rejected') console.error('[dispatch] SMS outbox failed');
  if (retries.status === 'rejected')
    console.error('[dispatch] legacy notification retries failed');
  return {
    published,
    outbox: sms.status === 'fulfilled' ? sms.value.processed : 'failed',
    retried:
      retries.status === 'fulfilled'
        ? retries.value
        : { live: [], rehearsal: [] },
  };
}
