/**
 * The club's room registry: one list every navigation surface reads (the
 * butler's guidance, the Members' Directory, the room gate). Adding a room
 * means adding an entry here, then flipping `built` once it really exists.
 *
 * The Secret Chamber is a stretch goal and deliberately absent.
 */
import { instantInZone, ROOM_SCHEDULE } from './schedule';

export type RoomId =
  | 'entrance'
  | 'lounge'
  | 'screening-room'
  | 'casino'
  | 'gift-vault'
  | 'privileges';

export type UnlockRule =
  /** Open to anyone who has reached the lounge. */
  | { kind: 'always' }
  /** Opens once the membership has been presented. */
  | { kind: 'membership' }
  /** Opens at a fixed instant (configured in schedule.ts). */
  | { kind: 'scheduled'; at: number };

export interface ButlerRoomLines {
  /** The first invitation, spoken when the room is recommended. */
  invitation: string;
  /** A brief nudge on later visits while the room is still recommended. */
  reminder: string;
  /** Spoken once when a scheduled room opens. */
  announcement: string;
}

export interface RoomDefinition {
  id: RoomId;
  name: string;
  unlock: UnlockRule;
  /** Position in the recommended evening; null for rooms never recommended. */
  sequence: number | null;
  /**
   * True only when this build contains a working room. Unbuilt rooms are
   * listed honestly and are never offered as a destination.
   */
  built: boolean;
  /** Where the room lives once built. */
  path: string;
  butler: ButlerRoomLines | null;
}

export const ROOMS: readonly RoomDefinition[] = [
  {
    id: 'entrance',
    name: 'The Grand Entrance',
    unlock: { kind: 'always' },
    sequence: null,
    built: true,
    path: '/',
    butler: null,
  },
  {
    id: 'lounge',
    name: 'The Members’ Lounge',
    unlock: { kind: 'always' },
    sequence: null,
    built: true,
    path: '/',
    butler: null,
  },
  {
    id: 'screening-room',
    name: 'The Private Screening Room',
    unlock: { kind: 'membership' },
    sequence: 1,
    built: true,
    path: '/rooms/screening-room',
    butler: {
      invitation:
        'Before we begin the festivities, Alise, a number of rather important people have requested an audience with you. They are waiting in the Private Screening Room. I have asked them to behave.',
      reminder:
        'Your guests are still waiting in the Private Screening Room, Alise. They have been very patient. Mostly.',
      announcement: 'The Private Screening Room is ready for you, Alise.',
    },
  },
  {
    id: 'casino',
    name: 'The Grand Casino',
    unlock: { kind: 'scheduled', at: instantInZone(ROOM_SCHEDULE.casino) },
    sequence: 2,
    built: true,
    path: '/rooms/casino',
    butler: {
      invitation:
        'The Grand Casino is open, Alise. I am told the house always wins. Tonight, as it happens, the house is yours.',
      reminder:
        'The tables in the Grand Casino are still waiting, Alise. So is the croupier, who is pretending not to be.',
      announcement:
        'A small announcement, Alise: the Grand Casino has opened its doors.',
    },
  },
  {
    id: 'gift-vault',
    name: 'The Gift Vault',
    unlock: {
      kind: 'scheduled',
      at: instantInZone(ROOM_SCHEDULE['gift-vault']),
    },
    sequence: 3,
    built: false,
    path: '/rooms/gift-vault',
    butler: {
      invitation:
        'The Gift Vault awaits, Alise. I am told it contains things of considerable value. I am also told to say nothing further, so I shan’t.',
      reminder:
        'The Gift Vault remains unopened, Alise. I check on it hourly. It has not budged.',
      announcement:
        'Forgive the interruption, Alise. The Gift Vault is now open.',
    },
  },
  {
    id: 'privileges',
    name: 'The Privileges Collection',
    unlock: {
      kind: 'scheduled',
      at: instantInZone(ROOM_SCHEDULE.privileges),
    },
    sequence: 4,
    built: false,
    path: '/rooms/privileges',
    butler: {
      invitation:
        'The Privileges Collection is at your disposal, Alise. Anything within reason. And, between ourselves, one or two things beyond it.',
      reminder:
        'Your privileges remain at your disposal, Alise. The staff are rather hoping you’ll use them.',
      announcement:
        'If I may, Alise: the Privileges Collection is now at your disposal.',
    },
  },
];

export function findRoom(
  id: string,
  rooms: readonly RoomDefinition[] = ROOMS,
): RoomDefinition | undefined {
  return rooms.find((room) => room.id === id);
}

export function isRoomId(value: unknown): value is RoomId {
  return typeof value === 'string' && ROOMS.some((room) => room.id === value);
}
