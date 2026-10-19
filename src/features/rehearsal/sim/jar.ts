/**
 * REHEARSAL ONLY. The simulated office's session "cookies": one for the
 * owner (the TEST Control Centre) and one for the member (every rehearsal
 * room). They live in this tab's session storage under the owner prefix and
 * are never real cookies, so Alise's and Arron's real sessions are untouched.
 */
import { OWNER_PREFIX } from '../../owner/session';

export type Actor = 'owner' | 'member';

const key = (actor: Actor) => `${OWNER_PREFIX}sim-session:${actor}`;

export const jar = {
  get(actor: Actor): string | null {
    try {
      return sessionStorage.getItem(key(actor));
    } catch {
      return null;
    }
  },
  set(actor: Actor, token: string) {
    try {
      sessionStorage.setItem(key(actor), token);
    } catch {
      // The session lasts as long as the document.
    }
  },
  clear(actor: Actor) {
    try {
      sessionStorage.removeItem(key(actor));
    } catch {
      // Nothing to clear.
    }
  },
};
