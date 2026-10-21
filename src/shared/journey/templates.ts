/**
 * The Butler's words for the birthday journey, in one place
 * (PROVISIONAL: awaiting the owner's approval). The server passes these to
 * `ttc_journey_action` on every call, as the Correspondence Desk does with
 * its invitations; already published letters keep the words they had.
 *
 * Placeholders: `{room}` (the room's name), `{quantity}`, `{title}`.
 */
import { STORY_COPY } from '../story/copy.ts';
import { CLUB_LINK } from '../correspondence/templates.ts';
import type { AdmissionRoomId, JourneyEventType } from './contract.ts';

export const ADMISSION_ROOM_NAMES: Record<AdmissionRoomId, string> = {
  lounge: 'The Members’ Lounge',
  'screening-room': 'The Private Screening Room',
  casino: 'The Grand Casino',
  'gift-vault': 'The Gift Vault',
  privileges: 'The Privileges Collection',
};

/** "ENTER THE GRAND CASINO", engraved on the letter's button. */
export const enterLabel = (room: AdmissionRoomId) =>
  `Enter ${ADMISSION_ROOM_NAMES[room]}`.toUpperCase();
export const returnLabel = (room: AdmissionRoomId) =>
  `Return to ${ADMISSION_ROOM_NAMES[room]}`.toUpperCase();

export interface AdmissionCopy {
  /** The Letter of Admission presented in the Lounge. */
  letter: { title: string; body: string };
  /** The Butler letter that summons her to collect it. */
  summons: { title: string; body: string };
  /**
   * The Casino only: the Letter of Admission when no spins have been issued
   * yet, so the Butler never promises spins that do not exist.
   */
  letterWithoutSpins?: { title: string; body: string };
}

export const ADMISSION_COPY: Record<AdmissionRoomId, AdmissionCopy> = {
  lounge: {
    letter: {
      title: 'Founding Membership',
      body: 'Madam, the committee has resolved that the Members’ Lounge shall open its doors to you ahead of the appointed day. Consider it a founding privilege. The fire is lit and your chair is waiting.',
    },
    summons: {
      title: 'The Members’ Lounge is open to you',
      body: 'A small liberty has been taken on your behalf. The Members’ Lounge is open to you a little early, as befits a founding member. Do come in whenever it pleases you.',
    },
  },
  'screening-room': {
    letter: { title: 'The Reason for It All', body: STORY_COPY.midnight },
    summons: { title: 'The Reason for It All', body: STORY_COPY.midnight },
  },
  casino: {
    letter: {
      title: 'An Invitation of Considerable Importance',
      body: STORY_COPY.casino,
    },
    letterWithoutSpins: {
      title: 'Letter of Admission — The Grand Casino',
      body: 'Madam, it is my privilege to confirm your admission to the Grand Casino. The tables have been dressed and the croupier has been warned. I shall write the moment he is ready to deal you in. The house always wins, Madam. Today, the house is yours.',
    },
    summons: {
      title: 'An Invitation of Considerable Importance',
      body: STORY_COPY.casino,
    },
  },
  'gift-vault': {
    letter: {
      title: 'Letter of Admission — The Gift Vault',
      body: 'Madam, the Gift Vault is now open to you. I am told it contains things of considerable value. I am also told to say nothing further, so I shan’t.',
    },
    summons: {
      title: 'Something has been placed in safekeeping',
      body: 'A matter of some value requires your attention. Kindly return to the Members’ Lounge, where I shall explain everything. Well — almost everything.',
    },
  },
  privileges: {
    letter: {
      title: 'Letter of Admission — The Privileges Collection',
      body: 'Madam, the Privileges Collection is now at your disposal. Anything within reason. And, between ourselves, one or two things beyond it.',
    },
    summons: {
      title: 'A new privilege of membership',
      body: 'The committee has extended your privileges. A letter explaining them awaits you in the Members’ Lounge.',
    },
  },
};

/** What the Butler says as he shows her into a newly admitted room. */
export const ADMISSION_ESCORT_LINE =
  'Splendid. If you would follow me, Madam — allow me to show you the way.';

/** Default letters for events that earn one (see the contract §3). */
export const EVENT_LETTERS: Partial<
  Record<JourneyEventType, { title: string; body: string }>
> = {
  'casino.spins.issued': {
    title: 'Additional spins credited',
    body: 'I am delighted to inform you that {quantity} additional spins have been credited to your Grand Casino account. The croupier sends his compliments and, I suspect, his apologies in advance.',
  },
  'casino.prize.awarded': {
    title: 'A prize has been recorded',
    body: 'The Grand Casino has recorded a prize in your name: {title}. I have taken the liberty of making a note of it.',
  },
  'reward.voucher.issued': {
    title: '{title}',
    body: 'A new privilege has been placed at your disposal: {title}. It awaits you whenever you wish to make use of it.',
  },
  'vault.gift.unlocked': {
    title: 'Something has been placed in the Vault',
    body: 'A gift has been placed in the Gift Vault in your name: {title}. It awaits you behind a door that, I am assured, already knows your name.',
  },
  'reward.voucher.fulfilled': {
    title: '{title} has been arranged',
    body: 'Your request has been attended to: {title}. Everything has been arranged. Do let me know if anything is not entirely to your satisfaction.',
  },
};

/** Everything the server needs, passed with each journey call. */
/**
 * Real routes (src/app/App.tsx) the Butler's SMS links to: a return to a
 * room → the room; an admission summons → the entrance; any other letter →
 * her correspondence.
 */
export const JOURNEY_LINKS = {
  base: CLUB_LINK,
  correspondence: '/correspondence',
  rooms: {
    lounge: '/lounge',
    'screening-room': '/rooms/screening-room',
    casino: '/rooms/casino',
    'gift-vault': '/rooms/gift-vault',
    privileges: '/rooms/privileges',
  } satisfies Record<AdmissionRoomId, string>,
};

export const JOURNEY_TEMPLATES = {
  links: JOURNEY_LINKS,
  roomNames: ADMISSION_ROOM_NAMES,
  admissions: ADMISSION_COPY,
  events: EVENT_LETTERS,
  enterLabels: Object.fromEntries(
    Object.keys(ADMISSION_ROOM_NAMES).map((room) => [
      room,
      enterLabel(room as AdmissionRoomId),
    ]),
  ),
  returnLabels: Object.fromEntries(
    Object.keys(ADMISSION_ROOM_NAMES).map((room) => [
      room,
      returnLabel(room as AdmissionRoomId),
    ]),
  ),
};
