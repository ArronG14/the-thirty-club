/**
 * Browser-build aliases for the rehearsal simulation (ADR-018). The real
 * backend modules import `node:crypto`, `node:util` and the Shopping
 * Privilege; in the browser bundle those resolve to rehearsal stand-ins.
 * The Shopping stand-in exists so the real module, with its hidden ceiling,
 * can never be bundled. Not applied under Vitest, which tests the real ones.
 */
import { fileURLToPath } from 'node:url';
import type { Plugin } from 'vite';

const sim = (file: string) =>
  fileURLToPath(
    new URL(`../src/features/rehearsal/sim/${file}`, import.meta.url),
  );

export function rehearsalShims(): Plugin {
  return {
    name: 'thirty-rehearsal-shims',
    enforce: 'pre',
    apply: () => !process.env.VITEST,
    resolveId(source, importer) {
      if (source === 'node:crypto') return sim('nodeCrypto.ts');
      if (source === 'node:util') return sim('nodeUtil.ts');
      if (
        /(^|\/)shopping(\.ts)?$/.test(source) &&
        importer?.replace(/\\/g, '/').includes('/netlify/concierge/')
      )
        return sim('shoppingStub.ts');
      return null;
    },
  };
}
