/** Local read-only checks; the source baseline was verified 21 October. */
import { execFileSync } from 'node:child_process';
import { readdirSync } from 'node:fs';
import assert from 'node:assert/strict';
import console from 'node:console';
const base = '2b328722154279410dba66266fdc64559c2ce8cd';
const pending = '20261022150000_story_sequence.sql';
const git = (...args) => execFileSync('git', args, { encoding: 'utf8' }).trim();
assert.equal(
  git('status', '--porcelain'),
  '',
  'Commit all reviewed changes before release.',
);
assert.equal(
  git('merge-base', base, 'HEAD'),
  base,
  'The verified release base is missing.',
);
const files = readdirSync('supabase/migrations')
  .filter((f) => f.endsWith('.sql'))
  .sort();
assert.equal(files.length, 16);
assert.equal(files.at(-1), pending);
console.log(
  JSON.stringify(
    {
      branch: git('branch', '--show-current'),
      commit: git('rev-parse', 'HEAD'),
      verifiedBase: base,
      hostedMigrationCountObserved: 15,
      pendingMigrations: [pending],
      mediaIntegration:
        'Separate branch 7e676d9; not merged or device-tested by this release.',
      productionWrites: false,
    },
    null,
    2,
  ),
);
