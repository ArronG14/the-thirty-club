// RETIRED as a sender (ADR-022): prints the Butler's Shopping Privilege
// announcement with --dry-run and refuses to send. Historically it sent it
// once, deliberately:  npm run butler:shopping
// Flags: --dry-run (send nothing), --force (send again after a previous send).
// Uses TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_FROM and ALISE_PHONE
// from the environment (.env is loaded by the npm script). Prints no
// credentials or phone numbers.
/* global process, console, fetch, Buffer, URLSearchParams, AbortSignal, URL */
import { existsSync, writeFileSync } from 'node:fs';
import { createInterface } from 'node:readline/promises';

const SITE = (process.env.SHOPPING_SITE_URL || 'https://30.ag14.co').replace(
  /\/+$/,
  '',
);
const LINK = `${SITE}/?concierge=shopping`;
const MARKER = new URL('../.butler-shopping-sent', import.meta.url);

const BODY = [
  'Madam, it appears you are enjoying a spot of online shopping.',
  'A lady of your standing should hardly be expected to finance her own indulgences.',
  'I have therefore taken the liberty of arranging a private Shopping Privilege for your enjoyment.',
  'Simply visit your Concierge Desk and advise me of the amount required.',
  'I shall personally attend to the necessary arrangements. There is absolutely no need to trouble your husband.',
  'At your service,',
  'Your Butler.',
  '',
  LINK,
].join('\n');

const args = new Set(process.argv.slice(2));
const missing = [
  'TWILIO_ACCOUNT_SID',
  'TWILIO_AUTH_TOKEN',
  'TWILIO_FROM',
  'ALISE_PHONE',
].filter((name) => !process.env[name]?.trim());

console.log(`Shopping Privilege announcement\nLink: ${LINK}`);
console.log(`Length: ${BODY.length} characters\n`);

if (missing.length > 0) {
  console.error(
    `Not sent. Missing environment variables: ${missing.join(', ')}`,
  );
  process.exit(1);
}
if (args.has('--dry-run')) {
  console.log(`${BODY}\n\nDry run: nothing was sent.`);
  process.exit(0);
}
// Retired (ADR-022, 20 October 2026): every SMS must pass the server's SMS
// policy and the communication hold, which this local script cannot check.
// The Shopping Privilege announcement was sent on 18 October and the
// privilege has been redeemed; there is nothing left for this script to do.
console.error(
  'Not sent. This script no longer sends SMS: every message goes through the Owner Control Centre (SMS operations), which enforces the hold and the SMS mode. --dry-run still prints the text.',
);
process.exit(1);
if (existsSync(MARKER) && !args.has('--force')) {
  console.error(
    'Not sent. The announcement was already sent from this machine. Use --force to send it again.',
  );
  process.exit(1);
}

const rl = createInterface({ input: process.stdin, output: process.stdout });
const answer = await rl.question(
  'This will send a REAL SMS to Alise. Type SEND to continue: ',
);
rl.close();
if (answer.trim() !== 'SEND') {
  console.log('Cancelled. Nothing was sent.');
  process.exit(1);
}

const sid = process.env.TWILIO_ACCOUNT_SID.trim();
const response = await fetch(
  `https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(sid)}/Messages.json`,
  {
    method: 'POST',
    headers: {
      authorization: `Basic ${Buffer.from(`${sid}:${process.env.TWILIO_AUTH_TOKEN.trim()}`).toString('base64')}`,
      'content-type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      To: process.env.ALISE_PHONE.trim(),
      From: process.env.TWILIO_FROM.trim(),
      Body: BODY,
    }),
    signal: AbortSignal.timeout(15000),
  },
).catch(() => null);
const data = response ? await response.json().catch(() => null) : null;
if (response?.ok && data?.sid && data.status !== 'failed') {
  writeFileSync(MARKER, `${new Date().toISOString()} ${data.sid}\n`);
  console.log(
    `Sent. Twilio accepted it (message ${data.sid}, ${data.status}).`,
  );
} else {
  console.error(
    `Not sent. Twilio ${response?.status ?? 'unreachable'}: ${data?.message ?? 'no description'}`,
  );
  process.exit(1);
}
