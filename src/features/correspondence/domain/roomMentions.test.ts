import { describe, expect, it } from 'vitest';
import { mentionedPlaces } from './roomMentions';

describe('places a letter points to (ADR-024)', () => {
  it('the 19:00 membership letter never points at the birthday card', () => {
    const early =
      'Your membership card has been delivered. When you find it, hold your telephone to it.';
    expect(mentionedPlaces(early)).toEqual([]);
  });
  it('the airport letter offers her drinks; the card letter offers the card', () => {
    expect(
      mentionedPlaces(
        'The club would like you to have two drinks before the flight.',
      ).map((p) => p.path),
    ).toEqual(['/drinks']);
    expect(
      mentionedPlaces(
        'Your birthday card awaits you at the foot of this letter.',
      ).map((p) => p.path),
    ).toEqual(['/birthdaycard']);
  });
});
