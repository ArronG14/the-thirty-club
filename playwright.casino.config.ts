import { defineConfig, devices } from '@playwright/test';

// Look-development capture of the Grand Casino at full quality. The build in
// dist-lookdev sets VITE_CASINO_LOOKDEV so the software-rendered browser is
// not downgraded to the flat fallback. Run with `npm run capture:casino`.
export default defineConfig({
  testDir: './tests',
  testMatch: 'casino.look.spec.ts',
  fullyParallel: false,
  use: { baseURL: 'http://127.0.0.1:4175', ...devices['Desktop Chrome'] },
  webServer: {
    command:
      'npx vite preview --outDir dist-lookdev --host 127.0.0.1 --port 4175 --strictPort',
    url: 'http://127.0.0.1:4175',
    reuseExistingServer: false,
  },
});
