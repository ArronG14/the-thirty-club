/** Local read-only checks; the source baseline was verified 21 October. */
import { execFileSync } from 'node:child_process';
import { readdirSync } from 'node:fs';
import assert from 'node:assert/strict';
import console from 'node:console';
const base = '2b328722154279410dba66266fdc64559c2ce8cd';
const story = '3db4d08d236889e8d38753818571d8b8f26b58d1';
const media = '0f11dda76568d11bb42ef9513a70af1d69a1f036';
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
for (const parent of [story, media])
  assert.equal(
    git('merge-base', parent, 'HEAD'),
    parent,
    'A reviewed story/media parent is missing.',
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
      storyParent: story,
      mediaParent: media,
      releaseScope: 'Complete 22–25 October, including all nine spins',
      mediaIntegration:
        'Locally combined; real R2 and physical iPhone checks remain separate.',
      preflightScope:
        'Local code and upgrade checks; does not certify production configuration or authorize a deployment.',
      productionWrites: false,
    },
    null,
    2,
  ),
);
