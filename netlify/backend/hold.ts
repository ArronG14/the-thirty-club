/**
 * The communication hold (ADR-021). The database enforces it on every path
 * (triggers and paused schedulers); this check lets owner actions that would
 * contact Alise fail clearly before they change anything.
 */
import { BackendError, type Database } from './database.ts';

export interface HoldState {
  active: boolean;
  heldSince: string;
  releaseNotBefore: string;
  releasedAt: string | null;
}

export const holdState = (db: Database) =>
  db.action<HoldState>(null, 'system', 'system-communications');

/** Refuses an owner action that would contact Alise while held. */
export async function requireCommunications(db: Database) {
  if ((await holdState(db)).active) throw new BackendError('on-hold');
}
