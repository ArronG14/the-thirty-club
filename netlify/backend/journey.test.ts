// @vitest-environment node
/**
 * The birthday journey on PostgreSQL (PGlite) with every real migration.
 * Time is controlled the way the rehearsal engine controls it: every `now()`
 * in the migrations follows `ttc_sim_now()`, an offset from the real clock.
 */
import { mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { MemberLetter } from '../../src/shared/concierge/types.ts';
import type {
  AcceptAdmissionResult,
  MemberJourney,
  OwnerJourney,
  OwnerMilestone,
} from '../../src/shared/journey/contract.ts';
import { createBackendApi } from './api.ts';
import { hashToken, newToken } from './auth.ts';
import { BackendError, rpcFor, type Database } from './database.ts';
import { publishJourneyEvent, runJourneyRound } from './journey.ts';

const MIGRATIONS = resolve('supabase/migrations');
const JOURNEY_MIGRATION = '20261022090000_birthday_journey.sql';
const CLOCK_SQL = `
create table public.ttc_sim_clock(offset_ms bigint not null);
insert into public.ttc_sim_clock values (0);
create function public.ttc_sim_now() returns timestamptz
  language sql stable set search_path = '' as
  $$ select pg_catalog.now() + make_interval(secs => (select offset_ms from public.ttc_sim_clock) / 1000.0) $$;
`;
const rewriteClock = (sql: string) =>
  sql.replace(/(?<![\w.])now\(\)/g, 'public.ttc_sim_now()');

async function migrate(
  pg: PGlite,
  filter: (file: string) => boolean = () => true,
) {
  for (const file of readdirSync(MIGRATIONS).sort().filter(filter))
    await pg.exec(rewriteClock(readFileSync(join(MIGRATIONS, file), 'utf8')));
}

async function freshDatabase(dataDir?: string) {
  const pg = new PGlite(dataDir);
  await pg.exec(
    'create role anon; create role authenticated; create role service_role bypassrls;',
  );
  await pg.exec(CLOCK_SQL);
  await migrate(pg);
  // Delivery is under test here; the hold (ADR-021) is tested in hold.test.ts.
  await pg.exec(
    'update public.ttc_communication_hold set active = false, released_at = now()',
  );
  return pg;
}

function databaseFor(pg: PGlite): Database {
  return {
    async action<T>(
      actor: string | null,
      role: string,
      action: string,
      input = {},
    ) {
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
            : 'server',
        );
      }
    },
  };
}

let pg: PGlite;
let db: Database;
let member: string;
const ownerToken = newToken();
const memberToken = newToken();

/** Sets the database clock to an instant. */
async function at(iso: string) {
  await pg.query('update public.ttc_sim_clock set offset_ms = $1', [
    Date.parse(iso) - Date.now(),
  ]);
}

async function call<T = Record<string, unknown>>(
  path: string,
  body?: unknown,
  role: 'owner' | 'member' = 'owner',
  method?: 'GET' | 'POST' | 'PATCH',
): Promise<{ status: number; data: T }> {
  const api = createBackendApi({ db, env: {} });
  const response = await api(
    new Request(`https://30.ag14.co/api/v1${path}`, {
      method: method ?? (body === undefined ? 'GET' : 'POST'),
      headers: {
        'content-type': 'application/json',
        'x-concierge-request': '1',
        origin: 'https://30.ag14.co',
        cookie: `__Host-thirty-session=${role === 'owner' ? ownerToken : memberToken}`,
      },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    }),
    'test-ip',
  );
  return { status: response.status, data: (await response.json()) as T };
}

const journey = async () =>
  (await call<MemberJourney>('/journey', undefined, 'member')).data;
const owner = async () => (await call<OwnerJourney>('/owner/journey')).data;
const letters = async () =>
  (
    await call<{ letters: MemberLetter[] }>(
      '/correspondence',
      undefined,
      'member',
    )
  ).data.letters;
const milestone = async (key: string) =>
  (await owner()).milestones.find((m) => m.key === key) as OwnerMilestone;
const accept = (room: string) =>
  call<AcceptAdmissionResult>(
    `/journey/admissions/${room}/accept`,
    {},
    'member',
  );
const invite = (room: string) =>
  call(`/owner/journey/rooms/${room}/invite`, {});
const roomState = async (room: string) =>
  (await owner()).admissions.find((a) => a.roomId === room)!.state;

