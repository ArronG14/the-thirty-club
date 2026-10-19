/**
 * The Butler's lines for the Correspondence Desk. Scripted, never generated.
 * The SMS wording lives in src/shared/correspondence/templates.ts.
 */
import { THANKS_RESPONSE } from '../../../shared/correspondence/templates';

/** The collection's heading line. */
export function collectionLine(unread: number, total: number): string {
  if (total === 0)
    return 'Nothing has arrived for you just yet, Madam. I shall let you know the moment it does.';
  if (unread === 0)
    return 'Every letter has been read, Madam. They remain here, in your care, whenever you wish to return to them.';
  if (unread === 1)
    return 'One letter awaits your attention, Madam, sealed just as it arrived.';
  return `${unread} letters await your attention, Madam, each sealed just as it arrived.`;
}

export const WORD_PROMPT =
  'Certainly, Madam. You have my undivided attention. What might I assist you with?';

/** Shown on screen when she thanks him; the same words go by SMS when permitted. */
export const THANKS_ON_SCREEN = THANKS_RESPONSE;

/** Already thanked: shown on return, without implying anything new was sent. */
export const ALREADY_THANKED =
  'You have already been far too kind about this one, Madam. Your thanks were received with the greatest pleasure.';

/**
 * Truthful: the message is recorded by the club's office. It does not claim
 * that any SMS has been delivered.
 */
export const WORD_RECEIVED =
  'Received, Madam, and safely recorded in the club’s book. I shall see that it is placed before Arron.';

/**
 * Deliberately no membership-card entry here: presenting the card before
 * the birthday would complete the midnight card ceremony early.
 */
export const NEEDS_MEMBERSHIP =
  'Forgive me, Madam. Private correspondence may only be handed to the member herself, and I have not yet had the pleasure of being introduced on this device.';
