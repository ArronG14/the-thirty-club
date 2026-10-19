/**
 * REHEARSAL ONLY. The simulated club office: the real `/api/v1` handlers
 * (netlify/backend) over the real migrations, running in PostgreSQL
 * compiled to WebAssembly (PGlite) inside this browser tab (ADR-018).
 *
 * - Storage: IndexedDB database `thirty-club-rehearsal`, separate from
 *   everything Alise's device holds. Reset deletes it.
 * - Time: every `now()` in the migrations is rewritten to
 *   `public.ttc_sim_now()`, which follows the rehearsal clock.
 * - SMS: the real outbox worker runs with a fake provider that never
 *   touches the network; messages read "sent" and then "delivered".
 * - Sign-in: the simulated owner and member are signed in automatically.
 *   No password is checked, because no password exists here.
 */
import type { PGlite } from '@electric-sql/pglite';
import type { Session } from '../../../shared/concierge/types';
import { createBackendApi } from '../../../../netlify/backend/api';
import { hashToken, newToken } from '../../../../netlify/backend/auth';
import { publishDueLetters } from '../../../../netlify/backend/correspondence';
import { runJourneyRound } from '../../../../netlify/backend/journey';
import {
  BackendError,
  rpcFor,
  type Database,
} from '../../../../netlify/backend/database';
import { processMessages } from '../../../../netlify/backend/sms';
import { bridgeMemberSession } from '../../../../netlify/backend/vault';
import { rehearsalNow } from '../clock';
import { SIM_ENV } from './env';
import { jar, type Actor } from './jar';

