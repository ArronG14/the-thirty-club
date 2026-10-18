import { browserMembershipStorage } from '../club/domain/membershipRecord';
import { browserEntranceStorage } from './domain/entranceRecord';
import { systemClock, type EntranceEnvironment } from './domain/environment';
import { resolveDevPreview } from './preview/devPreview';

/**
 * The real birthday environment: device clock and device record. The preview
 * branch is statically `false` in production builds and is eliminated.
 */
export function createEntranceEnvironment(): EntranceEnvironment {
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