async function signIn() {
  await pg.query(
    "insert into public.ttc_sessions(token_hash,role,member_id,expires_at) values($1,'member',$2,now()+interval '400 days'),($3,'owner',null,now()+interval '400 days') on conflict do nothing",
    [hashToken(memberToken), member, hashToken(ownerToken)],
  );
}

beforeAll(async () => {
  pg = await freshDatabase();
  db = databaseFor(pg);
  member = (
    await pg.query<{ id: string }>(
      "select id from public.ttc_members where slug='alise'",
    )
  ).rows[0]!.id;
  await pg.exec(
    'create table public.seeded_milestones as select * from public.ttc_journey_milestones',
  );
}, 60000);

beforeEach(async () => {
  await pg.query('update public.ttc_sim_clock set offset_ms = 0');
  await pg.exec(
    `truncate public.ttc_journey_events, public.ttc_room_admissions, public.ttc_letter_replies, public.ttc_letters,
     public.ttc_sessions, public.ttc_messages, public.ttc_message_delivery_logs, public.ttc_activity_events,
     public.ttc_casino_batches cascade;
     delete from public.ttc_journey_milestones;
     insert into public.ttc_journey_milestones select * from public.seeded_milestones;`,
  );
  await at('2026-10-19T21:00:00Z');
  await signIn();
});

afterAll(async () => {
  await pg?.close();
});

describe('room admission lifecycle', () => {
  it('a locked room is never listed to her and cannot be accepted', async () => {
    const state = await journey();
    expect(state.admissions).toEqual([]);
    expect(await roomState('casino')).toBe('locked');
    const refused = await accept('casino');
    expect(refused.status).toBe(403);
    expect(refused.data).toMatchObject({ error: 'not-open' });
  });

  it('an invitation persists a Letter of Admission and a summons to the Lounge', async () => {
    await invite('casino');
    const state = await journey();
    expect(state.admissions).toHaveLength(1);
    expect(state.admissions[0]).toMatchObject({
      roomId: 'casino',
      state: 'invited',
      admittedAt: null,
    });
    expect(state.admissions[0]!.letter!.title).toMatch(/Grand Casino/);
    const mail = await letters();
    expect(mail).toHaveLength(1);
    expect(mail[0]!.action).toEqual({
      kind: 'admission',
      roomId: 'casino',
      label: 'ENTER THE MEMBERS’ LOUNGE',
    });
    // The summons is an ordinary Desk letter: unread until opened, and its
    // SMS invitation waits in the outbox for the global switch.
    expect(mail[0]!.status).toBe('published');
    const sms = await pg.query<{ state: string; category: string }>(
      'select state, category from public.ttc_messages',
    );
    expect(sms.rows).toEqual([
      { state: 'approved', category: 'correspondence-alise' },
    ]);
    // A refresh, or a second device, sees the same invitation.
    expect((await journey()).admissions).toEqual(state.admissions);
  });

  it('inviting twice never makes a second letter', async () => {
    await invite('casino');
    await invite('casino');
    expect(await letters()).toHaveLength(1);
  });

  it('accepting admits her exactly once, and the summons is settled', async () => {
    await invite('casino');
    const first = await accept('casino');
    expect(first.status).toBe(201);
    expect(first.data.duplicate).toBe(false);
    expect(first.data.admission).toMatchObject({
      state: 'admitted',
      letter: null,
    });
    const again = await accept('casino');
    expect(again.status).toBe(200);
    expect(again.data.duplicate).toBe(true);
    expect(again.data.admission.admittedAt).toBe(
      first.data.admission.admittedAt,
    );
    const [summons] = await letters();
    expect(summons!.openedAt).not.toBeNull();
    const sms = await pg.query<{ state: string }>(
      'select state from public.ttc_messages',
    );
    expect(sms.rows[0]!.state).toBe('cancelled');
    const accepted = await pg.query(
      "select 1 from public.ttc_journey_events where type='room.admission.accepted'",
    );
    expect(accepted.rows).toHaveLength(1);
  });

  it('concurrent acceptances admit once', async () => {
    await invite('screening-room');
    const results = await Promise.all([
      accept('screening-room'),
      accept('screening-room'),
      accept('screening-room'),
    ]);
    expect(results.filter((r) => r.data.duplicate === false)).toHaveLength(1);
    expect(
      (
        await pg.query(
          "select 1 from public.ttc_activity_events where type='journey.room.admitted'",
        )
      ).rows,
    ).toHaveLength(1);
  });

  it('an accepted admission can never be withdrawn; an invitation can', async () => {
    await invite('gift-vault');
    const withdrawn = await call(
      '/owner/journey/rooms/gift-vault/withdraw',
      {},
    );
    expect(withdrawn.data).toMatchObject({ state: 'locked' });
    expect((await journey()).admissions).toEqual([]);
    await invite('gift-vault');
    expect(await letters()).toHaveLength(2);
    await accept('gift-vault');
    const refused = await call('/owner/journey/rooms/gift-vault/withdraw', {});
    expect(refused.status).toBe(409);
    expect(await roomState('gift-vault')).toBe('admitted');
  });

  it('the server guard for other systems answers truthfully', async () => {
    const admitted = async () =>
      (
        await pg.query<{ ok: boolean }>(
          'select public.ttc_room_admitted($1,$2) as ok',
          [member, 'casino'],
        )
      ).rows[0]!.ok;
    expect(await admitted()).toBe(false);
    await invite('casino');
    expect(await admitted()).toBe(false);
    await accept('casino');
    expect(await admitted()).toBe(true);
  });

  it('only the member may read or accept, and only the owner may invite', async () => {
    expect((await call('/journey')).status).toBe(403);
    expect((await call('/owner/journey', undefined, 'member')).status).toBe(
      403,
    );
    expect(
      (await call('/owner/journey/rooms/casino/invite', {}, 'member')).status,
    ).toBe(403);
    expect((await call('/owner/journey/rooms/kitchen/invite', {})).status).toBe(
      400,
    );
  });
});

