import { getStore } from '@netlify/blobs';
import { timingSafeEqual } from 'node:crypto';
import {
  validateLetter,
  type DojaLetter,
} from '../../src/features/doja/letter.ts';

const KEY = 'letter';
const HEADERS = {
  'Content-Type': 'application/json; charset=utf-8',
  'Cache-Control': 'no-store',
  'X-Content-Type-Options': 'nosniff',
};

export interface LetterStore {
  get(key: string, options: { type: 'json' }): Promise<unknown>;
  setJSON(key: string, value: DojaLetter): Promise<unknown>;
}

function reply(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: HEADERS });
}

function matchesPassword(provided: string, expected: string): boolean {
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

/** A single public read and a password-protected write to one Blob key. */
export function createDojaHandler(store: LetterStore, password: string) {
  return async (request: Request): Promise<Response> => {
    if (request.method === 'GET') {
      try {
        const saved = await store.get(KEY, { type: 'json' });
        // Only the three authored fields ever leave this endpoint.
        return reply(200, {
          letter: saved ? validateLetter(saved) : null,
        });
      } catch {
        return reply(503, { error: 'The note is unavailable right now.' });
      }
    }
    if (request.method !== 'POST')
      return reply(405, { error: 'Method not allowed.' });
    if (
      !password ||
      !matchesPassword(
        request.headers.get('Authorization')?.replace(/^Bearer /u, '') ?? '',
        password,
      )
    )
      return reply(401, { error: 'The password is incorrect.' });
    if (new URL(request.url).searchParams.get('verify') === '1')
      return reply(200, { verified: true });
    try {
      const raw = await request.text();
      if (raw.length > 12_000)
        return reply(413, { error: 'The letter is too long.' });
      const letter = validateLetter(JSON.parse(raw) as unknown);
      await store.setJSON(KEY, letter);
      return reply(200, { letter });
    } catch (error) {
      if (error instanceof SyntaxError)
        return reply(400, { error: 'The letter could not be read.' });
      if (error instanceof Error && error.message.startsWith('Keep '))
        return reply(400, { error: error.message });
      if (
        error instanceof Error &&
        (error.message === 'Complete all three fields.' ||
          error.message.startsWith('Names must') ||
          error.message === 'Invalid letter.')
      )
        return reply(400, { error: error.message });
      return reply(503, {
        error: 'The letter could not be saved. Please try again.',
      });
    }
  };
}

export default function fromdoja(request: Request): Promise<Response> {
  const store = getStore({ name: 'fromdoja', consistency: 'strong' });
  return createDojaHandler(
    store,
    process.env.DOJA_LETTER_PASSWORD ?? '',
  )(request);
}
