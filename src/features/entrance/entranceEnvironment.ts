import { ownerActive, ownerMode } from '../owner/session';
import { openingInstant } from './domain/countdown';
import { browserMembershipStorage } from '../club/domain/membershipRecord';
import { hasMembership } from '../concierge/client/membership';
import { activeSession, realmKey } from '../concierge/client/sessionStore';
import { browserEntranceStorage } from './domain/entranceRecord';
import {
  absentCard,
  presentedCard,
  systemClock,
  type EntranceEnvironment,
} from './domain/environment';
import { resolveDevPreview } from './preview/devPreview';

/**
 * The real birthday environment: device clock and device record. The preview
 * branch is statically `false` in production builds and is eliminated.
 *
 * Two rehearsal modes keep the live journey on this device untouched:
 * - owner test mode (PIN, docs/OWNER_ACCESS.md): session-scoped records and a
 *   shifted clock; the card counts as presented in its birthday and open
 *   previews so their ceremonies run as before;
 * - a concierge rehearsal (docs/CONCIERGE.md): the server's rehearsal realm,
 *   its virtual clock, and records under `thirty-club:rehearsal:` keys.
 */
export function createEntranceEnvironment(): EntranceEnvironment {
  if (ownerActive) {
    const start =
      ownerMode === 'locked'
        ? openingInstant() - 86400000
        : ownerMode === 'birthday'
          ? openingInstant() - 5000
          : openingInstant() + 172800000;
    const shift = start - Date.now();
    const storage = browserEntranceStorage();
    const membership = browserMembershipStorage();
    if (ownerMode === 'open') {
      const at = new Date(start).toISOString();
      storage.save({ unlockedAt: at, ceremonySeenAt: at });
      membership.save({ ...membership.load(), inductedAt: at });
    }
    return {
      clock: { now: () => Date.now() + shift },
      storage,
      membership,
      // Before the birthday nobody has the card; the birthday and open
      // previews have it, so their ceremonies run as designed.
      card: ownerMode === 'locked' ? absentCard : presentedCard,
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
