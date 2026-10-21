/**
 * THE PRIVILEGE CATALOGUE. Shared by the website and the concierge service:
 * the website renders it, the service decides availability and redemption
 * from it and writes Arron's notification with it.
 *
 * Adding a privilege means adding an entry here (and to `PrivilegeId`). The
 * Departure Lounge renders whatever is listed; nothing is hard-coded in the
 * UI. Release times are defaults: the owner console and environment
 * variables can move them without a deploy (see effectiveSchedule).
 *
 * Copy is subject to owner approval. Items marked PROVISIONAL need it.
 */
import { JAMAICA_ZONE, UK_ZONE, type ZonedWallClock } from './time.ts';

export type PrivilegeId = 'duty-free' | 'in-flight' | 'jamaica-arrival';

export const PRIVILEGE_IDS: readonly PrivilegeId[] = [
  'duty-free',
  'in-flight',
  'jamaica-arrival',
];

export function isPrivilegeId(value: unknown): value is PrivilegeId {
  return PRIVILEGE_IDS.includes(value as PrivilegeId);
}

export interface PrivilegeChoice {
  id: string;
  label: string;
}

export interface RedemptionDetails {
  /** Label of the chosen option, when the privilege offers choices. */
  choice?: string;
  /** Alise's own words, when she left any. */
  note?: string;
}

export interface ArronNotification {
  title: string;
  lines: readonly string[];
}

interface PrivilegeBase {
  id: PrivilegeId;
  /** Engraved capitals above the title. */
  eyebrow: string;
  title: string;
  subtitle: string;
  /** The concierge's letter, one paragraph per entry. */
  letter: readonly string[];
  /** Engraved on the envelope while it is still sealed shut. */
  lockedHint: string;
  /** Default release, as a wall clock in an explicit zone. */
  opensAt: ZonedWallClock;
  /** The zone in which release times are explained to Alise. */
  displayZone: string;
  /** Environment variable that moves the release (ISO instant). */
  opensAtEnv?: string;
  /** True while the release time awaits owner confirmation. */
  provisional?: boolean;
}

/** A privilege Alise redeems; Arron is notified. */
export interface RequestPrivilege extends PrivilegeBase {
  kind: 'request';
  choices?: readonly PrivilegeChoice[];
  /** Prompt above the choices. */
  choicePrompt?: string;
  note?: { label: string; placeholder: string };
  /** Label of the redeem control. */
  redeemLabel: string;
  /** Pressed into the card once granted. */
  stamp: string;
  notify(details: RedemptionDetails): ArronNotification;
}

/** Sealed correspondence: opened and read, never redeemed. */
export interface Correspondence extends PrivilegeBase {
  kind: 'correspondence';
  signOff: string;
}

export type PrivilegeDefinition = RequestPrivilege | Correspondence;

export const DEPARTURE_LOUNGE_OPENS: ZonedWallClock = {
  date: '2026-10-22',
  time: '14:00',
  zone: UK_ZONE,
};

const REQUEST_TITLE = 'THE THIRTY CLUB — CONCIERGE REQUEST';

