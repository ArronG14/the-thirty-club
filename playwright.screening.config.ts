import { defineConfig, devices } from '@playwright/test';

// The Private Screening Room's real-film journey (tests/screening-film.spec.ts)
// against the production build on an iPhone 13 profile. Chromium by default;
// SCREENING_WEBKIT=1 runs WebKit, which approximates (but is not) iPhone
// Safari: Playwright's WebKit has the element Fullscreen API, whereas the
// iPhone opens its own native player.
export default defineConfig({
  testDir: './tests',
  testMatch: ['screening-film.spec.ts'],
  workers: 1,
  timeout: 120_000,
  use: {
    baseURL: 'http://127.0.0.1:4187',
    ...devices['iPhone 13'],
    deviceScaleFactor: 2,
    browserName: process.env.SCREENING_WEBKIT ? 'webkit' : 'chromium',
  },
  webServer: {
    command: 'npm run preview -- --port 4187 --strictPort',
    url: 'http://127.0.0.1:4187',
    reuseExistingServer: false,
    env: { BUTLERS_OFFICE_LOCAL_API: '1', CONCIERGE_LOCAL_API: '1' },
  },
});
