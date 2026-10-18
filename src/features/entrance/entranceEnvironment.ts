import { ownerActive, ownerMode } from '../owner/session';
import { openingInstant } from './domain/countdown';
import { browserMembershipStorage } from '../club/domain/membershipRecord';
import { browserEntranceStorage } from './domain/entranceRecord';
import { systemClock, type EntranceEnvironment } from './domain/environment';
import { resolveDevPreview } from './preview/devPreview';

/**
 * The real birthday environment: device clock and device record. The preview
 * branch is statically `false` in production builds and is eliminated.
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
      preview: null,
    };
  }
  if (import.meta.env.DEV) {
    const preview = resolveDevPreview(window.location.search);
    if (preview) return preview;
  }
  return {
    clock: systemClock,
    storage: browserEntranceStorage(),
    membership: browserMembershipStorage(),
    preview: null,
  };
}
