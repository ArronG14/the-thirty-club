/** Public, read-only smoke checks after the owner publishes a deploy. */
/* global fetch, AbortSignal */
import console from 'node:console';
import process from 'node:process';
import { URL } from 'node:url';
const origin = new URL(process.argv[2] ?? 'https://30.ag14.co');
if (!['https:', 'http:'].includes(origin.protocol))
  throw new Error('Supply an HTTP(S) origin.');
const get = async (path) => {
  const response = await fetch(new URL(path, origin), {
    method: 'GET',
    redirect: 'error',
    signal: AbortSignal.timeout(10_000),
  });
  return response;
};

const home = await get('/');
if (
  home.status !== 200 ||
  !home.headers.get('content-type')?.includes('text/html')
)
  throw new Error(`The public entrance returned ${home.status}, not HTML 200.`);
const session = await get('/api/v1/auth/session');
if (
  session.status !== 401 ||
  !session.headers.get('content-type')?.includes('application/json')
)
  throw new Error(
    `The unauthenticated API returned ${session.status}, not JSON 401.`,
  );
const body = await session.json();
if (!body || typeof body !== 'object' || !('error' in body))
  throw new Error('The unauthenticated API response lacks an error code.');

console.log(
  `PASS ${origin.origin}: entrance HTML 200; unauthenticated API JSON 401.`,
);
