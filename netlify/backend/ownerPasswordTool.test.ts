import { randomBytes, scryptSync } from 'node:crypto';
import { expect, it } from 'vitest';
import { passwordMatches } from './auth.ts';
it('the owner password tools produce a hash the server accepts', async () => {
  const salt = randomBytes(32).toString('hex');
  const hash = `scrypt$${salt}$${scryptSync('a-very-long-owner-password', salt, 64).toString('hex')}`;
  expect(await passwordMatches('a-very-long-owner-password', hash)).toBe(true);
  expect(await passwordMatches('wrong-password-xxxxxx', hash)).toBe(false);
});
