/**
 * THE CONCIERGE'S MESSAGES TO ALISE. Sent by the concierge service at their
 * scheduled moment (SMS, or handed to Arron to forward; see docs/CONCIERGE.md)
 * and listed in the owner console for manual sending. Copy is subject to
 * owner approval.
 */
import { DEPARTURE_LOUNGE_OPENS, type PrivilegeId } from './catalogue.ts';
import { JAMAICA_ZONE, type ZonedWallClock } from './time.ts';

export type MessageId =
  | 'invitation'
  | 'departure-ready'
  | 'in-flight'
  | 'jamaica-welcome'
  | 'membership-ceremony';

export type MessageTiming =
  /** Sent only from the owner console. */
  | { kind: 'manual' }
  /** Sent at a fixed wall clock. */
  | { kind: 'at'; at: ZonedWallClock }
  /** Sent when a privilege is released (follows its overrides). */
  | { kind: 'privilege'; privilegeId: PrivilegeId };

export interface ConciergeMessage {
  id: MessageId;
  /** Owner-facing name. */
  label: string;
  body: string;
  /** Where the link in the message leads. */
  path: string;
  timing: MessageTiming;
}

export const MESSAGES: readonly ConciergeMessage[] = [
  {
    id: 'invitation',
    label: 'The invitation (18–21 October)',
    body: 'THE THIRTY CLUB\n\nMadam,\nYour membership has been approved. While the doors of the club remain closed until your birthday, certain privileges have been arranged for your journey.\n\nWe shall be in touch.',
    path: '/',
    timing: { kind: 'manual' },
  },
  {
    id: 'departure-ready',
    label: 'Departure Lounge ready (Thursday, 2 pm UK)',
    body: 'THE THIRTY CLUB\n\nGood afternoon, Madam.\nYour Departure Lounge is now ready.\n\nUnfortunately, your travel credentials appear to have been misplaced. We believe they may be rather closer than you think.\n\nYour concierge awaits.',
    path: '/departure',
    timing: { kind: 'at', at: DEPARTURE_LOUNGE_OPENS },
  },
  {
    id: 'in-flight',
    label: 'In-flight refreshment',
    body: 'THE THIRTY CLUB\n\nMadam,\nWe trust you’ve settled comfortably aboard. Your first refreshment has been arranged.\n\nYour concierge awaits.',
    path: '/departure',
    timing: { kind: 'privilege', privilegeId: 'in-flight' },
  },
  {
    id: 'jamaica-welcome',
    label: 'Welcome to Jamaica (Friday)',
    body: 'THE THIRTY CLUB\n\nGood morning, Madam, and welcome to Jamaica.\nA little correspondence has been left for you in your Departure Lounge.',
    path: '/departure',
    timing: {
      kind: 'at',
      at: { date: '2026-10-23', time: '09:00', zone: JAMAICA_ZONE },
    },
  },
  {
    id: 'membership-ceremony',
    label: 'Membership ceremony (Saturday, once the card is hidden)',
    body: 'THE THIRTY CLUB\n\nHappy birthday, Madam.\nThe doors of The Thirty Club are ready to open. You will, of course, be asked for your membership card. We understand it is somewhere in your room.',
    path: '/',
    timing: { kind: 'manual' },
  },
];

export function isMessageId(value: unknown): value is MessageId {
  return MESSAGES.some((message) => message.id === value);
}

export function findMessage(id: MessageId): ConciergeMessage {
  const found = MESSAGES.find((message) => message.id === id);
  if (!found) throw new Error(`Unknown message ${id}`);
  return found;
}

/** The full text as Alise receives it, link included. */
export function composeMessage(
  message: ConciergeMessage,
  siteUrl: string,
): string {
  const base = siteUrl.replace(/\/+$/, '');
  return `${message.body}\n\n${base}${message.path}`;
}
