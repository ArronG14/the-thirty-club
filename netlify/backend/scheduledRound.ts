/**
 * The every-minute round, framework-free so it is testable. Due journey
 * milestones fire first (their Butler letters are published at once), then
 * due letters are published (queuing their Butler invitations in the outbox), then the
 * PostgreSQL outbox and the legacy notification retries run independently: a
 * failure in any part never stops the others.
 */
import { runRetries } from '../concierge/dispatch.ts';
import type { ServiceDeps } from '../concierge/service.ts';

export interface ScheduledRoundDeps {
  /** Birthday journey: due milestones and open events; absent where not wired. */
  journey?: () => Promise<{ fired: number; processed: number }>;
  /** Correspondence Desk publication; absent where the Desk is not wired. */
  correspondence?: () => Promise<{ published: number }>;
  outbox(): Promise<{ processed: number }>;
  legacy: ServiceDeps;
}

export async function scheduledRound({
  journey,
  correspondence,
  outbox,
  legacy,
}: ScheduledRoundDeps) {
  let milestones: { fired: number; processed: number } | 'failed' = {
    fired: 0,
    processed: 0,
  };
  if (journey) {
    try {
      milestones = await journey();
    } catch {
      milestones = 'failed';
      console.error('[dispatch] journey round failed');
    }
  }
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
    journey: milestones,
    published,
    outbox: sms.status === 'fulfilled' ? sms.value.processed : 'failed',
    retried:
      retries.status === 'fulfilled'
        ? retries.value
        : { live: [], rehearsal: [] },
  };
}