const MIGRATIONS = import.meta.glob('../../../../supabase/migrations/*.sql', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>;

export const SIM_DATABASE = 'thirty-club-rehearsal';
/** Changes whenever the migration set changes, so old simulations rebuild. */
const SCHEMA = Object.keys(MIGRATIONS).sort().join('|');

const CLOCK_SQL = `
create table public.ttc_sim_clock(offset_ms bigint not null);
insert into public.ttc_sim_clock values (0);
create function public.ttc_sim_now() returns timestamptz
  language sql stable set search_path = '' as
  $$ select pg_catalog.now() + make_interval(secs => (select offset_ms from public.ttc_sim_clock) / 1000.0) $$;
create table public.ttc_sim_meta(schema text not null, created_at timestamptz not null default pg_catalog.now());
`;

/** Every `now()` in the real migrations follows the rehearsal clock. */
export function rewriteClock(sql: string): string {
  return sql.replace(/(?<![\w.])now\(\)/g, 'public.ttc_sim_now()');
}

export interface SimOffice {
  pg: PGlite;
  db: Database;
  handle(request: Request, actor: Actor): Promise<Response>;
  round(): Promise<{ published: number; sent: number }>;
}

let office: Promise<SimOffice> | null = null;

export function simOffice(): Promise<SimOffice> {
  office ??= boot().catch((error: unknown) => {
    office = null;
    throw error;
  });
  return office;
}

/** Forgets the open office (after a reset deletes its database). */
export async function closeSimOffice() {
  const current = office;
  office = null;
  if (!current) return;
  try {
    await (await current).pg.close();
  } catch {
    // Already closed or never opened.
  }
}

async function open(): Promise<PGlite> {
  const { PGlite } = await import('@electric-sql/pglite');
  try {
    // Durable writes: rehearsal pages navigate straight after seeding.
    return await PGlite.create(`idb://${SIM_DATABASE}`);
  } catch {
    // Private browsing or blocked storage: a tab-only simulation still works.
    return PGlite.create();
  }
}

async function migrated(pg: PGlite): Promise<boolean> {
  try {
    const found = await pg.query<{ schema: string }>(
      'select schema from public.ttc_sim_meta limit 1',
    );
    return found.rows[0]?.schema === SCHEMA;
  } catch {
    return false;
  }
}

async function boot(): Promise<SimOffice> {
  let pg = await open();
  if (!(await migrated(pg))) {
    const empty = await pg
      .query<{ n: number }>(
        "select count(*)::int as n from pg_tables where schemaname='public'",
      )
      .then((r) => r.rows[0]?.n === 0)
      .catch(() => false);
    if (!empty) {
      // An older simulation: start again rather than half-migrate it.
      await pg.close();
      await deleteSimDatabase();
      pg = await open();
    }
    await pg.exec(
      'do $$ begin create role anon; create role authenticated; create role service_role bypassrls; exception when duplicate_object then null; end $$;',
    );
    await pg.exec(CLOCK_SQL);
    for (const file of Object.keys(MIGRATIONS).sort())
      await pg.exec(rewriteClock(MIGRATIONS[file]!));
    await pg.query('insert into public.ttc_sim_meta(schema) values ($1)', [
      SCHEMA,
    ]);
  }

  let offset = Number.NaN;
  const syncClock = async () => {
    const next = Math.round(rehearsalNow() - Date.now());
    if (Math.abs(next - offset) < 500) return;
    offset = next;
    await pg.query('update public.ttc_sim_clock set offset_ms = $1', [next]);
  };

  const db: Database = {
    async action<T>(
      actor: string | null,
      role: string,
      action: string,
      input = {},
    ) {
      await syncClock();
      try {
        const result = await pg.query<{ result: T }>(
          `select public.${rpcFor(action)}($1,$2,$3,$4::jsonb) as result`,
          [actor, role, action, JSON.stringify(input)],
        );
        return result.rows[0]!.result;
      } catch (error) {
        const message = (error as Error).message;
        throw new BackendError(
          /^[a-z-]+$/.test(message)
            ? (message as ConstructorParameters<typeof BackendError>[0])
            : /violates check|invalid input|null value/.test(message)
              ? 'invalid'
              : /duplicate key/.test(message)
                ? 'conflict'
                : 'server',
        );
      }
    },
  };

  const api = createBackendApi({ db, env: SIM_ENV });

  const signIn = async (actor: Actor): Promise<Session> => {
    const token = newToken();
    let session: Session;
    if (actor === 'owner') {
      session = await db.action<Session>(
        null,
        'system',
        'system-session-create',
        {
          hash: hashToken(token),
        },
      );
    } else {
      const invitation = newToken();
      const owner = await ownerSession();
      await db.action(owner.memberId, 'owner', 'owner-invitation', {
        hash: hashToken(invitation),
      });
      session = await db.action<Session>(
        null,
        'system',
        'system-member-exchange',
        { invitationHash: hashToken(invitation), hash: hashToken(token) },
      );
    }
    jar.set(actor, token);
    return session;
  };

  const sessionFor = async (actor: Actor): Promise<Session | null> => {
    const token = jar.get(actor);
    if (!token) return null;
    try {
      return await db.action<Session>(null, 'system', 'system-session-read', {
        hash: hashToken(token),
      });
    } catch {
      return null;
    }
  };

  const ownerSession = async () =>
    (await sessionFor('owner')) ?? (await signIn('owner'));

  const json = (data: unknown, status = 200) =>
    new Response(JSON.stringify(data), {
      status,
      headers: {
        'content-type': 'application/json; charset=utf-8',
        'x-thirty-simulation': 'rehearsal',
      },
    });

  async function handle(request: Request, actor: Actor): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname.replace(/\/+$/, '');
    // Sign-in is simulated: the office's own sessions, no password.
    if (request.method === 'POST' && path === '/api/v1/auth/owner') {
      if (actor !== 'owner')
        return json(
          { error: 'forbidden', message: 'Owner sign-in happens in TEST.' },
          403,
        );
      return json({ session: await signIn('owner') });
    }
    if (request.method === 'POST' && path === '/api/v1/auth/member') {
      return json({ session: await signIn('member') });
    }
    if (request.method === 'POST' && path === '/api/v1/auth/member/concierge') {
      const token = newToken();
      try {
        const session = await bridgeMemberSession(request, db, SIM_ENV, token);
        jar.set('member', token);
        return json({ session });
      } catch (error) {
        const code = error instanceof BackendError ? error.code : 'server';
        return json(
          { error: code, message: 'The simulated club did not recognise you.' },
          code === 'unauthorised' ? 401 : 403,
        );
      }
    }
    if (request.method === 'POST' && path === '/api/v1/auth/logout') {
      jar.clear(actor);
      return json({ ok: true });
    }
    // Every rehearsal member is signed in, as Alise would be.
    if (actor === 'member' && !(await sessionFor('member')))
      await signIn('member');
    if (actor === 'owner' && !(await sessionFor('owner')))
      await signIn('owner');
    // A plain Headers object: a browser Request would silently drop the
    // simulated cookie, which is a forbidden request header there.
    const headers = new Headers();
    request.headers.forEach((value, key) => headers.set(key, value));
    const token = jar.get(actor);
    if (token) headers.set('cookie', `__Host-thirty-session=${token}`);
    headers.delete('origin');
    const body =
      request.method === 'GET' || request.method === 'HEAD'
        ? ''
        : await request.text();
    const response = await api(
      {
        url: `https://rehearsal.thirty.club${url.pathname}${url.search}`,
        method: request.method,
        headers,
        text: () => Promise.resolve(body),
      } as unknown as Request,
      'rehearsal',
    );
    // Writes may have made letters due or queued SMS; run the round soon.
    if (request.method !== 'GET') scheduleRound();
    return response;
  }

  let rounding: Promise<{ published: number; sent: number }> | null = null;
  const round = () => {
    rounding ??= runRound(db).finally(() => (rounding = null));
    return rounding;
  };
  let pending: ReturnType<typeof setTimeout> | null = null;
  const scheduleRound = () => {
    if (pending) return;
    pending = setTimeout(() => {
      pending = null;
      void round();
    }, 1500);
  };

  return { pg, db, handle, round };
}

