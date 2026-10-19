import { butlersOfficeLocalApi } from './build/butlersOfficeLocalApi.ts';
import { screeningPreviewMedia } from './build/screeningPreviewMedia.ts';
import { conciergeLocalApi } from './build/conciergeLocalApi.ts';
import { rehearsalShims } from './build/rehearsalShims.ts';
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { netlifyHeaders } from './build/netlifyHeaders.ts';
import { nonSpaPath } from './netlify/routing.ts';
import tailwindcss from '@tailwindcss/vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    rehearsalShims(),
    screeningPreviewMedia(),
    butlersOfficeLocalApi(),
    conciergeLocalApi(),
    react(),
    tailwindcss(),
    netlifyHeaders(),
    VitePWA({
      registerType: 'prompt',
      includeAssets: ['favicon.svg', 'apple-touch-icon.png'],
      manifest: {
        id: '/',
        name: 'The Thirty Club',
        short_name: 'Thirty Club',
        description: 'A private members’ club for Alise.',
        lang: 'en-GB',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        background_color: '#0b0b0d',
        theme_color: '#0b0b0d',
        icons: [
          { src: '/pwa-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/pwa-512.png', sizes: '512x512', type: 'image/png' },
          {
            src: '/pwa-maskable-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,webmanifest,woff2,webp}'],
        // The owner's rehearsal office (PGlite, ~17 MB) is never precached:
        // Alise's device should not download it.
        globIgnores: ['**/rehearsal-*'],
        navigateFallback: '/index.html',
        navigateFallbackDenylist: [nonSpaPath],
        cleanupOutdatedCaches: true,
      },
      devOptions: { enabled: false },
    }),
  ],
  // PGlite ships its own WebAssembly; pre-bundling would break its URLs.
  optimizeDeps: { exclude: ['@electric-sql/pglite'] },
  build: {
    target: 'safari16.4',
    // The lazily loaded 3D entrance (three.js) is ~170 KB gzip by design.
    chunkSizeWarningLimit: 700,
    rollupOptions: {
      output: {
        // Rehearsal-only chunks carry a recognisable name (see globIgnores).
        chunkFileNames: (chunk) =>
          chunk.moduleIds.some(
            (id) =>
              id.includes('/@electric-sql/pglite/') ||
              id.includes('/src/features/rehearsal/sim/'),
          )
            ? 'assets/rehearsal-[name]-[hash].js'
            : 'assets/[name]-[hash].js',
      },
    },
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.test.{ts,tsx}', 'netlify/**/*.test.ts'],
    clearMocks: true,
  },
});
