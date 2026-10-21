/**
 * The physical membership card's server record (ADR-023). Scanning the card
 * (`/c/<token>`) or entering its printed number gives this device a
 * concierge session with the `membership` scope; presenting that session to
 * the club records the card and gives the device a member session, so her
 * admission is the server's and follows her to every tab and device.
 */
import { activeSession } from '../../concierge/client/sessionStore';
import { hasScope } from '../../concierge/domain/session';
import { presentCard } from './journeyApi';
import { hasAdmissionCard } from '../../concierge/client/membership';

/** This device holds the card's verified credential. */
export function holdsCard(): boolean {
  const session = activeSession();
  return session !== null && hasAdmissionCard();
}

/**
 * Tells the club the card was presented. Never throws; false when this
 * device holds no card or the club could not be reached (the journey
 * provider tries again before recording her membership).
 */
export async function presentCardToClub(): Promise<boolean> {
  const session = activeSession();
  if (
    !session ||
    !hasScope(session.claims, 'membership') ||
    !hasAdmissionCard()
  )
    return false;
  const result = await presentCard(session.token);
  return result.ok;
}