/**
 * The every-minute round, simulated: fire due journey milestones and
 * process journey events, publish due letters (the real code),
 * then run the real outbox worker against a fake provider. The provider is
 * a function in this file; it never calls `fetch`.
 */
async function runRound(db: Database) {
  await runJourneyRound(db);
  const { published } = await publishDueLetters(db);
  let sent = 0;
  const deliveries: { id: string; claimId: string; sid: string }[] = [];
  const fakeProvider = (async (_url: unknown, init?: RequestInit) => {
    const params = new URLSearchParams(String(init?.body ?? ''));
    const callback = new URL(params.get('StatusCallback') ?? 'https://x/');
    const sid = `SM${Array.from(crypto.getRandomValues(new Uint8Array(16)), (b) => b.toString(16).padStart(2, '0')).join('')}`;
    deliveries.push({
      id: callback.searchParams.get('messageId') ?? '',
      claimId: callback.searchParams.get('claimId') ?? '',
      sid,
    });
    return new Response(JSON.stringify({ sid, status: 'accepted' }), {
      status: 201,
      headers: { 'content-type': 'application/json' },
    });
  }) as typeof fetch;
  for (let n = 0; n < 20; n++) {
    const { processed } = await processMessages(
      db,
      { ...SIM_ENV, SMS_SENDING_ENABLED: 'true' },
      fakeProvider,
    );
    if (processed === 0) break;
    sent += processed;
  }
  for (const d of deliveries) {
    try {
      await db.action(null, 'system', 'system-message-callback', {
        id: d.id,
        claimId: d.claimId,
        providerSid: d.sid,
        state: 'delivered',
        error: null,
      });
    } catch {
      // A superseded attempt; the outbox keeps its own state.
    }
  }
  return { published, sent };
}

export function deleteSimDatabase(): Promise<void> {
  return new Promise((resolve) => {
    try {
      const request = indexedDB.deleteDatabase(`/pglite/${SIM_DATABASE}`);
      request.onsuccess = request.onerror = request.onblocked = () => resolve();
    } catch {
      resolve();
    }
  });
}
