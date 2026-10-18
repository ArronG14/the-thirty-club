/** Local database rehearsal only. No provider credentials or real messages. */
import type { Plugin } from 'vite';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { readdir, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { scryptSync } from 'node:crypto';
import { createBackendApi } from '../netlify/backend/api.ts';
import { BackendError, type Database } from '../netlify/backend/database.ts';
async function initialize() {
  const { PGlite } = await import('@electric-sql/pglite');
  const pg = new PGlite();
  await pg.exec(
    'create role anon; create role authenticated; create role service_role bypassrls;',
  );
  for (const file of (await readdir(resolve('supabase/migrations')))
    .filter((x) => x.endsWith('.sql'))
    .sort())
    await pg.exec(await readFile(resolve('supabase/migrations', file), 'utf8'));
  const db: Database = {
    async action<T>(
      actor: string | null,
      role: string,
      action: string,
      input = {},
    ) {
      try {
        const result = await pg.query<{ result: T }>(
          'select public.ttc_action($1,$2,$3,$4::jsonb) as result',
          [actor, role, action, JSON.stringify(input)],
        );
        return result.rows[0]!.result;
      } catch (error) {
        throw new BackendError(
          (error as Error).message as ConstructorParameters<
            typeof BackendError
          >[0],
        );
      }
    },
  };
  return createBackendApi({
    db,
    env: {
      OWNER_PASSWORD_HASH: `scrypt$local-rehearsal$${scryptSync('thirty-club-local-rehearsal-only', 'local-rehearsal', 64).toString('hex')}`,
      SMS_SENDING_ENABLED: 'false',
    },
  });
}
export function butlersOfficeLocalApi(): Plugin {
  let ready: ReturnType<typeof initialize> | null = null;
  return {
    name: 'thirty-butlers-office-local',
    configureServer(server) {
      if (process.env.BUTLERS_OFFICE_LOCAL_API === '1')
        server.middlewares.use(middleware);
    },
    configurePreviewServer(server) {
      if (process.env.BUTLERS_OFFICE_LOCAL_API === '1')
        server.middlewares.use(middleware);
    },
  };
  async function middleware(
    req: IncomingMessage,
    res: ServerResponse,
    next: () => void,
  ) {
    if (!req.url?.startsWith('/api/v1/')) return next();
    try {
      const chunks: Buffer[] = [];
      for await (const chunk of req) chunks.push(chunk as Buffer);
      const body = Buffer.concat(chunks).toString('utf8');
      const url = new URL(req.url, `http://${req.headers.host}`);
      const headers = new Headers();
      for (const [key, value] of Object.entries(req.headers))
        if (typeof value === 'string') headers.set(key, value);
      ready ??= initialize();
      const handler = await ready;
      const response = await handler(
        new Request(url, {
          method: req.method ?? 'GET',
          headers,
          ...(body ? { body } : {}),
        }),
        'local-rehearsal',
      );
      res.statusCode = response.status;
      response.headers.forEach((value, key) => res.setHeader(key, value));
      res.setHeader('x-thirty-local', 'database-rehearsal-no-sms');
      res.end(await response.text());
    } catch {
      res.statusCode = 500;
      res.end(
        JSON.stringify({
          error: 'server',
          message: 'Local database rehearsal failed.',
        }),
      );
    }
  }
}
