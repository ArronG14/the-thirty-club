import { defineConfig } from 'vitest/config';

// Story Bible acceptance (tests/acceptance). Not part of `npm test`: it
// judges a release candidate (ACCEPT_ROOT) against the Story Bible, and is
// expected to fail until that candidate implements it.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/acceptance/**/*.acceptance.test.ts'],
    testTimeout: 120_000,
    hookTimeout: 120_000,
  },
});
