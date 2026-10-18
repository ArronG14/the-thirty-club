import { act, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FirstVisitCinematic } from './FirstVisitCinematic';
import {
  entranceReady,
  shouldPlayVerification,
  VERIFIED_KEY,
} from './firstVisit';

const memory = () => {
  const map = new Map<string, string>();
  return {
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => void map.set(k, v),
    removeItem: (k: string) => void map.delete(k),
  };
};

beforeEach(() => {
  vi.useFakeTimers();
  window.localStorage.clear();
  window.history.replaceState(null, '', '/');
  document.body.innerHTML = '<div id="root"></div>';
});
afterEach(() => {
  vi.useRealTimers();
  window.history.replaceState(null, '', '/');
});

describe('shouldPlayVerification', () => {
  it('plays on a first visit to the entrance only', () => {
    const storage = memory();
    expect(shouldPlayVerification(storage, false)).toBe(true);
    window.history.replaceState(null, '', '/departure');
    expect(shouldPlayVerification(storage, false)).toBe(false);
  });

  it('is bypassed on repeat visits', () => {
    const storage = memory();
    storage.setItem(VERIFIED_KEY, 'x');
    expect(shouldPlayVerification(storage, false)).toBe(false);
  });

  it('is skipped in owner mode and when storage is unreadable', () => {
    expect(shouldPlayVerification(memory(), true)).toBe(false);
    expect(shouldPlayVerification(null, false)).toBe(false);
  });

  it('replays on request, even for the owner, and tidies the URL', () => {
    const storage = memory();
    storage.setItem(VERIFIED_KEY, 'x');
    window.history.replaceState(null, '', '/?verify=replay');
    expect(shouldPlayVerification(storage, true)).toBe(true);
    expect(storage.getItem(VERIFIED_KEY)).toBeNull();
    expect(window.location.search).toBe('');
  });
});

describe('entranceReady', () => {
  it('resolves when loaders settle, including a failed asset', async () => {
    const ready = entranceReady([
      () => Promise.resolve(1),
      () => Promise.reject(new Error('chunk failed')),
    ]);
    await expect(ready).resolves.toBeUndefined();
  });

  it('never blocks past the cap when an asset hangs', async () => {
    let done = false;
    void entranceReady([() => new Promise(() => undefined)], 5_000).then(
      () => (done = true),
    );
    await vi.advanceTimersByTimeAsync(4_999);
    expect(done).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    expect(done).toBe(true);
  });
});

describe('the cinematic', () => {
  function play() {
    return render(
      <MemoryRouter>
        <FirstVisitCinematic />
      </MemoryRouter>,
    );
  }
  const advance = async (ms: number) => {
    // Beats chain through effects: step in slices so each one can schedule.
    for (let spent = 0; spent < ms; spent += 100) {
      await act(async () => {
        await vi.advanceTimersByTimeAsync(100);
      });
    }
  };

  it('runs the sequence, records completion, then leaves', async () => {
    play();
    expect(screen.getByText('Private membership authentication')).toBeTruthy();
    expect(document.getElementById('root')?.hasAttribute('inert')).toBe(true);
    await advance(5_000);
    expect(screen.getByText('Alise Gill')).toBeTruthy();
    await advance(2_500);
    expect(screen.queryByRole('status')).toBeNull();
    expect(window.localStorage.getItem(VERIFIED_KEY)).not.toBeNull();
    expect(document.getElementById('root')?.hasAttribute('inert')).toBe(false);
  });

  it('shows nothing on a repeat visit', () => {
    window.localStorage.setItem(VERIFIED_KEY, 'x');
    play();
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('extends gracefully while loading, and continues if loading stalls', async () => {
    // A hung font promise: readiness falls to the 10 s cap.
    Object.defineProperty(document, 'fonts', {
      configurable: true,
      value: { ready: new Promise(() => undefined) },
    });
    try {
      play();
      await advance(8_000);
      expect(screen.getByText('Verifying membership credentials')).toBeTruthy();
      await advance(2_100 + 6_000);
      expect(screen.queryByRole('status')).toBeNull();
    } finally {
      Reflect.deleteProperty(document, 'fonts');
    }
  });
});
