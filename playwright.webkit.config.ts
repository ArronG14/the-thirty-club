import { defineConfig, devices } from '@playwright/test';
// PW_PORT lets a second checkout run the same suite alongside this one.
const PORT = Number(process.env.PW_PORT ?? 4321);

// The 3D entrance on WebKit with an iPhone profile (real GPU path, 30 s
// stability windows). This approximates iOS Safari; it is not a device.
// Port 4321: WebKit refuses some ports (4190 among them).
export default defineConfig({
  testDir: './tests',
  testMatch: 'entrance-webkit.spec.ts',
  fullyParallel: false,
  workers: 1,
  timeout: 150_000,
  use: { baseURL: `http://127.0.0.1:${PORT}`, ...devices['iPhone 14'] },
  webServer: {
    command: `npm run preview -- --port ${PORT} --strictPort`,
    url: `http://127.0.0.1:${PORT}`,
    reuseExistingServer: false,
    env: { CONCIERGE_LOCAL_API: '1' },
  },
});
