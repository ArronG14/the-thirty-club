import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  testIgnore: [
    'screening.dev.spec.ts',
    'butlers-office.spec.ts',
    'casino.look.spec.ts',
    // WebKit with a phone profile: playwright.webkit.config.ts.
    'entrance-webkit.spec.ts',
  ],
  fullyParallel: false,
  use: {
    baseURL: 'http://127.0.0.1:4173',
    ...devices['Desktop Chrome'],
    // Existing suites test the entrance, not the first-visit verification.
    storageState: {
      cookies: [],
      origins: [
        {
          origin: 'http://127.0.0.1:4173',
          localStorage: [
            { name: 'thirty-club:first-visit-verified', value: 'test' },
          ],
        },
      ],
    },
  },
  webServer: {
    command: 'npm run preview -- --port 4173 --strictPort',
    url: 'http://127.0.0.1:4173',
    reuseExistingServer: false,
    // The concierge API with fake channels (build/conciergeLocalApi.ts):
    // no test can reach Telegram or Twilio.
    env: { CONCIERGE_LOCAL_API: '1' },
  },
});
