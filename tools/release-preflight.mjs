/** Local, read-only release checks. Never touches hosted state. */
import { execFileSync } from 'node:child_process';
import console from 'node:console';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';

const EXPECTED_BASE = '54b9cf21fd0cfd4adb8ce250588fb1c4c6873b5d';
const RELEASE = [
  '20261022090000_birthday_journey.sql',
  '20261022100000_casino_rewards.sql',
  '20261022110000_communication_hold.sql',
  '20261022120000_sms_operations.sql',
  '20261022130000_membership_card_admission.sql',
];
const git = (...args) => execFileSync('git', args, { encoding: 'utf8' }).trim();
const fail = (message) => {
  throw new Error(message);
};

if (git('status', '--porcelain')) fail('The release checkout is not clean.');
const head = git('rev-parse', 'HEAD');
if (git('merge-base', EXPECTED_BASE, head) !== EXPECTED_BASE)
  fail('The release commit does not include the published production base.');
const migrations = readdirSync(resolve('supabase/migrations'))
  .filter((name) => name.endsWith('.sql'))
  .sort();
if (JSON.stringify(migrations.slice(-5)) !== JSON.stringify(RELEASE))
  fail('The pending migration set or order differs from the reviewed five.');

const teaser = readFileSync(resolve('supabase/migrations', RELEASE[3]), 'utf8');
const admission = readFileSync(
  resolve('supabase/migrations', RELEASE[4]),
  'utf8',
);
if (
  !teaser.includes('I trust your afternoon has been proceeding pleasantly.') ||
  !teaser.includes('The Butler 🎩') ||
  !admission.includes('A Most Unfortunate Delivery Incident') ||
  !admission.includes(
    'secured your membership card within her private quarters.',
  ) ||
  admission.includes('[[CLUE')
)
  fail('The approved 16:00 or 19:00 copy is missing from the migrations.');

console.log(
  JSON.stringify(
    {
      branch: git('branch', '--show-current'),
      head,
      productionBase: EXPECTED_BASE,
      pendingMigrations: RELEASE,
    },
    null,
    2,
  ),
);
