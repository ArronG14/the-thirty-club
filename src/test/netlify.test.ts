// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';
import spa from '../../netlify/edge-functions/spa';
import { nonSpaPath } from '../../netlify/routing';
import { immutableAssetHeaders } from '../../build/netlifyHeaders';

const origin = 'https://club.example';
function navigation(path: string, method = 'GET') {
  return new Request(origin + path, {
    method,
    headers: { accept: 'text/html' },
  });
}
afterEach(() => vi.unstubAllGlobals());

describe('Netlify navigation boundary', () => {
  it.each([
    '/',
    '/api',
    '/api/redemptions',
    '/api/redemptions?room=lounge',
    '/assets',
    '/assets/missing',
    '/assets/missing.js',
    '/missing.js',
    '/nested/missing.svg',
    '/sw.js',
    '/workbox-stale.js',
    '/manifest.webmanifest',
    '/favicon.svg',
    '/pwa-512.png',
    '/.well-known/missing',
    '/nested/missing%2Epng',
  ])(
    'leaves %s to static serving / HTTP errors even for HTML requests',
    async (path) => {
      const fetch = vi.fn();
      vi.stubGlobal('fetch', fetch);
      expect(await spa(navigation(path))).toBeUndefined();
      expect(fetch).not.toHaveBeenCalled();
    },
  );

  it.each(['GET', 'HEAD'])(
    'serves deep HTML navigation for %s with revalidation',
    async (method) => {
      const fetch = vi.fn().mockResolvedValue(
        new Response(method === 'HEAD' ? null : '<h1>Club</h1>', {
          headers: {
            'Content-Type': 'text/html',
            'Cache-Control': 'max-age=900',
          },
        }),
      );
      vi.stubGlobal('fetch', fetch);
      const response = await spa(
        navigation('/members/lounge?invitation=one', method),
      );
      expect(fetch).toHaveBeenCalledWith(
        new URL('/', origin),
        expect.objectContaining({ method }),
      );
      expect(response?.status).toBe(200);
      expect(response?.headers.get('Cache-Control')).toBe(
        'public, max-age=0, must-revalidate',
      );
      expect(response?.headers.get('Vary')).toContain('Accept');
    },
  );

  it('preserves a failed shell response rather than inventing success', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response('Missing', { status: 404 })),
    );
    expect((await spa(navigation('/members/lounge')))?.status).toBe(404);
  });

  it('does not rewrite non-HTML fetches or mutating requests', async () => {
    const fetch = vi.fn();
    vi.stubGlobal('fetch', fetch);
    expect(await spa(new Request(origin + '/members/lounge'))).toBeUndefined();
    expect(await spa(navigation('/members/lounge', 'POST'))).toBeUndefined();
    expect(fetch).not.toHaveBeenCalled();
  });
});

it('applies immutable caching only to exact fingerprinted emitted filenames', () => {
  const headers = immutableAssetHeaders([
    'assets/index-AbCd1234.js',
    'assets/index-A1B2C3D4.css',
    'assets/settings.json',
    'assets/unhashed.js',
    'manifest.webmanifest',
    'sw.js',
    'index.html',
    'pwa-512.png',
    'workbox-12345678.js',
  ]);
  expect(headers).toContain('/assets/index-AbCd1234.js\n');
  expect(headers).toContain('/assets/index-A1B2C3D4.css\n');
  expect(headers.match(/immutable/g)).toHaveLength(2);
  expect(headers).not.toMatch(
    /settings|unhashed|manifest|sw\.js|html|png|workbox|\*/,
  );
});

it('does not confuse dots or slashes in query values with file paths', () => {
  expect(nonSpaPath.test('/members/lounge?clue=/video.mp4')).toBe(false);
  expect(nonSpaPath.test('/api?clue=one')).toBe(true);
  expect(nonSpaPath.test('/missing.svg?version=one')).toBe(true);
});
