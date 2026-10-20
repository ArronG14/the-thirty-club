import { ownerActive } from '../owner/session';
import { appClock } from '../rehearsal/clock';
import { simulationActive } from '../rehearsal/mode';
import { browserMembershipStorage } from '../club/domain/membershipRecord';
import { hasMembership } from '../concierge/client/membership';
import { activeSession, realmKey } from '../concierge/client/sessionStore';
import { browserEntranceStorage } from './domain/entranceRecord';
import {
  systemClock,
  type EarlyAdmissionSource,
  type EntranceEnvironment,
} from './domain/environment';
import { deviceStorage } from '../rehearsal/storage';

const FINAL_KEY = 'thirty-club:early-admission';

/**
 * The server's early-admission schedule (ADR-022). On rehearsal pages the
 * request is answered by the simulated office in the tab.
 */
const admissionSource: EarlyAdmissionSource = {
  async read() {
    try {
      const response = await fetch('/api/v1/entrance', {
        cache: 'no-store',
        credentials: 'same-origin',
        headers: { accept: 'application/json' },
        signal: AbortSignal.timeout(10_000),
      });
      return response.ok ? await response.json() : null;
    } catch {
      return null;
    }
  },
  loadFinalStart() {
    try {
      const raw = deviceStorage().getItem(FINAL_KEY);
      const at = raw ? Number(JSON.parse(raw).finalStartedAt) : NaN;
      return Number.isFinite(at) ? at : null;
    } catch {
      return null;
    }
  },
  saveFinalStart(at) {
    try {
      if (at === null) deviceStorage().removeItem(FINAL_KEY);
      else
        deviceStorage().setItem(
          FINAL_KEY,
          JSON.stringify({ finalStartedAt: at }),
        );
    } catch {
      // Without storage a reload simply begins the final ten seconds again.
    }
  },
};
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
      admission: admissionSource,
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
    admission: admissionSource,
  };
}
