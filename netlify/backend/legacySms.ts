/**
 * The legacy concierge's SMS (ADR-012) through the one SMS policy boundary
 * (ADR-022), and its view of the communication hold (ADR-021). Used by the
 * Netlify functions that construct the legacy service.
 */
import type { ConciergeConfig } from '../concierge/config.ts';
import type { SmsBoundary } from '../concierge/channels.ts';
import type { Database } from './database.ts';
import { holdState } from './hold.ts';
import { deliverSms } from './smsPolicy.ts';

export function legacySmsBoundary(
  db: Database,
  env: NodeJS.ProcessEnv,
  config: ConciergeConfig,
  send: typeof fetch,
): SmsBoundary {
  return async (to, body) => {
    const audience =
      config.alisePhone && to === config.alisePhone
        ? 'alise'
        : config.arronPhone && to === config.arronPhone
          ? 'arron'
          : null;
    if (!audience) return { ok: false, error: 'Unknown SMS recipient.' };
    const result = await deliverSms(db, env, send, { audience, body });
    return result.state === 'accepted'
      ? { ok: true, reference: result.providerSid }
      : { ok: false, error: result.error };
  };
}

/** The hold, read fresh; any failure counts as held. */
export function legacyCommunicationsHeld(db: Database) {
  return async () => {
    try {
      return (await holdState(db)).active !== false;
    } catch {
      return true;
    }
  };
}
