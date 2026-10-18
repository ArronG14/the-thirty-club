#!/usr/bin/env node
/* global process, console */
/**
 * Prints the build variables for the optional offline membership fallback
 * (src/features/concierge/client/offlineMembership.ts).
 *
 *   node tools/membership-hash.mjs <membership-token> <membership-code>
 *
 * Set the two printed values as Netlify build environment variables. They
 * are digests, not the secrets, but a short code's digest can be guessed;
 * treat the fallback as ceremonial.
 */
import { createHash } from 'node:crypto';

const [token, code] = process.argv.slice(2);
if (!token || !code) {
  console.error('Usage: node tools/membership-hash.mjs <token> <code>');
  process.exit(1);
}
const digest = (kind, value) =>
  createHash('sha256').update(`thirty-club:${kind}:${value}`).digest('hex');
const normalised = code
  .toUpperCase()
  .replace(/[^A-Z0-9]/g, '')
  .slice(0, 64);
console.log(`VITE_MEMBERSHIP_TOKEN_SHA256=${digest('token', token.trim())}`);
console.log(`VITE_MEMBERSHIP_CODE_SHA256=${digest('code', normalised)}`);
