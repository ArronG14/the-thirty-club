import { defineConfig, devices } from '@playwright/test';
// The Butler's Service journeys (tests/butler-service.spec.ts) on an iPhone
// profile, against their own preview server with the in-memory PostgreSQL
// rehearsal API (SMS_SENDING_ENABLED off, no provider) and the concierge API
// with fake channels. Nothing here can reach Twilio.
export default defineConfig({
  testDir: './tests',
  testMatch: ['butler-service.spec.ts'],
  workers: 1,
  timeout: 120000,
  use: {
    baseURL: 'http://127.0.0.1:4183',
    ...devices['iPhone 13'],
    deviceScaleFactor: 2,
    browserName: 'chromium',
  },
  webServer: {
    command: 'npm run preview -- --port 4183 --strictPort',
    url: 'http://127.0.0.1:4183',
    reuseExistingServer: false,
    env: { BUTLERS_OFFICE_LOCAL_API: '1', CONCIERGE_LOCAL_API: '1' },
  },
});
