import { defineConfig, devices } from '@playwright/test';
// The Owner Control Centre and the rehearsal engine (tests/rehearsal.spec.ts)
// on an iPhone profile. LIVE checks use the local in-memory APIs with SMS
// off; TEST runs the simulated office inside the browser. Nothing here can
// reach Twilio, Telegram or Supabase.
export default defineConfig({
  testDir: './tests',
  testMatch: ['rehearsal.spec.ts', 'journey.spec.ts', 'integration.spec.ts'],
  workers: 1,
  timeout: 180000,
  use: {
    baseURL: 'http://127.0.0.1:4185',
    ...devices['iPhone 13'],
    deviceScaleFactor: 2,
    browserName: process.env.REHEARSAL_WEBKIT ? 'webkit' : 'chromium',
  },
  webServer: {
    command: 'npm run preview -- --port 4185 --strictPort',
    url: 'http://127.0.0.1:4185',
    reuseExistingServer: false,
    env: { BUTLERS_OFFICE_LOCAL_API: '1', CONCIERGE_LOCAL_API: '1' },
  },
});
