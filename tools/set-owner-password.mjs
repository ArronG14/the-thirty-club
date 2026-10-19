/**
 * Sets YOUR OWN Owner Console password on the live site, in one step.
 *
 *   npm run owner:set-password
 *
 * - Asks for the new password twice (never echoed, at least 16 characters).
 * - Hashes it locally with the same scrypt format the server checks
 *   (`scrypt$<salt>$<hash>`, netlify/backend/auth.ts). The password itself
 *   never leaves this Mac and is never written to disk.
 * - Stores only the hash as the secret Netlify variable OWNER_PASSWORD_HASH
 *   (production context) with the Netlify CLI you are already logged in to,
 *   then starts a production redeploy so the Functions read it.
 *
 * Existing owner sessions stay valid until they expire (8 hours). Nothing
 * else is changed: no other variable, no database, no SMS setting.
 */
import { randomBytes, scryptSync } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import process from 'node:process';
import console from 'node:console';
import readline from 'node:readline';

const SITE_ID = 'cfd647a2-2f6f-4059-98d3-a73ca131f786'; // thirty-club (30.ag14.co)
const NETLIFY = ['--yes', 'netlify-cli@27.13.0'];

if (!process.stdin.isTTY) {
  console.error('Run this in a terminal: the password is typed, not piped.');
  process.exit(1);
}

function ask(prompt) {
  return new Promise((resolve) => {
    readline.emitKeypressEvents(process.stdin);
    process.stdin.setRawMode(true);
    process.stdout.write(prompt);
    let text = '';
    const onKey = (chunk, key) => {
      if (key?.ctrl && key.name === 'c') {
        process.stdin.setRawMode(false);
        process.exit(130);
      }
      if (key?.name === 'return') {
        process.stdin.off('keypress', onKey);
        process.stdin.setRawMode(false);
        process.stdout.write('\n');
        resolve(text);
        return;
      }
      if (key?.name === 'backspace') text = text.slice(0, -1);
      else if (chunk && !key?.ctrl) text += chunk;
    };
    process.stdin.on('keypress', onKey);
  });
}

async function choose() {
  for (;;) {
    const first = await ask('New Owner Console password (16+ characters): ');
    if (first.length < 16) {
      console.log('Please use at least 16 characters.');
      continue;
    }
    if ((await ask('Type it again: ')) === first) return first;
    console.log('Those did not match. Try again.');
  }
}
const salt = randomBytes(32).toString('hex');
const hash = `scrypt$${salt}$${scryptSync(await choose(), salt, 64).toString('hex')}`;

console.log('Saving the hash to Netlify (production, secret)…');
execFileSync(
  'npx',
  [
    ...NETLIFY,
    'env:set',
    'OWNER_PASSWORD_HASH',
    hash,
    '--secret',
    '--context',
    'production',
    '--force',
    '--site',
    SITE_ID,
  ],
  { stdio: ['ignore', 'ignore', 'inherit'] },
);
console.log('Starting a production redeploy so the Functions read it…');
execFileSync(
  'npx',
  [
    ...NETLIFY,
    'api',
    'createSiteBuild',
    '--data',
    JSON.stringify({ site_id: SITE_ID }),
  ],
  { stdio: ['ignore', 'ignore', 'inherit'] },
);
console.log(
  'Done. In about two minutes, sign in at https://30.ag14.co/concierge/owner with your new password.',
);
