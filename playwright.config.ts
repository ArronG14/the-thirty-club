import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  testIgnore: [
    // iPhone-profile real-film journey: playwright.screening.config.ts.
    'screening-film.spec.ts',
    'butlers-office.spec.ts',
    'gift-vault.spec.ts',
    'correspondence.spec.ts',
    'butler-service.spec.ts',
    'rehearsal.spec.ts',
    'journey.spec.ts',
    'casino.look.spec.ts',
    // WebKit with a phone profile: playwright.webkit.config.ts.
    'entrance-webkit.spec.ts',
  ],
  fullyParallel: false,
  // Software-rendered 3D scenes contend for the same GPU in CI; parallel
  // workers can time out before the entrance finishes opening.
  workers: 1,
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
