import {
  createHash,
  randomBytes,
  scrypt as scryptCallback,
  timingSafeEqual,
} from 'node:crypto';
import { promisify } from 'node:util';
import type { Session } from '../../src/shared/concierge/types.ts';
import { BackendError, type Database } from './database.ts';
const scrypt = promisify(scryptCallback);
export const hashToken = (token: string) =>
  createHash('sha256').update(token).digest('hex');
export const newToken = () => randomBytes(32).toString('base64url');
export async function passwordMatches(
  password: string,
  hash: string | undefined,
): Promise<boolean> {
  const [algorithm, salt, expected] = (hash ?? '').split('$');
  if (
    algorithm !== 'scrypt' ||
    !salt ||
    !expected ||
    !/^[a-f0-9]{128}$/.test(expected)
  )
    return false;
  const actual = (await scrypt(password, salt, 64)) as Buffer;
  return timingSafeEqual(actual, Buffer.from(expected, 'hex'));
}
export function cookieName(url: URL): string {
  return ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)
    ? 'thirty-session'
    : '__Host-thirty-session';
}
export function readToken(request: Request): string | null {
  const name = cookieName(new URL(request.url));
  const token = request.headers
    .get('cookie')
    ?.split(';')
    .map((x) => x.trim())
    .find((x) => x.startsWith(`${name}=`))
    ?.slice(name.length + 1);
  return token && /^[A-Za-z0-9_-]{43}$/.test(token) ? token : null;
}
export function sessionCookie(url: URL, token: string, maxAge: number): string {
  return `${cookieName(url)}=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${maxAge}${cookieName(url).startsWith('__Host-') ? '; Secure' : ''}`;
}
export async function requireSession(
  db: Database,
  request: Request,
): Promise<Session> {
  const token = readToken(request);
  if (!token) throw new BackendError('unauthorised');
  return db.action<Session>(null, 'system', 'system-session-read', {
    hash: hashToken(token),
  });
}
