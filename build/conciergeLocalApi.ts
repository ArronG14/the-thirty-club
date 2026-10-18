/**
 * LOCAL DEVELOPMENT ONLY. Serves the real concierge API handlers inside the
 * Vite dev server (and inside `vite preview` when CONCIERGE_LOCAL_API=1, for
 * Playwright), backed by an in-memory store and FAKE channels: nothing is
 * ever sent to Telegram or Twilio. It is server middleware, never part of
 * the built site; production uses the Netlify Function.
 *
 * Extra local-only routes for tests:
 *   GET  /api/__local/outbox   everything the fake channels "sent"
 *   POST /api/__local/clock    { now: epochMs | null } shifts the service clock
 *   POST /api/__local/reset    fresh store and outbox
 *   POST /api/__local/fail     { channel: 'arron', times } simulate an outage
 */
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Plugin } from 'vite';
import { createConciergeApi } from '../netlify/concierge/api.ts';
import { readConfig } from '../netlify/concierge/config.ts';
import { memoryStore } from '../netlify/concierge/store.ts';
import { fakeChannels, TEST_ENV } from '../netlify/concierge/testing.ts';

function createLocalApi(siteUrl: string) {
  let offset = 0;
  const clock = () => Date.now() + offset;
  let store = memoryStore();
  let channels = fakeChannels(clock);
  const config = readConfig({ ...TEST_ENV, CONCIERGE_SITE_URL: siteUrl });
  const build = () => createConciergeApi({ store, config, channels, clock });
  let handle = build();

  return async function middleware(
    req: IncomingMessage,
    res: ServerResponse,
    next: () => void,
  ) {
    if (!req.url?.startsWith('/api/')) return next();
    const chunks: Buffer[] = [];
    for await (const chunk of req) chunks.push(chunk as Buffer);
    const body = Buffer.concat(chunks).toString('utf8');
    const url = new URL(req.url, `http://${req.headers.host ?? 'localhost'}`);
    const send = (status: number, data: unknown) => {
      res.statusCode = status;
      res.setHeader('content-type', 'application/json; charset=utf-8');
      res.setHeader('x-concierge-local', 'fake-channels');
      res.end(JSON.stringify(data));
    };

    if (url.pathname.startsWith('/api/__local/')) {
      const input = body ? (JSON.parse(body) as Record<string, unknown>) : {};
      switch (url.pathname) {
        case '/api/__local/outbox':
          return send(200, channels.outbox);
        case '/api/__local/clock':
          offset = typeof input.now === 'number' ? input.now - Date.now() : 0;
          return send(200, { now: clock() });
        case '/api/__local/reset':
          store = memoryStore();
          channels = fakeChannels(clock);
          offset = 0;
          handle = build();
          return send(200, { ok: true });
        case '/api/__local/fail':
          channels.failNext(
            input.channel === 'sms' ? 'sms' : 'arron',
            typeof input.times === 'number' ? input.times : 1,
          );
          return send(200, { ok: true });
        default:
          return send(404, { error: 'not-found' });
      }
    }

    const headers = new Headers();
    for (const [key, value] of Object.entries(req.headers)) {
      if (typeof value === 'string') headers.set(key, value);
    }
    const response = await handle(
      new Request(url, {
        method: req.method ?? 'GET',
        headers,
        ...(body && req.method !== 'GET' && req.method !== 'HEAD'
          ? { body }
          : {}),
      }),
      req.socket.remoteAddress ?? 'local',
    );
    res.statusCode = response.status;
    response.headers.forEach((value, key) => res.setHeader(key, value));
    res.setHeader('x-concierge-local', 'fake-channels');
    res.end(await response.text());
  };
}

export function conciergeLocalApi(): Plugin {
  return {
    name: 'thirty-club-concierge-local-api',
    configureServer(server) {
      const port = server.config.server.port ?? 5173;
      server.middlewares.use(createLocalApi(`http://localhost:${port}`));
    },
    configurePreviewServer(server) {
      if (process.env.CONCIERGE_LOCAL_API !== '1') return;
      const port = server.config.preview.port ?? 4173;
      server.middlewares.use(createLocalApi(`http://127.0.0.1:${port}`));
    },
  };
}
