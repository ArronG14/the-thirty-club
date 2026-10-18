import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  browserEntranceStorage,
  emptyRecord,
  ENTRANCE_RECORD_KEY,
  parseRecord,
  serialiseRecord,
} from './entranceRecord';

const seen = '2026-10-24T00:00:05.000Z';

afterEach(() => {
  vi.restoreAllMocks();
  window.localStorage.clear();
});

describe('entrance record', () => {
  it('round-trips through its versioned serialisation', () => {
    const record = { unlockedAt: seen, ceremonySeenAt: seen };
    expect(parseRecord(serialiseRecord(record))).toEqual(record);
  });

  it.each([
    null,
    '',
    'not json',
    '[]',
    '{"version":2,"unlockedAt":"2026-10-24T00:00:05.000Z"}',
    '{"version":1,"unlockedAt":"yesterday"}',
  ])('treats unusable data %j as an empty record', (raw) => {
    expect(parseRecord(raw)).toEqual(emptyRecord);
  });

  it('infers the unlock from a completed ceremony', () => {
    expect(parseRecord(`{"version":1,"ceremonySeenAt":"${seen}"}`)).toEqual({
      unlockedAt: seen,
      ceremonySeenAt: seen,
    });
  });

  it('persists to localStorage', () => {
    const storage = browserEntranceStorage();
    storage.save({ unlockedAt: seen, ceremonySeenAt: null });
    expect(window.localStorage.getItem(ENTRANCE_RECORD_KEY)).toContain(seen);
    expect(storage.load().unlockedAt).toBe(seen);
  });

  it('degrades quietly when storage is unavailable', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('SecurityError');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('QuotaExceededError');
    });
    const storage = browserEntranceStorage();
    expect(storage.load()).toEqual(emptyRecord);
    expect(() =>
      storage.save({ unlockedAt: seen, ceremonySeenAt: null }),
    ).not.toThrow();
  });
});
