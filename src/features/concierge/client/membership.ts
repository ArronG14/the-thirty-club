/**
 * Whether this device has seen the membership credential: a session that
 * carries it, or a recognition recorded without one (by the service on a
 * paired display, or offline). Ceremonial, like the entrance gate itself.
 */
import { hasScope } from '../domain/session';
import { browserConciergeStorage, type ConciergeStorage } from './localRecord';
import { activeSession } from './sessionStore';

export function hasMembership(
  storage: ConciergeStorage = browserConciergeStorage(),
): boolean {
  return (
    hasScope(activeSession()?.claims ?? null, 'membership') ||
    storage.load().membershipAt !== null
  );
}

export function recordMembership(
  at = new Date().toISOString(),
  storage: ConciergeStorage = browserConciergeStorage(),
) {
  const record = storage.load();
  if (record.membershipAt) return;
  storage.save({ ...record, membershipAt: at });
}

/** Offline recognition: recorded locally only. */
export function markMembershipOffline(storage?: ConciergeStorage) {
  recordMembership(new Date().toISOString(), storage);
}
