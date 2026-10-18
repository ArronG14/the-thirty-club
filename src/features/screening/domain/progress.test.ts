import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  adjacentIndex,
  collectionComplete,
  freshProgress,
  loadProgress,
  parseProgress,
  progressReducer,
  resumeIndex,
  saveProgress,
} from './progress';
import type { VideoMessage } from './videoMessages';
const messages: VideoMessage[] = ['one', 'two'].map((id, order) => ({
  id,
  order,
  sender: id,
  video: { src: `/media/screening/${id}.mp4`, type: 'video/mp4' },
}));
afterEach(() => {
  localStorage.clear();
  vi.restoreAllMocks();
});
describe('screening progress', () => {
  it('starts only on selection, resumes the last selected message and never watches a skip', () => {
    const first = progressReducer(freshProgress(), {
      type: 'select',
      id: 'one',
    });
    const skipped = progressReducer(first, { type: 'select', id: 'two' });
    expect(skipped.started).toBe(true);
    expect(skipped.watched).toEqual([]);
    expect(resumeIndex(messages, skipped)).toBe(1);
    expect(adjacentIndex(0, -1, 2)).toBe(0);
    expect(adjacentIndex(1, 1, 2)).toBe(1);
    expect(adjacentIndex(1, -1, 2)).toBe(0);
  });
  it('finishing the last clip does not complete skipped messages; replay preserves watched history', () => {
    const last = progressReducer(freshProgress(), { type: 'ended', id: 'two' });
    expect(collectionComplete(messages, last)).toBe(false);
    const all = progressReducer(last, { type: 'ended', id: 'one' });
    expect(collectionComplete(messages, all)).toBe(true);
    expect(progressReducer(all, { type: 'select', id: 'one' }).watched).toEqual(
      ['two', 'one'],
    );
    expect(collectionComplete([], all)).toBe(false);
  });
  it('persists premiere, playback position and completed messages across reloads', () => {
    const record = {
      ...freshProgress(),
      started: true,
      lastId: 'two',
      watched: ['one'],
      positions: { two: 12.5 },
    };
    expect(saveProgress(record)).toBe(true);
    expect(loadProgress(messages)).toEqual(record);
  });
  it('rejects corrupt/foreign records and sanitises invalid or removed content', () => {
    for (const raw of ['bad json', 'null', '[]', '{"version":2}'])
      expect(parseProgress(raw, messages)).toEqual(freshProgress());
    const recovered = parseProgress(
      JSON.stringify({
        version: 1,
        started: 'yes',
        lastId: 'gone',
        watched: ['gone', 'one', 'one', 4],
        positions: { one: -4, two: 12, gone: 5 },
      }),
      messages,
    );
    expect(recovered).toEqual({
      ...freshProgress(),
      watched: ['one'],
      positions: { two: 12 },
    });
  });
  it('survives unavailable device storage', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('full');
    });
    expect(loadProgress(messages)).toEqual(freshProgress());
    expect(saveProgress(freshProgress())).toBe(false);
  });
});