export const PRIVILEGES: readonly PrivilegeDefinition[] = [
  {
    id: 'duty-free',
    kind: 'request',
    eyebrow: 'The Departure Privilege',
    title: 'Duty-Free Indulgence',
    subtitle: 'An exclusive pre-flight indulgence.',
    letter: [
      'Madam,',
      'Your husband has made arrangements for a little shopping before departure.',
      'Should anything catch your eye, please make your selection. Arron will attend to the necessary arrangements.',
    ],
    lockedHint: 'Released at departure',
    opensAt: DEPARTURE_LOUNGE_OPENS,
    displayZone: UK_ZONE,
    note: {
      label: 'Your selection, or the boutique you have in mind',
      placeholder: 'Optional',
    },
    redeemLabel: 'Inform Arron',
    stamp: 'Granted',
    notify: ({ note }) => ({
      title: REQUEST_TITLE,
      lines: [
        'Alise has redeemed her Duty-Free Indulgence.',
        'Please accompany her to the boutique of her choosing and arrange her purchase.',
        note
          ? `Her selection: “${note}”`
          : 'She left no note. Do ask Madam where she would like to go.',
      ],
    }),
  },
  {
    id: 'in-flight',
    kind: 'request',
    eyebrow: 'The In-Flight Privilege',
    title: 'In-Flight Refreshment',
    subtitle: 'Your first refreshment, at thirty-five thousand feet.',
    letter: [
      'Madam,',
      'We trust you’ve settled comfortably aboard.',
      'Your first refreshment has been arranged. Please make your selection and inform your husband.',
      'We understand he is particularly agreeable at 35,000 feet.',
    ],
    lockedHint: 'Released in flight',
    opensAt: { date: '2026-10-22', time: '18:30', zone: UK_ZONE },
    displayZone: UK_ZONE,
    opensAtEnv: 'PRIVILEGE_IN_FLIGHT_OPENS_AT',
    provisional: true,
    choicePrompt: 'Your refreshment',
    choices: [
      { id: 'champagne', label: 'Champagne' },
      { id: 'cocktail', label: 'A cocktail' },
      { id: 'wine', label: 'Wine' },
      { id: 'soft-drink', label: 'A soft drink' },
      { id: 'something-else', label: 'Something else' },
    ],
    note: {
      label: 'Your preferred drink',
      placeholder: 'Optional',
    },
    redeemLabel: 'Inform Arron',
    stamp: 'Served',
    notify: ({ choice, note }) => ({
      title: REQUEST_TITLE,
      lines: [
        'Alise has requested her in-flight refreshment.',
        `Selection: ${[choice, note].filter(Boolean).join(' — ') || 'Madam will tell you herself'}`,
        'Please ensure Madam is suitably refreshed.',
      ],
    }),
  },
  {
    id: 'jamaica-arrival',
    kind: 'correspondence',
    eyebrow: 'Arrival Correspondence',
    title: 'Welcome to Jamaica',
    subtitle: 'Left for you on arrival.',
    // PROPOSED (ADR-024): the original promised the doors "tomorrow" and an
    // unposted card, both superseded by the 21 October admission.
    letter: [
      'Madam,',
      'Welcome to Jamaica. The club trusts the journey was everything it ought to have been, and that your husband carried the heavier bags.',
      'Your membership has travelled with you: the Members’ Lounge, your letters and the Butler are exactly where you left them.',
      'Do rest. I am told the croupier has been practising.',
    ],
    signOff: 'Until tomorrow, Madam.',
    lockedHint: 'Delivered on arrival',
    opensAt: { date: '2026-10-22', time: '18:00', zone: JAMAICA_ZONE },
    displayZone: JAMAICA_ZONE,
    opensAtEnv: 'PRIVILEGE_JAMAICA_ARRIVAL_OPENS_AT',
    provisional: true,
  },
];

export function findPrivilege(id: PrivilegeId): PrivilegeDefinition {
  const found = PRIVILEGES.find((privilege) => privilege.id === id);
  if (!found) throw new Error(`Unknown privilege ${id}`);
  return found;
}

/** The choice label for an option id, if the privilege offers it. */
export function choiceLabel(
  privilege: PrivilegeDefinition,
  choiceId: string | undefined,
): string | undefined {
  if (privilege.kind !== 'request' || !choiceId) return undefined;
  return privilege.choices?.find((choice) => choice.id === choiceId)?.label;
}

/** Riddles printed in the Departure Lounge. Choose with ACTIVE_RIDDLES. */
export const DEPARTURE_RIDDLES = {
  handbag: [
    'It has accompanied you through every departure,',
    'and never once complained about the weight.',
    'Look inside the one you would never leave behind.',
  ],
  'luggage-tag': [
    'It carries your name, though it has never said a word.',
    'It will make the whole journey with you,',
    'fastened to the things you would not travel without.',
  ],
} as const;

/** Spoken by the butler at the door on the birthday. PROVISIONAL. */
export const MEMBERSHIP_RIDDLES = {
  room: [
    'A member’s card is never left lying about, Madam.',
    'The staff have placed yours somewhere in your room,',
    'where you would reach first on your birthday morning.',
  ],
} as const;

/**
 * Which riddles are shown. The owner sets these to match where the tags are
 * actually hidden (PROVISIONAL until confirmed).
 */
export const ACTIVE_RIDDLES = {
  departure: DEPARTURE_RIDDLES.handbag,
  membership: MEMBERSHIP_RIDDLES.room,
} as const;