describe('Casino events through the shared contract', () => {
  const spins = (
    batch: string,
    quantity = 5,
    extra: Record<string, unknown> = {},
  ) =>
    publishJourneyEvent(db, {
      type: 'casino.spins.issued',
      source: 'casino',
      key: `spins-batch-${batch}`,
      payload: { batchId: batch, quantity, ...extra },
    });

  it('spins for an admitted member bring one letter with RETURN TO THE GRAND CASINO', async () => {
    await invite('casino');
    await accept('casino');
    const { event } = await spins('b1');
    expect(event.state).toBe('processed');
    const mail = (await letters()).filter((l) => l.action?.kind === 'return');
    expect(mail).toHaveLength(1);
    expect(mail[0]!.body).toContain('5 additional spins');
    expect(mail[0]!.action).toEqual({
      kind: 'return',
      roomId: 'casino',
      label: 'RETURN TO THE GRAND CASINO',
    });
    // No second Letter of Admission, and no second admission letter.
    expect((await journey()).admissions[0]).toMatchObject({
      state: 'admitted',
      letter: null,
    });
    expect(
      (await letters()).filter((l) => l.action?.kind === 'admission'),
    ).toHaveLength(1);
  });

  it('a retried publication is the same event and never a second letter', async () => {
    await invite('casino');
    await accept('casino');
    const first = await spins('b2');
    const second = await spins('b2');
    expect(second.event.id).toBe(first.event.id);
    expect(
      (await letters()).filter((l) => l.action?.kind === 'return'),
    ).toHaveLength(1);
    // Same key, different details: a publisher bug, refused.
    await expect(spins('b2', 6)).rejects.toMatchObject({
      code: 'idempotency-conflict',
    });
  });

  it('spins before admission wait silently, then follow the admission', async () => {
    const early = await spins('b3', 3);
    expect(early.event.state).toBe('deferred');
    expect(await letters()).toHaveLength(0); // The Casino is still a secret.
    await invite('casino');
    await runJourneyRound(db);
    expect(
      (await letters()).filter((l) => l.action?.kind === 'return'),
    ).toHaveLength(0);
    await accept('casino');
    const back = (await letters()).filter((l) => l.action?.kind === 'return');
    expect(back).toHaveLength(1);
    expect(back[0]!.body).toContain('3 additional spins');
  });

  it('announce:false records the batch without a letter', async () => {
    await invite('casino');
    await accept('casino');
    const { event } = await spins('opening', 5, { announce: false });
    expect(event.state).toBe('recorded');
    expect(
      (await letters()).filter((l) => l.action?.kind === 'return'),
    ).toHaveLength(0);
  });

  it('the publisher may supply the Butler’s words', async () => {
    await invite('casino');
    await accept('casino');
    await spins('b4', 2, {
      letter: { title: 'A word from the owner', body: 'Two more, Madam.' },
    });
    expect(
      (await letters()).some((l) => l.title === 'A word from the owner'),
    ).toBe(true);
  });

  it('a malformed event fails visibly and can be retried by the owner', async () => {
    await invite('casino');
    await accept('casino');
    const { event } = await publishJourneyEvent(db, {
      type: 'casino.spins.issued',
      source: 'casino',
      key: 'spins-batch-bad',
      payload: { batchId: 'bad', quantity: 0 },
    });
    expect(event.state).toBe('failed');
    const listed = (await owner()).events.find((e) => e.id === event.id)!;
    expect(listed.lastError).toMatch(/quantity/);
    const retry = await call<{ event: { state: string } }>(
      `/owner/journey/events/${event.id}/retry`,
      {},
    );
    expect(retry.data.event.state).toBe('failed');
  });

  it('records events with no reaction, and SQL publication joins the caller’s transaction', async () => {
    await pg.exec(`begin;
      select public.ttc_journey_publish('casino.spins.available','casino','spins-available-0001','{"available":2}');
      rollback;`);
    expect(
      (await owner()).events.filter((e) => e.type === 'casino.spins.available'),
    ).toHaveLength(0);
    await pg.query(
      "select public.ttc_journey_publish('casino.spins.available','casino','spins-available-0001','{\"available\":2}')",
    );
    await runJourneyRound(db);
    const [recorded] = (await owner()).events.filter(
      (e) => e.type === 'casino.spins.available',
    );
    expect(recorded!.state).toBe('recorded');
  });
});

