/** Rooms a letter can name, and the verb that invites her in. */
import type { RoomId } from '../../club/domain/rooms';

export const MENTIONS: readonly {
  id: RoomId;
  pattern: RegExp;
  verb: string;
}[] = [
  { id: 'casino', pattern: /\b(grand )?casino\b/i, verb: 'Enter' },
  {
    id: 'screening-room',
    pattern: /\bscreening room\b/i,
    verb: 'Take your seat in',
  },
  { id: 'gift-vault', pattern: /\b(gift )?vault\b/i, verb: 'Visit' },
  {
    id: 'departure-lounge',
    pattern: /\bdeparture lounge\b/i,
    verb: 'Proceed to',
  },
];

/** Rooms a letter's words refer to, in the order of the registry. */
export function mentionedRooms(text: string): RoomId[] {
  return MENTIONS.filter((m) => m.pattern.test(text)).map((m) => m.id);
}

/**
 * Places that are not rooms (ADR-024): the drinks privileges and the private
 * birthday card. The card is matched only as "birthday card", never the
 * membership card, so no letter before the birthday points at it.
 */
export const PLACES: readonly {
  id: 'drinks' | 'birthday-card';
  pattern: RegExp;
  label: string;
  path: string;
}[] = [
  {
    id: 'drinks',
    pattern: /\b(drinks|bring me a drink)\b/i,
    label: 'Your drinks',
    path: '/drinks',
  },
  {
    id: 'birthday-card',
    pattern: /\bbirthday ?card\b/i,
    label: 'Open your card',
    path: '/birthdaycard',
  },
];

export function mentionedPlaces(text: string) {
  return PLACES.filter((p) => p.pattern.test(text));
}
