import { defineConfig, devices } from '@playwright/test';

/** Isolated Casino UI browser checks; API calls are intercepted by each test. */
export default defineConfig({
  testDir: './tests',
  testMatch: ['casino.spec.ts', 'casino-owner.spec.ts'],
  workers: 1,
  use: { baseURL: 'http://127.0.0.1:4176', ...devices['Desktop Chrome'] },
  webServer: {
    command: 'npm run preview -- --port 4176 --strictPort',
    url: 'http://127.0.0.1:4176',
    reuseExistingServer: false,
  },
});
