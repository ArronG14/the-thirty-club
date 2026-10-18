/**
 * The scheduled concierge round, run every minute by a Netlify Scheduled
 * Function: sends Alise's due messages (live realm only; rehearsal messages
 * are sent from the owner console) and retries undelivered notifications to
 * Arron in both realms.
 */
import type { Realm } from '../../src/features/concierge/domain/session.ts';
import {
  dispatchMessage,
  dueMessages,
  keys,
  retryDeliveries,
  scheduleFor,
  type DispatchRecord,
  type ServiceDeps,
} from './service.ts';

export async function runDispatch(deps: ServiceDeps) {
  const now = deps.clock();
  const schedule = await scheduleFor(deps, 'live');
  const sent: DispatchRecord[] = [];
  for (const messageId of dueMessages(schedule, now)) {
    const existing = await deps.store.get<DispatchRecord>(
      keys.dispatch('live', messageId),
    );
    // Already handled; dispatchMessage also guards this atomically.
    if (
      existing &&
      existing.value.status !== 'failed' &&
      existing.value.status !== 'sending'
    ) {
      continue;
    }
    const record = await dispatchMessage(deps, 'live', messageId);
    if (record) sent.push(record);
  }
  const retried: Record<Realm, Awaited<ReturnType<typeof retryDeliveries>>> = {
    live: await retryDeliveries(deps, 'live'),
    rehearsal: await retryDeliveries(deps, 'rehearsal'),
  };
  return { sent, retried };
}
