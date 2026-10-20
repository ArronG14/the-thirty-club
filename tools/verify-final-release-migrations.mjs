/**
 * Disposable PostgreSQL rehearsal of the final release's database step
 * (docs/FINAL_INTEGRATION_RELEASE_HANDOVER.md). Applies the nine migrations
 * the hosted project already has, seeds LIVE-like records (a redeemed
 * privilege, a published letter, outbox rows, a vault), then applies the
 * three release migrations in order and checks that nothing existing
 * changed, the communication hold is active, and every new table and
 * function is closed to browser roles. Run: node tools/verify-final-release-migrations.mjs
 * It never connects to a hosted database.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import console from 'node:console';
import process from 'node:process';
import { PGlite } from '@electric-sql/pglite';

const RELEASE = [
  '20261022090000_birthday_journey.sql',
  '20261022100000_casino_rewards.sql',
  '20261022110000_communication_hold.sql',
];
const dir = resolve('supabase/migrations');
const all = readdirSync(dir)
  .filter((name) => name.endsWith('.sql'))
  .sort();
const assert = (condition, detail) => {
  if (!condition) throw new Error(detail);
};
const pg = new PGlite();
const rows = async (sql, params) => (await pg.query(sql, params)).rows;

try {
  assert(
    JSON.stringify(all.slice(-3)) === JSON.stringify(RELEASE),
    `release migrations must be the last three, in order: ${RELEASE.join(', ')}`,
  );
  const baseline = all.slice(0, -3);
  assert(baseline.length === 9, 'expected the nine hosted migrations first');
  await pg.exec(
    'create role anon; create role authenticated; create role service_role bypassrls;',
  );
  for (const name of baseline)
    await pg.exec(readFileSync(resolve(dir, name), 'utf8'));

  // LIVE-like records that must survive untouched.
  await pg.exec(`
    insert into public.ttc_privileges(slug,title,kind,opens_at,min_amount_pence,max_amount_pence)
      values ('shopping','Shopping','beauty',now() - interval '3 days',100,10000);
    insert into public.ttc_redemptions(member_id,privilege_id,kind,state,amount_pence,idempotency_key,fingerprint,fulfilled_at)
      select m.id,p.id,'beauty','fulfilled',10000,'live-shopping-redeemed','{}',now()
      from public.ttc_members m, public.ttc_privileges p where m.slug='alise' and p.slug='shopping';
    with m as (insert into public.ttc_messages(label,body,category,timezone,state)
        values('Letter · Existing','Invitation','correspondence-alise','Europe/London','delivered') returning id)
    insert into public.ttc_letters(member_id,title,body,deliver_at,state,published_at,invitation_message_id,opened_at)
      select (select id from public.ttc_members where slug='alise'),'An existing letter','Body',now(),'published',now(),m.id,now() from m;
    insert into public.ttc_messages(label,body,category,send_at,timezone,state,approved_at,next_attempt_at)
      values ('Queued to Alise','Not yet sent','correspondence-alise',now(),'Europe/London','approved',now(),now()),
             ('Queued to Arron','Owner alert','transactional-arron',now(),'Europe/London','approved',now(),now());
    insert into public.ttc_vaults(slug,display_number,clue,gift_location,trigger,nfc_token,nfc_token_hash,backup_code,backup_code_hash)
      values('vault-001',1,'A clue','A place','manual','${'C'.repeat(43)}','hash-1','AAAA-BBBB-CCCC','hash-2');`);
  const snapshot = async () => ({
    redemptions: await rows('select * from public.ttc_redemptions order by id'),
    privileges: await rows('select * from public.ttc_privileges order by id'),
    vaults: await rows('select * from public.ttc_vaults order by id'),
    letters: await rows(
      'select id,title,body,state,published_at,opened_at from public.ttc_letters order by id',
    ),
    messages: await rows(
      "select id,label,state from public.ttc_messages where label <> 'Queued to Alise' order by id",
    ),
  });
  const before = await snapshot();

  for (const name of RELEASE)
    await pg.exec(readFileSync(resolve(dir, name), 'utf8'));

  const after = await snapshot();
  assert(
    JSON.stringify(before) === JSON.stringify(after),
    'an existing redemption, privilege, vault, letter or outbox row changed',
  );
  const queued = await rows(
    "select state, last_error from public.ttc_messages where label = 'Queued to Alise'",
  );
  assert(
    queued[0]?.state === 'cancelled' && /Held/.test(queued[0].last_error),
    'an unsent SMS to Alise was not held',
  );
  const hold = await rows('select * from public.ttc_communication_hold');
  assert(
    hold.length === 1 &&
      hold[0].active === true &&
      new Date(hold[0].release_not_before).toISOString() ===
        '2026-10-21T05:00:00.000Z',
    'the communication hold is not active until 21 Oct 00:00 Jamaica',
  );
  const early = await rows(
    "select state, fire_at from public.ttc_journey_milestones where key='early-membership'",
  );
  assert(
    early[0]?.state === 'held' &&
      new Date(early[0].fire_at).toISOString() === '2026-10-21T05:00:00.000Z',
    'the Lounge introduction is not held on 21 October',
  );
  const armed = (
    await rows(
      "select key from public.ttc_journey_milestones where state='pending' order by key",
    )
  ).map((r) => r.key);
  assert(
    JSON.stringify(armed) ===
      JSON.stringify([
        'birthday-screening',
        'birthday-vault',
        'casino-opening',
      ]),
    `unexpected armed milestones: ${armed.join(', ')}`,
  );
  // The hold is enforced in the database itself.
  let refused = false;
  try {
    await pg.exec(
      "update public.ttc_messages set state='approved', approved_at=now() where label='Queued to Alise'",
    );
  } catch (error) {
    refused = /on-hold/.test(error.message);
  }
  assert(refused, 'the hold did not refuse an SMS to Alise');

  for (const fn of [
    'public.ttc_journey_action(uuid,text,text,jsonb)',
    'public.ttc_journey_publish(text,text,text,jsonb)',
    'public.ttc_room_admitted(uuid,text)',
    'public.ttc_journey_hook(text,jsonb,text)',
    'public.ttc_casino_action(uuid,text,text,jsonb)',
    'public.ttc_hold_action(uuid,text,text,jsonb)',
  ])
    assert(
      (await rows('select to_regprocedure($1) is not null as ok', [fn]))[0].ok,
      `missing ${fn}`,
    );

  const tables = await rows(`select c.relname, c.relrowsecurity,
      has_table_privilege('anon',c.oid,'SELECT') as anon,
      has_table_privilege('authenticated',c.oid,'SELECT') as auth
    from pg_class c join pg_namespace n on n.oid=c.relnamespace
    where n.nspname='public' and c.relkind='r' and (c.relname like 'ttc_journey%' or c.relname like 'ttc_room%'
      or c.relname like 'ttc_casino%' or c.relname in ('ttc_prize_catalogue','ttc_reward_entitlements',
      'ttc_voucher_requests','ttc_communication_hold'))`);
  assert(
    tables.length === 10,
    `expected 10 release tables, found ${tables.length}`,
  );
  for (const t of tables)
    assert(
      t.relrowsecurity && !t.anon && !t.auth,
      `unsafe grants or RLS: ${t.relname}`,
    );
  const functions = await rows(`select p.proname,
      has_function_privilege('anon',p.oid,'EXECUTE') as anon,
      has_function_privilege('authenticated',p.oid,'EXECUTE') as auth
    from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and (p.proname like 'ttc_journey%' or p.proname like 'ttc_room%'
      or p.proname like 'ttc_casino%' or p.proname like 'ttc_hold%' or p.proname like 'ttc_letter%')`);
  for (const f of functions)
    assert(!f.anon && !f.auth, `browser roles can execute ${f.proname}`);

  console.log(
    JSON.stringify(
      {
        migrations: all.length,
        release: RELEASE,
        existingRecordsUnchanged: true,
        unsentAliseSmsHeld: true,
        holdActiveUntil: '2026-10-21T00:00 America/Jamaica',
        earlyMembership: 'held, 21 October, time not chosen',
        armed,
        releaseTables: tables.length,
        releaseFunctionsClosedToBrowserRoles: functions.length,
      },
      null,
      2,
    ),
  );
} catch (error) {
  console.error(`FAILED: ${error.message}`);
  process.exitCode = 1;
} finally {
  await pg.close();
}