describe('milestones', () => {
  it('nothing fires before its time; the round fires it once when due', async () => {
    await runJourneyRound(db);
    expect((await milestone('casino-opening')).state).toBe('pending');
    await at('2026-10-23T14:00:30Z'); // 09:00:30 in Jamaica
    const first = await runJourneyRound(db);
    expect(first.fired).toBe(1); // the Casino; early membership is held
    const again = await runJourneyRound(db);
    expect(again.fired).toBe(0);
    const casino = await milestone('casino-opening');
    expect(casino).toMatchObject({
      state: 'fired',
      firedVia: 'schedule',
      progress: 'delivered',
    });
    expect(await roomState('casino')).toBe('invited');
    await accept('casino');
    expect((await milestone('casino-opening')).progress).toBe('completed');
  });

  it('a held milestone never fires, and resumes when released', async () => {
    await call('/owner/journey/milestones/casino-opening/hold', {});
    await at('2026-10-23T18:00:00Z');
    await runJourneyRound(db);
    expect((await milestone('casino-opening')).state).toBe('held');
    expect(await roomState('casino')).toBe('locked');
    const resumed = await call<{ milestone: OwnerMilestone }>(
      '/owner/journey/milestones/casino-opening/resume',
      {},
    );
    // Already due: it fires in the same call rather than later by surprise.
    expect(resumed.data.milestone.state).toBe('fired');
    expect(await roomState('casino')).toBe('invited');
  });

  it('a manual trigger fires exactly once, early, even if held', async () => {
    await call('/owner/journey/milestones/birthday-screening/hold', {});
    const fired = await Promise.all([
      call('/owner/journey/milestones/birthday-screening/fire', {}),
      call('/owner/journey/milestones/birthday-screening/fire', {}),
    ]);
    expect(fired.every((r) => r.status === 200)).toBe(true);
    const m = await milestone('birthday-screening');
    expect(m).toMatchObject({ state: 'fired', firedVia: 'owner', attempts: 1 });
    expect(
      (await letters()).filter((l) => l.action?.roomId === 'screening-room'),
    ).toHaveLength(1);
    await at('2026-10-24T06:00:00Z');
    await runJourneyRound(db);
    expect((await milestone('birthday-screening')).attempts).toBe(1);
    expect(
      (await letters()).filter((l) => l.action?.roomId === 'screening-room'),
    ).toHaveLength(1);
  });

  it('the owner can delay a milestone; a fired one cannot be edited', async () => {
    const later = '2026-10-23T19:00:00.000Z'; // 14:00 Jamaica
    const moved = await call<{ milestone: OwnerMilestone }>(
      '/owner/journey/milestones/casino-opening',
      { fireAt: later },
      'owner',
      'PATCH',
    );
    expect(moved.data.milestone.fireAt).toBe(later.replace('.000Z', '+00:00'));
    await at('2026-10-23T15:00:00Z');
    await runJourneyRound(db);
    expect(await roomState('casino')).toBe('locked');
    await at('2026-10-23T19:00:01Z');
    await runJourneyRound(db);
    expect(await roomState('casino')).toBe('invited');
    const refused = await call(
      '/owner/journey/milestones/casino-opening',
      { fireAt: '2026-10-25T00:00:00Z' },
      'owner',
      'PATCH',
    );
    expect(refused.status).toBe(409);
  });

  it('the Casino hook issues the milestone’s spins once, however often it runs', async () => {
    const batches = async () =>
      (
        await pg.query<{ quantity: number; key: string }>(
          'select quantity, idempotency_key as key from public.ttc_casino_batches',
        )
      ).rows;
    // A bad configuration fails only this milestone and issues nothing.
    await pg.query(
      `update public.ttc_journey_milestones set effects = '[{"type":"hook","name":"casino.spins.issue","params":{"quantity":0}}]'
       where key = 'casino-opening-spins'`,
    );
    const failed = await call<{ milestone: OwnerMilestone }>(
      '/owner/journey/milestones/casino-opening-spins/fire',
      {},
    );
    expect(failed.data.milestone.state).toBe('failed');
    expect(await batches()).toEqual([]);
    // The owner corrects it; the retry issues exactly one batch.
    await call(
      '/owner/journey/milestones/casino-opening-spins',
      {
        effects: [
          {
            type: 'hook',
            name: 'casino.spins.issue',
            params: { quantity: 5, announce: false },
          },
        ],
      },
      'owner',
      'PATCH',
    );
    const retried = await call<{ milestone: OwnerMilestone }>(
      '/owner/journey/milestones/casino-opening-spins/retry',
      {},
    );
    expect(retried.data.milestone.state).toBe('fired');
    await call('/owner/journey/milestones/casino-opening-spins/fire', {});
    await at('2026-10-23T15:00:00Z');
    await runJourneyRound(db);
    expect(await batches()).toEqual([
      { quantity: 5, key: 'milestone:casino-opening-spins:0' },
    ]);
    const issued = (await owner()).events.filter(
      (e) => e.type === 'casino.spins.issued',
    );
    expect(issued).toHaveLength(1);
    expect(issued[0]!.state).toBe('recorded'); // announce:false at the opening
  });

  it('the owner can create a custom milestone, held until released', async () => {
    const created = await call<{ milestone: OwnerMilestone }>(
      '/owner/journey/milestones',
      {
        key: 'pool-cocktails',
        title: 'Cocktails by the pool',
        fireAt: '2026-10-24T21:00:00Z',
        effects: [
          {
            type: 'letter',
            title: 'By the pool',
            body: 'Madam, a cocktail awaits.',
          },
        ],
      },
    );
    expect(created.status).toBe(201);
    expect(created.data.milestone.state).toBe('held');
    const bad = await call('/owner/journey/milestones', {
      key: 'bad-one',
      title: 'Bad',
      fireAt: '2026-10-24T21:00:00Z',
      effects: [{ type: 'grant-prize' }],
    });
    expect(bad.status).toBe(400);
  });

  it('default milestones are seeded in Jamaica time and only rooms are armed', async () => {
    const { milestones } = await owner();
    const byKey = Object.fromEntries(milestones.map((m) => [m.key, m]));
    expect(byKey['casino-opening']!.fireAt).toBe('2026-10-23T14:00:00+00:00');
    expect(byKey['birthday-screening']!.fireAt).toBe(
      '2026-10-24T05:00:00+00:00',
    );
    expect(byKey['birthday-breakfast']!.fireAt).toBe(
      '2026-10-24T15:30:00+00:00',
    );
    expect(
      milestones
        .filter((m) => m.state === 'pending')
        .map((m) => m.key)
        .sort(),
    ).toEqual(['birthday-screening', 'birthday-vault', 'casino-opening']);
    // The Lounge introduction moved to 21 October and waits for the owner.
    expect(byKey['early-membership']).toMatchObject({
      state: 'held',
      fireAt: '2026-10-21T05:00:00+00:00',
    });
  });
});

