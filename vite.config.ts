import { screeningPreviewMedia } from './build/screeningPreviewMedia.ts';
import { conciergeLocalApi } from './build/conciergeLocalApi.ts';
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { netlifyHeaders } from './build/netlifyHeaders.ts';
import { nonSpaPath } from './netlify/routing.ts';
import tailwindcss from '@tailwindcss/vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    screeningPreviewMedia(),
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
        navigateFallback: '/index.html',
        navigateFallbackDenylist: [nonSpaPath],
        cleanupOutdatedCaches: true,
      },
      devOptions: { enabled: false },
    }),
  ],
  build: {
    target: 'safari16.4',
    // The lazily loaded 3D entrance (three.js) is ~170 KB gzip by design.
    chunkSizeWarningLimit: 700,
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.test.{ts,tsx}', 'netlify/**/*.test.ts'],
    clearMocks: true,
  },
});
