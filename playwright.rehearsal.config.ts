import { defineConfig, devices } from '@playwright/test';
// PW_PORT lets a second checkout run the same suite alongside this one.
const PORT = Number(process.env.PW_PORT ?? 4185);
// The Owner Control Centre and the rehearsal engine (tests/rehearsal.spec.ts)
// on an iPhone profile. LIVE checks use the local in-memory APIs with SMS
// off; TEST runs the simulated office inside the browser. Nothing here can
// reach Twilio, Telegram or Supabase.
export default defineConfig({
  testDir: './tests',
  testMatch: [
    'rehearsal.spec.ts',
    'journey.spec.ts',
    'integration.spec.ts',
    'release.spec.ts',
  ],
  workers: 1,
  timeout: 180000,
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    ...devices['iPhone 13'],
    deviceScaleFactor: 2,
    browserName: process.env.REHEARSAL_WEBKIT ? 'webkit' : 'chromium',
  },
  webServer: {
    command: `npm run preview -- --port ${PORT} --strictPort`,
    url: `http://127.0.0.1:${PORT}`,
    reuseExistingServer: false,
    env: { BUTLERS_OFFICE_LOCAL_API: '1', CONCIERGE_LOCAL_API: '1' },
  },
});
