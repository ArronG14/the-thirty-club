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
