/** Disposable PostgreSQL upgrade check for the consolidated local release. */
import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import process from 'node:process';
import { PGlite } from '@electric-sql/pglite';

const migrationDir = resolve('supabase/migrations');
const migrations = readdirSync(migrationDir)
  .filter((name) => name.endsWith('.sql'))
  .sort();
const pg = new PGlite();
const assert = (condition, detail) => {
  if (!condition) throw new Error(detail);
};

try {
  assert(
    migrations.length === 8,
    'expected six baseline and two release migrations',
  );
  await pg.exec(
    'create role anon; create role authenticated; create role service_role bypassrls;',
  );
  for (const name of migrations.slice(0, 6))
    await pg.exec(readFileSync(resolve(migrationDir, name), 'utf8'));

  // The hosted baseline already has seeded scheduled messages. An extra legacy
  // outbox row checks that widening the category constraint preserves data.
  await pg.exec(`insert into public.ttc_messages(label,body,category,timezone)
    values('Existing owner alert','Already queued','transactional-arron','Europe/London')`);
  const baseline = (
    await pg.query(`select id, category, state, body
    from public.ttc_messages order by id`)
  ).rows;

  for (const name of migrations.slice(6))
    await pg.exec(readFileSync(resolve(migrationDir, name), 'utf8'));

  const after = (
    await pg.query(`select id, category, state, body
    from public.ttc_messages order by id`)
  ).rows;
  assert(
    JSON.stringify(baseline) === JSON.stringify(after),
    'existing outbox rows changed',
  );
  assert(
    migrations[6]?.includes('gift_vault') &&
      migrations[7]?.includes('correspondence_desk'),
    'Vault and Correspondence migration order changed',
  );

  const tables = (
    await pg.query(`select c.relname, c.relrowsecurity,
      has_table_privilege('anon',c.oid,'SELECT') as anon_select,
      has_table_privilege('authenticated',c.oid,'SELECT') as authenticated_select,
      has_table_privilege('service_role',c.oid,'SELECT') as service_select
    from pg_class c join pg_namespace n on n.oid=c.relnamespace
    where n.nspname='public' and c.relname in ('ttc_vaults','ttc_letters','ttc_letter_replies')
    order by c.relname`)
  ).rows;
  assert(tables.length === 3, 'missing release table');
  for (const table of tables)
    assert(
      table.relrowsecurity &&
        !table.anon_select &&
        !table.authenticated_select &&
        table.service_select,
      `unsafe table grants/RLS: ${table.relname}`,
    );

  const policies = (
    await pg.query(`select tablename, policyname, roles, cmd
    from pg_policies where schemaname='public'
      and tablename in ('ttc_vaults','ttc_letters','ttc_letter_replies')
    order by tablename`)
  ).rows;
  assert(
    policies.length === 3 &&
      policies.every(
        (p) =>
          p.policyname === 'service_only' &&
          p.roles.includes('service_role') &&
          p.cmd === 'ALL',
      ),
    'unsafe release RLS policies',
  );

  const functions = (
    await pg.query(`select p.proname,
      has_function_privilege('anon',p.oid,'EXECUTE') as anon_execute,
      has_function_privilege('authenticated',p.oid,'EXECUTE') as authenticated_execute,
      has_function_privilege('service_role',p.oid,'EXECUTE') as service_execute
    from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and (p.proname like 'ttc_vault%'
      or p.proname like 'ttc_letter%' or p.proname like 'ttc_correspondence%')
    order by p.proname`)
  ).rows;
  assert(functions.length >= 9, 'missing release functions');
  for (const fn of functions)
    assert(
      !fn.anon_execute && !fn.authenticated_execute && fn.service_execute,
      `unsafe function grants: ${fn.proname}`,
    );

  const constraint = (
    await pg.query(`select pg_get_constraintdef(oid) as definition
    from pg_constraint where conname='ttc_messages_category_check'`)
  ).rows[0]?.definition;
  assert(
    constraint &&
      [
        'scheduled-alise',
        'transactional-arron',
        'correspondence-alise',
        'correspondence-arron',
      ].every((category) => constraint.includes(category)),
    'outbox category compatibility failed',
  );

  await pg.exec('set role anon');
  let anonDenied = false;
  try {
    await pg.query(`select public.ttc_correspondence_action(null,'system',
      'system-correspondence-publish','{"templates":{}}')`);
  } catch {
    anonDenied = true;
  } finally {
    await pg.exec('reset role');
  }
  assert(anonDenied, 'anonymous role could execute Correspondence RPC');

  await pg.exec('set role service_role');
  const vault = (
    await pg.query(
      `select public.ttc_vault_action(null,'owner','owner-vault-list','{}') as result`,
    )
  ).rows[0]?.result;
  assert(
    Array.isArray(vault?.vaults),
    'Vault RPC failed after Correspondence migration',
  );
  const desk = (
    await pg.query(`select public.ttc_correspondence_action(null,'system',
    'system-correspondence-publish','{"templates":{}}') as result`)
  ).rows[0]?.result;
  assert(
    desk?.published === 0,
    'Correspondence RPC failed after Vault migration',
  );
  await pg.exec('reset role');

  process.stdout.write(
    JSON.stringify(
      {
        applied: migrations,
        baselineMessagesPreserved: baseline.length,
        tables,
        policies,
        restrictedFunctions: functions.length,
        categoryConstraint: constraint,
        anonymousRpcDenied: anonDenied,
        vaultRpc: 'pass',
        correspondenceRpc: 'pass',
      },
      null,
      2,
    ) + '\n',
  );
} finally {
  await pg.close();
}
