/**
 * The Butler's words for the birthday journey, in one place
 * (PROVISIONAL: awaiting the owner's approval). The server passes these to
 * `ttc_journey_action` on every call, as the Correspondence Desk does with
 * its invitations; already published letters keep the words they had.
 *
 * Placeholders: `{room}` (the room's name), `{quantity}`, `{title}`.
 */
import type { AdmissionRoomId, JourneyEventType } from './contract';

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
}

export const ADMISSION_COPY: Record<AdmissionRoomId, AdmissionCopy> = {
  lounge: {
    letter: {
      title: 'Founding Membership',
      body: 'Madam, the committee has resolved that the Members’ Lounge shall open its doors to you ahead of the appointed day. Consider it a founding privilege. The fire is lit and your chair is waiting.',
    },
    summons: {
      title: 'The Members’ Lounge is open to you',
      body: 'Madam, a small liberty has been taken on your behalf. The Members’ Lounge is open to you a little early, as befits a founding member. Do come in whenever it pleases you.',
    },
  },
  'screening-room': {
    letter: {
      title: 'Letter of Admission — The Private Screening Room',
      body: 'Madam, a number of rather important people have requested an audience with you. The Private Screening Room has been prepared, the lights are low, and your seat has been reserved in the centre of the front row.',
    },
    summons: {
      title: 'A matter requiring your presence',
      body: 'Madam, if you would be so kind as to return to the Members’ Lounge, I have something to present to you. I shan’t say more; I have been sworn to secrecy, and I take such things seriously.',
    },
  },
  casino: {
    letter: {
      title: 'Letter of Admission — The Grand Casino',
      body: 'Madam, it is my privilege to confirm your admission to the Grand Casino. The tables have been dressed, the croupier has been warned, and a number of complimentary spins have been placed at your disposal. The house always wins, Madam. Today, the house is yours.',
    },
    summons: {
      title: 'Your presence is requested in the Lounge',
      body: 'Madam, forgive the interruption. A letter bearing the club’s seal awaits you in the Members’ Lounge. I am instructed to hand it to you personally.',
    },
  },
  'gift-vault': {
    letter: {
      title: 'Letter of Admission — The Gift Vault',
      body: 'Madam, the Gift Vault is now open to you. I am told it contains things of considerable value. I am also told to say nothing further, so I shan’t.',
    },
    summons: {
      title: 'Something has been placed in safekeeping',
      body: 'Madam, a matter of some value requires your attention. Kindly return to the Members’ Lounge, where I shall explain everything. Well — almost everything.',
    },
  },
  privileges: {
    letter: {
      title: 'Letter of Admission — The Privileges Collection',
      body: 'Madam, the Privileges Collection is now at your disposal. Anything within reason. And, between ourselves, one or two things beyond it.',
    },
    summons: {
      title: 'A new privilege of membership',
      body: 'Madam, the committee has extended your privileges. A letter explaining them awaits you in the Members’ Lounge.',
    },
  },
};

/** Default letters for events that earn one (see the contract §3). */
export const EVENT_LETTERS: Partial<
  Record<JourneyEventType, { title: string; body: string }>
> = {
  'casino.spins.issued': {
    title: 'Additional spins credited',
    body: 'Madam, I am delighted to inform you that {quantity} additional spins have been credited to your Grand Casino account. The croupier sends his compliments and, I suspect, his apologies in advance.',
  },
  'casino.prize.awarded': {
    title: 'A prize has been recorded',
    body: 'Madam, the Grand Casino has recorded a prize in your name: {title}. I have taken the liberty of making a note of it.',
  },
  'reward.voucher.issued': {
    title: '{title}',
    body: 'Madam, a new privilege has been placed at your disposal: {title}. It awaits you whenever you wish to make use of it.',
  },
  'reward.voucher.fulfilled': {
    title: '{title} has been arranged',
    body: 'Madam, your request has been attended to: {title}. Everything has been arranged. Do let me know if anything is not entirely to your satisfaction.',
  },
};

/** Everything the server needs, passed with each journey call. */
export const JOURNEY_TEMPLATES = {
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
