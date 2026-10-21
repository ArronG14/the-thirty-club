import { defineConfig, devices } from '@playwright/test';
const port = Number(process.env.PW_PORT ?? 4196);
export default defineConfig({
  testDir: './tests',
  testMatch: 'story.spec.ts',
  outputDir: 'test-results/story-browser',
  workers: 1,
  timeout: 360000,
  use: {
    baseURL: `http://127.0.0.1:${port}`,
    trace: 'retain-on-failure',
    actionTimeout: 20000,
  },
  projects: [
    {
      name: 'story-chromium',
      use: { ...devices['iPhone 13'], browserName: 'chromium' },
    },
    {
      name: 'story-webkit',
      use: { ...devices['iPhone 13'], browserName: 'webkit' },
    },
  ],
  webServer: {
    command: `npm run preview -- --port ${port} --strictPort`,
    url: `http://127.0.0.1:${port}`,
    reuseExistingServer: false,
  },
});
