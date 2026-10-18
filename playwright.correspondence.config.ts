import { defineConfig, devices } from '@playwright/test';
// Its own server and in-memory database: the office rate-limits sign-ins
// per address, and these tests sign in and introduce members several times.
export default defineConfig({
  testDir: './tests',
  testMatch: ['correspondence.spec.ts'],
  workers: 1,
  timeout: 90000,
  use: {
    baseURL: 'http://127.0.0.1:4181',
    ...devices['iPhone 13'],
    browserName: 'chromium',
  },
  webServer: {
    command: 'npm run preview -- --port 4181 --strictPort',
    url: 'http://127.0.0.1:4181',
    reuseExistingServer: false,
    env: { BUTLERS_OFFICE_LOCAL_API: '1', CONCIERGE_LOCAL_API: '1' },
  },
});
