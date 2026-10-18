import { describe, expect, it } from 'vitest';
import {
  heldKey,
  holdKey,
  isPlausibleVaultToken,
  releaseKey,
} from './pendingKey';

const TOKEN = 'Q2b9yG-x_0kL3mN8pR4sT6uV1wX5yZ7aB9cD2eF4gH6';

function memory(): Storage {
  const map = new Map<string, string>();
  return {
    get length() {
      return map.size;
    },
    clear: () => map.clear(),
    getItem: (k) => map.get(k) ?? null,
    key: (i) => [...map.keys()][i] ?? null,
    removeItem: (k) => void map.delete(k),
    setItem: (k, v) => void map.set(k, v),
  };
}

describe('the held vault key', () => {
  it('holds a plausible key across reloads and releases it', () => {
    const store = memory();
    expect(holdKey(TOKEN, 1000, store)).toBe(true);
    expect(heldKey(2000, store)).toEqual({ credential: TOKEN, foundAt: 1000 });
    releaseKey(store);
    expect(heldKey(2000, store)).toBeNull();
  });

  it('refuses implausible keys', () => {
    const store = memory();
    expect(isPlausibleVaultToken('vault-003')).toBe(false);
    expect(holdKey('vault-003', 1000, store)).toBe(false);
    expect(heldKey(1000, store)).toBeNull();
  });

  it('forgets a key after six hours, and corrupt records', () => {
    const store = memory();
    holdKey(TOKEN, 0, store);
    expect(heldKey(6 * 60 * 60 * 1000 + 1, store)).toBeNull();
    store.setItem('thirty-club:vault-key', '{not json');
    expect(heldKey(0, store)).toBeNull();
  });

  it('survives unavailable storage', () => {
    expect(holdKey(TOKEN, 0, null)).toBe(false);
    expect(heldKey(0, null)).toBeNull();
  });
});
