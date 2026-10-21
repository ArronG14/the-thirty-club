import { defineConfig, devices } from '@playwright/test';
import { homedir } from 'node:os';
import { join } from 'node:path';

// Protected-film delivery (ADR-027, tests/media-delivery.spec.ts): the real
// streaming prints, through the real ticket endpoint and presigned URLs,
// from a local stand-in for Cloudflare R2 that checks every signature and
// answers byte ranges. Chromium by default; MEDIA_WEBKIT=1 runs WebKit
// (close to, but not, iPhone Safari). The prints are not in Git:
// MEDIA_PRINTS points at them (default ~/Desktop/thirty-club-streaming).
const PORT = Number(process.env.PW_PORT ?? 4192);
const STANDIN = Number(process.env.S3_STANDIN_PORT ?? 4193);
const KEYS = {
  MEDIA_S3_ENDPOINT: `http://127.0.0.1:${STANDIN}`,
  MEDIA_S3_ACCESS_KEY_ID: 'local-standin-key',
  MEDIA_S3_SECRET_ACCESS_KEY: 'local-standin-secret',
};
process.env.MEDIA_PRINTS ??= join(homedir(), 'Desktop/thirty-club-streaming');
process.env.S3_STANDIN_URL = KEYS.MEDIA_S3_ENDPOINT;

export default defineConfig({
  testDir: './tests',
  testMatch: ['media-delivery.spec.ts'],
  workers: 1,
  timeout: 180_000,
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    ...devices['iPhone 13'],
    deviceScaleFactor: 2,
    browserName: process.env.MEDIA_WEBKIT ? 'webkit' : 'chromium',
  },
  webServer: [
    {
      command: 'npm run -s media:standin',
      url: `http://127.0.0.1:${STANDIN}/__stats`,
      reuseExistingServer: false,
      env: {
        ...KEYS,
        S3_STANDIN_PORT: String(STANDIN),
        S3_STANDIN_SEED: process.env.MEDIA_PRINTS,
      },
    },
    {
      command: `npm run preview -- --port ${PORT} --strictPort`,
      url: `http://127.0.0.1:${PORT}`,
      reuseExistingServer: false,
      env: { ...KEYS, BUTLERS_OFFICE_LOCAL_API: '1', CONCIERGE_LOCAL_API: '1' },
    },
  ],
});
