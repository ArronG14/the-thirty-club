import { defineConfig, devices } from '@playwright/test';
// PW_PORT lets a second checkout run the same suite alongside this one.
const PORT = Number(process.env.PW_PORT ?? 4187);

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
    baseURL: `http://127.0.0.1:${PORT}`,
    ...devices['iPhone 13'],
    deviceScaleFactor: 2,
    browserName: process.env.SCREENING_WEBKIT ? 'webkit' : 'chromium',
  },
  webServer: {
    command: `npm run preview -- --port ${PORT} --strictPort`,
    url: `http://127.0.0.1:${PORT}`,
    reuseExistingServer: false,
    env: { BUTLERS_OFFICE_LOCAL_API: '1', CONCIERGE_LOCAL_API: '1' },
  },
});
