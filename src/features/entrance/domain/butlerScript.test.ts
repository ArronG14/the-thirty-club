import { describe, expect, it } from 'vitest';
import {
  butlerContextFor,
  butlerLine,
  greetingFor,
  lineCount,
  WELCOME_LINES,
  type ButlerContext,
} from './butlerScript';

const contexts: ButlerContext[] = ['locked', 'final-minute', 'awaiting-entry'];

describe('butler script', () => {
  it('greets by the local time of day', () => {
    expect(greetingFor(8)).toBe('Good morning');
    expect(greetingFor(14)).toBe('Good afternoon');
    expect(greetingFor(21)).toBe('Good evening');
    expect(greetingFor(2)).toBe('Good evening');
  });

  it('opens with the membership line, greeting by time of day', () => {
    expect(butlerLine('locked', 0, 21)).toBe(
      'Good evening, Alise. Your membership has been approved. Unfortunately, management insists that you turn thirty before we permit you inside.',
    );
    expect(butlerLine('locked', 0, 9)).toMatch(/^Good morning, Alise\./);
  });

  it('never repeats a line on consecutive rings and cycles in order', () => {
    for (const context of contexts) {
      const count = lineCount(context);
      expect(count).toBeGreaterThan(1);
      for (let i = 0; i < count * 2; i += 1) {
        expect(butlerLine(context, i, 20)).not.toBe(
          butlerLine(context, i + 1, 20),
        );
      }
      expect(butlerLine(context, count, 20)).toBe(butlerLine(context, 0, 20));
    }
  });

  it('addresses her as Alise, never by a formal surname', () => {
    const all = [
      ...contexts.flatMap((context) =>
        Array.from({ length: lineCount(context) }, (_, i) =>
          butlerLine(context, i, 20),
        ),
      ),
      ...WELCOME_LINES,
    ];
    for (const line of all) {
      expect(line).not.toMatch(/Mrs|Khera/);
      expect(line.length).toBeGreaterThan(0);
    }
    expect(WELCOME_LINES.join(' ')).toBe(
      'Ah, Alise. There you are. We’ve been expecting you for thirty years.',
    );
  });

  it('holds his tongue while the doors are moving', () => {
    expect(butlerContextFor('unlocking')).toBeNull();
    expect(butlerContextFor('opening')).toBeNull();
    // In the lounge he speaks from the lounge script instead.
    expect(butlerContextFor('foyer')).toBeNull();
  });
});
