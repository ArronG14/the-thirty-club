import { defineConfig, devices } from '@playwright/test';
export default defineConfig({
  testDir: './tests',
  testMatch: 'screening.dev.spec.ts',
  use: {
    baseURL: 'http://127.0.0.1:5185',
    ...devices['Desktop Chrome'],
    viewport: { width: 390, height: 844 },
  },
  webServer: {
    command: 'npm run dev -- --port 5185 --strictPort',
    url: 'http://127.0.0.1:5185',
    reuseExistingServer: true,
  },
});
