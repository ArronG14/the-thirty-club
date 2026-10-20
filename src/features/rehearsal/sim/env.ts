/**
 * REHEARSAL ONLY. The simulated office's configuration: obviously fake
 * values, the same ones the local development API uses. No real secret,
 * phone number or provider credential exists in the browser.
 */
import { TEST_ENV } from '../../../../netlify/concierge/testing';

const origin = (() => {
  try {
    return window.location.origin;
  } catch {
    return 'https://rehearsal.thirty.club';
  }
})();

export const SIM_ENV: NodeJS.ProcessEnv = {
  ...TEST_ENV,
  CONCIERGE_SITE_URL: origin,
  // The real outbox worker needs these to run; the provider it calls is a
  // fake function in sim/v1.ts, so they never leave this tab.
  TWILIO_ACCOUNT_SID: 'AC-rehearsal-only',
  TWILIO_AUTH_TOKEN: 'rehearsal-only',
  TWILIO_MESSAGING_SERVICE_SID: 'MG-rehearsal-only',
  TWILIO_FROM: 'ThirtyClub',
  ALISE_PHONE: '+440000000001',
  ARRON_PHONE: '+440000000002',
  SMS_REHEARSAL_TO: '+440000000003',
  SMS_SENDING_ENABLED: 'false',
};

// The outbox worker builds a Basic header with Buffer before calling the
// (fake) provider. Browsers have no Buffer; this is the one use.
const scope = globalThis as unknown as { Buffer?: unknown };
scope.Buffer ??= {
  from: (text: string) => ({
    toString: () => btoa(unescape(encodeURIComponent(text))),
  }),
};
