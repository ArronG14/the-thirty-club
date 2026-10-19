import { ownerActive } from '../owner/session';
import { appClock } from '../rehearsal/clock';
import { simulationActive } from '../rehearsal/mode';
import { browserMembershipStorage } from '../club/domain/membershipRecord';
import { hasMembership } from '../concierge/client/membership';
import { activeSession, realmKey } from '../concierge/client/sessionStore';
import { browserEntranceStorage } from './domain/entranceRecord';
import { systemClock, type EntranceEnvironment } from './domain/environment';
import { resolveDevPreview } from './preview/devPreview';

/**
 * The real birthday environment: device clock and device record. The preview
 * branch is statically `false` in production builds and is eliminated.
 *
 * Two rehearsal modes keep the live journey on this device untouched:
 * - the rehearsal engine (PIN, docs/REHEARSAL.md): session-scoped records,
 *   the rehearsal clock and the rehearsal's own card and concierge;
 * - a concierge rehearsal (docs/CONCIERGE.md): the server's rehearsal realm,
 *   its virtual clock, and records under `thirty-club:rehearsal:` keys.
 */
export function createEntranceEnvironment(): EntranceEnvironment {
  if (simulationActive && ownerActive) {
    // The rehearsal (ADR-018): the rehearsal clock, session-scoped records
    // and the rehearsal's own membership card. Scenarios seed the records.
    return {
      clock: appClock,
      storage: browserEntranceStorage(),
      membership: browserMembershipStorage(),
      card: { isPresented: () => hasMembership() },
      preview: null,
    };
  }
  if (import.meta.env.DEV) {
    const preview = resolveDevPreview(window.location.search);
    if (preview) return preview;
  }
  const claims = activeSession()?.claims;
  const offset = claims?.realm === 'rehearsal' ? (claims.offsetMs ?? 0) : 0;
  return {
    clock: offset ? { now: () => Date.now() + offset } : systemClock,
    storage: browserEntranceStorage(realmKey('entrance')),
    membership: browserMembershipStorage(realmKey('membership')),
    card: { isPresented: () => hasMembership() },
    preview: null,
  };
}
