/** Current hosted fifteen migrations -> one story migration, in disposable PostgreSQL. */
import { readFileSync, readdirSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import assert from 'node:assert/strict';
import console from 'node:console';
const pg = new PGlite();
const files = readdirSync('supabase/migrations')
  .filter((f) => f.endsWith('.sql'))
  .sort();
const upgrade = '20261022150000_story_sequence.sql';
try {
  assert.equal(files.at(-1), upgrade);
  assert.equal(files.length, 16);
  await pg.exec(
    'create role anon;create role authenticated;create role service_role bypassrls;',
  );
  for (const f of files.slice(0, -1))
    await pg.exec(readFileSync(`supabase/migrations/${f}`, 'utf8'));
  await pg.exec(`
 update public.ttc_communication_hold set active=false,released_at=now();
 update public.ttc_sms_operations set mode='live',live_since='2026-10-21T00:00:00Z';
 update public.ttc_journey_milestones set state='fired',fired_at=now() where key='early-membership';
 insert into public.ttc_membership_card(member_id) select id from public.ttc_members where slug='alise';
 insert into public.ttc_room_admissions(member_id,room_id,state,invited_via,letter_title,letter_body,admitted_at)
 select id,'lounge','admitted','event','Existing membership','Already admitted','2026-10-21T18:04:27.352437Z'::timestamptz from public.ttc_members where slug='alise';
 insert into public.ttc_messages(label,body,category,timezone,state) values('Existing delivered teaser','Already sent','scheduled-alise','Europe/London','delivered');
 insert into public.ttc_messages(label,body,category,timezone,state,send_at,approved_at) values('Existing approved message','Already approved','correspondence-alise','America/Jamaica','approved',now(),now());
 `);
  const protectedState = async () => ({
    admissions: (
      await pg.query(
        'select * from public.ttc_room_admissions order by member_id,room_id',
      )
    ).rows,
    card: (
      await pg.query(
        'select member_id,first_presented_at,last_presented_at,presentations from public.ttc_membership_card',
      )
    ).rows,
    completedMilestones: (
      await pg.query(
        "select key,state,effects,fired_at from public.ttc_journey_milestones where state='fired'",
      )
    ).rows,
    messages: (await pg.query('select * from public.ttc_messages order by id'))
      .rows,
    hold: (await pg.query('select * from public.ttc_communication_hold')).rows,
    sms: (await pg.query('select * from public.ttc_sms_operations')).rows,
  });
  const snapshotSql = readFileSync(
    'docs/release/progress-snapshot.sql',
    'utf8',
  );
  const releaseBefore = (await pg.query(snapshotSql)).rows;
  const before = await protectedState();
  await pg.exec(readFileSync(`supabase/migrations/${upgrade}`, 'utf8'));
  assert.deepEqual(
    await protectedState(),
    before,
    'Completed admission, card, sends or operational holds changed',
  );
  assert.deepEqual(
    (await pg.query(snapshotSql)).rows,
    releaseBefore,
    'Operator progress snapshot changed across the upgrade',
  );
  const unsafe = (
    await pg.query(`select p.proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace
 where n.nspname='public' and (p.proname like '%before_story' or p.proname='ttc_story_prize_event')
 and (has_function_privilege('anon',p.oid,'execute') or has_function_privilege('authenticated',p.oid,'execute'))`)
  ).rows;
  assert.deepEqual(unsafe, [], 'Wrapper functions exposed to browser roles');
  const table = (
    await pg.query(`select c.relrowsecurity,has_table_privilege('anon',c.oid,'select') anon,
 has_table_privilege('authenticated',c.oid,'select') auth from pg_class c where c.oid='public.ttc_departure_introduction'::regclass`)
  ).rows[0];
  assert.deepEqual(table, { relrowsecurity: true, anon: false, auth: false });
  assert.equal(
    (
      await pg.query(
        "select count(*)::int n from public.ttc_journey_milestones where story_managed and state='pending'",
      )
    ).rows[0].n,
    0,
  );
  console.log(
    JSON.stringify(
      {
        baseline: 15,
        upgrade,
        completedAdmissionPreserved: true,
        existingMessagesUnchanged: true,
        holdsUnchanged: true,
        browserRolesDenied: true,
        storyMilestonesHeld: true,
      },
      null,
      2,
    ),
  );
} finally {
  await pg.close();
}
