import type { Plugin } from 'vite';

export function immutableAssetHeaders(emittedFiles: string[]): string {
  return emittedFiles
    .filter((file) => /^assets\/[^/]+-[\w-]{8,}\.[a-z0-9]+$/.test(file))
    .sort()
    .map(
      (file) =>
        `/${file}\n  Cache-Control: public, max-age=31536000, immutable\n`,
    )
    .join('\n');
}

// Only Vite-emitted fingerprinted output is eligible, never public/ copies.
export function netlifyHeaders(): Plugin {
  return {
    name: 'netlify-fingerprinted-headers',
    apply: 'build',
    generateBundle(_options, bundle) {
      this.emitFile({
        type: 'asset',
        fileName: '_headers',
        source: immutableAssetHeaders(Object.keys(bundle)),
      });
    },
  };
}
