import { defineConfig, devices } from '@playwright/test';
// PW_PORT lets a second checkout run the same suite alongside this one.
const PORT = Number(process.env.PW_PORT ?? 4175);

// Look-development capture of the Grand Casino at full quality. The build in
// dist-lookdev sets VITE_CASINO_LOOKDEV so the software-rendered browser is
// not downgraded to the flat fallback. Run with `npm run capture:casino`.
export default defineConfig({
  testDir: './tests',
  testMatch: 'casino.look.spec.ts',
  fullyParallel: false,
  use: { baseURL: `http://127.0.0.1:${PORT}`, ...devices['Desktop Chrome'] },
  webServer: {
    command: `npx vite preview --outDir dist-lookdev --host 127.0.0.1 --port ${PORT} --strictPort`,
    url: `http://127.0.0.1:${PORT}`,
    reuseExistingServer: false,
  },
});
