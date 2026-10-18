import { describe, expect, it } from 'vitest';
import {
  MEDIA_ROOT,
  orderedMessages,
  realMessages,
  validateMessages,
  VIDEO_MESSAGES,
  type VideoMessage,
} from './videoMessages';

const make = (id: string, order: number): VideoMessage => ({
  id,
  sender: 'Someone',
  video: { src: `${MEDIA_ROOT}${id}.mp4`, type: 'video/mp4' },
  order,
});

describe('video messages', () => {
  it('ships only valid, clearly marked placeholders', () => {
    expect(validateMessages()).toEqual([]);
    expect(VIDEO_MESSAGES.length).toBeGreaterThan(0);
    expect(VIDEO_MESSAGES.every((m) => m.placeholder)).toBe(true);
  });

  it('never presents placeholders as real messages', () => {
    expect(realMessages()).toEqual([]);
  });

  it('orders by the order field without mutating the source', () => {
    const input = [make('b', 2), make('a', 1)];
    expect(orderedMessages(input).map((m) => m.id)).toEqual(['a', 'b']);
    expect(input.map((m) => m.id)).toEqual(['b', 'a']);
  });

  it('reports duplicates, bad ids and off-root paths', () => {
    const bad: VideoMessage[] = [
      make('a', 1),
      make('a', 1),
      { ...make('Bad Id', 2), poster: 'https://example.com/x.jpg' },
    ];
    const problems = validateMessages(bad).join('\n');
    expect(problems).toMatch(/duplicate id/);
    expect(problems).toMatch(/duplicate order/);
    expect(problems).toMatch(/lowercase/);
    expect(problems).toMatch(/must live under/);
  });
});
