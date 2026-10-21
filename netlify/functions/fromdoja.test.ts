import { describe, expect, it } from 'vitest';
import { createDojaHandler, type LetterStore } from './fromdoja.ts';
import { wordCount, type DojaLetter } from '../../src/features/doja/letter.ts';

const URL = 'https://club.example/.netlify/functions/fromdoja';
const sample: DojaLetter = {
  addressedTo: 'Alise',
  message: 'A first line!\nA second line?\n\nAnd a new paragraph — exactly.',
  from: 'Doja',
};

function fixture() {
  const data = new Map<string, DojaLetter>();
  const store: LetterStore = {
    async get(key) {
      return data.get(key) ?? null;
    },
    async setJSON(key, value) {
      data.set(key, value);
    },
  };
  const handle = createDojaHandler(store, 'test-password');
  const request = (body?: unknown, password?: string, suffix = '') =>
    handle(
      new Request(
        URL + suffix,
        body === undefined
          ? { method: 'GET' }
          : {
              method: 'POST',
              headers: password ? { Authorization: `Bearer ${password}` } : {},
              body: JSON.stringify(body),
            },
      ),
    );
  return { data, request, handle };
}

describe('Doja letter storage boundary', () => {
  it('starts empty, rejects unauthorised writes, and saves only the letter', async () => {
    const { data, request } = fixture();
    expect((await (await request()).json()).letter).toBeNull();
    expect((await request(sample)).status).toBe(401);
    expect((await request(sample, 'wrong')).status).toBe(401);
    expect(data.size).toBe(0);
    expect((await request(sample, 'test-password')).status).toBe(200);
    expect([...data.keys()]).toEqual(['letter']);
    expect((await (await request()).json()).letter).toEqual(sample);
  });

  it('preserves punctuation, whitespace, and newlines across handler instances', async () => {
    const { data, request } = fixture();
    await request(sample, 'test-password');
    const second = createDojaHandler(
      {
        async get(key) {
          return data.get(key) ?? null;
        },
        async setJSON(key, value) {
          data.set(key, value);
        },
      },
      'test-password',
    );
    const response = await second(new Request(URL));
    expect((await response.json()).letter.message).toBe(sample.message);
    expect(response.headers.get('cache-control')).toBe('no-store');
  });

  it('verifies the password without writing and enforces 500 words', async () => {
    const { data, request } = fixture();
    expect((await request({}, 'test-password', '?verify=1')).status).toBe(200);
    expect(data.size).toBe(0);
    expect(wordCount('a\n b   c')).toBe(3);
    const long = { ...sample, message: Array(501).fill('word').join(' ') };
    expect((await request(long, 'test-password')).status).toBe(400);
    expect(data.size).toBe(0);
  });
});
