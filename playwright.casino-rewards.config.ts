import { defineConfig, devices } from '@playwright/test';
// PW_PORT lets a second checkout run the same suite alongside this one.
const PORT = Number(process.env.PW_PORT ?? 4176);

/** Isolated Casino UI browser checks; API calls are intercepted by each test. */
export default defineConfig({
  testDir: './tests',
  testMatch: ['casino.spec.ts', 'casino-owner.spec.ts'],
  workers: 1,
  use: { baseURL: `http://127.0.0.1:${PORT}`, ...devices['Desktop Chrome'] },
  webServer: {
    command: `npm run preview -- --port ${PORT} --strictPort`,
    url: `http://127.0.0.1:${PORT}`,
    reuseExistingServer: false,
  },
});
