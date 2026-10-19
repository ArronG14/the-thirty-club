/**
 * The rehearsal clock (ADR-018): one simulated "now" for every time-driven
 * decision in a rehearsal document — the entrance countdown, room unlocks,
 * the concierge schedule and the simulated server's own `now()`.
 *
 * It is an anchor: the simulated instant chosen by the owner and the real
 * instant at which it was chosen. Time then runs forward naturally, so
 * events happen by themselves; jumps and advances move the anchor. The
 * anchor lives in this tab's session storage under the owner prefix and is
 * ignored outside a rehearsal document, so Alise's clock is never touched.
 */
import { OWNER_PREFIX } from '../owner/session';
import { simulationActive } from './mode';

export const CLOCK_KEY = `${OWNER_PREFIX}rehearsal-clock`;
export const CLOCK_EVENT = 'thirty-club:rehearsal-clock';

interface Anchor {
  simAt: number;
  realAt: number;
}

function readAnchor(): Anchor | null {
  try {
    const raw = sessionStorage.getItem(CLOCK_KEY);
    if (!raw) return null;
    const value = JSON.parse(raw) as Partial<Anchor>;
    return typeof value.simAt === 'number' && typeof value.realAt === 'number'
      ? { simAt: value.simAt, realAt: value.realAt }
      : null;
  } catch {
    return null;
  }
}

let anchor: Anchor | null = simulationActive ? readAnchor() : null;

/** The rehearsal's current instant (the real time when no anchor is set). */
export function rehearsalNow(): number {
  return anchor ? anchor.simAt + (Date.now() - anchor.realAt) : Date.now();
}

/** True when the rehearsal follows the real clock. */
export function followsRealTime(): boolean {
  return anchor === null;
}

/**
 * The clock every member-facing time decision should use: the rehearsal
 * clock in a rehearsal document, the device clock everywhere else.
 */
export const appClock = {
  now: (): number => (simulationActive ? rehearsalNow() : Date.now()),
};

function store(next: Anchor | null) {
  anchor = next;
  try {
    if (next) sessionStorage.setItem(CLOCK_KEY, JSON.stringify(next));
    else sessionStorage.removeItem(CLOCK_KEY);
  } catch {
    // The anchor still holds for this document.
  }
  window.dispatchEvent(new Event(CLOCK_EVENT));
}

export function setRehearsalTime(at: number) {
  store({ simAt: Math.round(at), realAt: Date.now() });
}

export function advanceRehearsal(ms: number) {
  setRehearsalTime(rehearsalNow() + ms);
}

export function resetRehearsalClock() {
  store(null);
}

/** Re-reads the anchor (another document in this tab may have moved it). */
export function reloadAnchor() {
  anchor = simulationActive ? readAnchor() : null;
}