describe('durability', () => {
  it('a scheduled milestone survives a restart and fires once afterwards', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'journey-restart-'));
    try {
      let disk = await freshDatabase(dir);
      await disk.query('update public.ttc_sim_clock set offset_ms = $1', [
        Date.parse('2026-10-22T12:00:00Z') - Date.now(),
      ]);
      await runJourneyRound(databaseFor(disk)); // nothing due yet
      await disk.close();
      // The "server" restarts; the schedule is still in the database.
      disk = new PGlite(dir);
      await disk.query('update public.ttc_sim_clock set offset_ms = $1', [
        Date.parse('2026-10-23T14:01:00Z') - Date.now(),
      ]);
      const restarted = databaseFor(disk);
      await runJourneyRound(restarted);
      await runJourneyRound(restarted);
      const rows = await disk.query<{
        key: string;
        state: string;
        attempts: number;
      }>(
        "select key, state, attempts from public.ttc_journey_milestones where key in ('early-membership','casino-opening') order by key",
      );
      expect(rows.rows).toEqual([
        { key: 'casino-opening', state: 'fired', attempts: 1 },
        { key: 'early-membership', state: 'held', attempts: 0 },
      ]);
      await disk.close();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }, 60000);

  it('the migration preserves existing redemptions and letters untouched', async () => {
    const older = new PGlite();
    try {
      await older.exec(
        'create role anon; create role authenticated; create role service_role bypassrls;',
      );
      await older.exec(CLOCK_SQL);
      await migrate(older, (f) => f < JOURNEY_MIGRATION);
      await older.exec(`
        insert into public.ttc_privileges(slug,title,kind,opens_at,min_amount_pence,max_amount_pence)
          values ('shopping-test','Shopping','beauty',now(),100,10000);
        insert into public.ttc_redemptions(member_id,privilege_id,kind,state,amount_pence,idempotency_key,fingerprint,fulfilled_at)
          select m.id,p.id,'beauty','fulfilled',10000,'redeemed-before-journey','{}',now()
          from public.ttc_members m, public.ttc_privileges p where m.slug='alise' and p.slug='shopping-test';
        insert into public.ttc_letters(member_id,title,body,deliver_at,state)
          select id,'An existing letter','Words.',now(),'scheduled' from public.ttc_members where slug='alise';`);
      const snapshot = async () =>
        (
          await older.query(
            `select r.*, (select row_to_json(l) from public.ttc_letters l limit 1) as letter
             from public.ttc_redemptions r`,
          )
        ).rows;
      const before = await snapshot();
      await migrate(older, (f) => f >= JOURNEY_MIGRATION);
      const after = await snapshot();
      expect(after).toHaveLength(1);
      const letterAfter = (after[0] as { letter: Record<string, unknown> })
        .letter;
      const letterBefore = (before[0] as { letter: Record<string, unknown> })
        .letter;
      // Only the new, empty columns were added to the letter.
      expect(letterAfter).toEqual({
        ...letterBefore,
        journey_ref: null,
        action_kind: null,
        action_room: null,
        action_label: null,
      });
      const withoutLetter = (row: unknown) =>
        Object.fromEntries(
          Object.entries(row as Record<string, unknown>).filter(
            ([key]) => key !== 'letter',
          ),
        );
      const redemptionAfter = withoutLetter(after[0]);
      const redemptionBefore = withoutLetter(before[0]);
      expect(redemptionAfter).toEqual(redemptionBefore);
    } finally {
      await older.close();
    }
  }, 60000);
});

describe('Jamaica time', () => {
  it('stores Jamaica wall-clock milestones as the right UTC instants', async () => {
    const rows = await pg.query<{ key: string; local: string }>(
      `select key, to_char(fire_at at time zone 'America/Jamaica','YYYY-MM-DD HH24:MI') as local
       from public.ttc_journey_milestones where key in ('casino-opening','birthday-screening','birthday-breakfast','early-membership')
       order by key`,
    );
    expect(Object.fromEntries(rows.rows.map((r) => [r.key, r.local]))).toEqual({
      'birthday-breakfast': '2026-10-24 10:30',
      'birthday-screening': '2026-10-24 00:00',
      'casino-opening': '2026-10-23 09:00',
      'early-membership': '2026-10-21 00:00',
    });
  });
});
