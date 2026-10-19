/**
 * The butler in the Members' Lounge. Scripted, reviewed and shipped in the
 * bundle; no live AI. Copy remains subject to owner approval (D02).
 *
 * He speaks in three registers:
 *   induction — the one-time membership ceremony;
 *   briefing  — what he says on arrival: greeting, news, next destination;
 *   concierge — lines when Alise rings for service.
 */
import { greetingFor, WELCOME_LINES } from '../../entrance/domain/butlerScript';
import type { MembershipRecord } from './membershipRecord';
import {
  nextOpening,
  recommendedRoom,
  unannounced,
  type RoomView,
} from './clubState';
import type { RoomId } from './rooms';

export type InductionBeatId = 'welcome' | 'club' | 'member' | 'card';

export interface InductionBeat {
  id: InductionBeatId;
  lines: readonly string[];
}

export const INDUCTION: readonly InductionBeat[] = [
  {
    id: 'welcome',
    lines: WELCOME_LINES,
  },
  {
    id: 'club',
    lines: [
      'Welcome to The Thirty Club. Established this evening, at considerable expense and with a great deal of fuss, for a membership of precisely one.',
    ],
  },
  {
    id: 'member',
    lines: [
      'You are its sole member, Alise. Which makes you, by some distance, its most distinguished.',
    ],
  },
  {
    id: 'card',
    lines: [
      'Your membership card. Lifetime, naturally. Do try not to lose it; I had to sign for it.',
    ],
  },
];

/** How Alise came to be standing in the lounge. */
export type Arrival =
  /** She has just accepted her membership. */
  | 'induction'
  /** A member who has just walked in through the doors. */
  | 'entrance'
  /** A member returning to the app. */
  | 'return'
  /** Already here: news while she sits in the lounge. */
  | 'present';

export type BriefingKind = 'invitation' | 'reminder' | 'later' | 'complete';

export interface Briefing {
  kind: BriefingKind;
  /** The destination he is guiding her towards, if any. */
  destination: RoomView | null;
  lines: string[];
  /** Rooms this briefing introduces; record them so he never repeats it. */
  introduces: RoomId[];
}

function greeting(arrival: Arrival, hour: number): string | null {
  switch (arrival) {
    case 'induction':
    case 'present':
      return null;
    case 'entrance':
      return WELCOME_LINES[0];
    case 'return':
      return `${greetingFor(hour)}, Alise. Welcome back.`;
  }
}

export function loungeBriefing({
  views,
  record,
  hour,
  arrival,
}: {
  views: readonly RoomView[];
  record: MembershipRecord;
  hour: number;
  arrival: Arrival;
}): Briefing {
  const lines: string[] = [];
  const hello = greeting(arrival, hour);
  if (hello) lines.push(hello);

  const fresh = unannounced(views, record);
  const destination = recommendedRoom(views);
  for (const view of fresh) {
    if (view !== destination && view.room.butler)
      lines.push(view.room.butler.announcement);
  }
  const introduces = fresh.map((view) => view.room.id);

  if (destination?.room.butler) {
    const introduced = !fresh.includes(destination);
    lines.push(
      introduced
        ? destination.room.butler.reminder
        : destination.room.butler.invitation,
    );
    return {
      kind: introduced ? 'reminder' : 'invitation',
      destination,
      lines,
      introduces,
    };
  }
  if (nextOpening(views)) {
    lines.push(
      'The rest of the club opens later today. I shall come and find you the moment it does.',
    );
    return { kind: 'later', destination: null, lines, introduces };
  }
  lines.push(
    'You have seen everything the club has to offer, Alise. For now. Every room remains at your disposal.',
  );
  return { kind: 'complete', destination: null, lines, introduces };
}

/** Rung from the lounge. Played in order, then cycled. */
export const CONCIERGE_LINES: readonly string[] = [
  'You rang, Alise? I was, of course, already standing here.',
  'Do make yourself comfortable. The sofa has been told to expect you.',
  'The fire was lit at a quarter to midnight. It has been showing off ever since.',
  'Your husband asked me to mention that he arranged all of this. I have mentioned it. I shall not be mentioning it again.',
  'Should you lose your way, the Members’ Directory is on the wall by the hearth. I am also available, at all hours, regrettably.',
  'If you require a glass of champagne, I can recommend the champagne. If you require two, I can recommend the champagne.',
];

export function conciergeLine(index: number): string {
  const n = CONCIERGE_LINES.length;
  return CONCIERGE_LINES[((index % n) + n) % n] ?? '';
}

/** When Alise reaches for a room that is open but not yet ready. */
/** Spoken as he shows her to her seat in the Private Screening Room. */
export const SCREENING_ESCORT_LINE = 'This way, Madam. Your seat is ready.';

export function preparingLine(roomName: string): string {
  return `${roomName} is still being prepared, Alise. I shall come and fetch you the moment it is ready.`;
}
