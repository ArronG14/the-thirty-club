/**
 * Early admission (ADR-022): the owner may open the doors before the
 * birthday. Pure functions only; the server decides when (its `opensAt`,
 * only once authorised) and whether (`eligible`, only once its milestone
 * has fired). The device's clock is corrected by the server's, so changing
 * the phone's clock changes nothing.
 *
 * The clock shows the real time remaining until it reads 00:00:10, then
 * holds there. The final ten seconds begin only when the server says the
 * doors may open AND her membership card has been presented on this device
 * (ADR-023) AND she is looking (page visible); if she looks away they start
 * again when she returns. At zero the doors open by themselves.
 */
import type { TimePhase } from './countdown';
import { FINAL_MINUTE_MS } from './countdown';

export const FINAL_SECONDS_MS = 10_000;

export interface EarlyAdmission {
  /** Server instant the doors may open (epoch ms). */
  opensAt: number;
  /** The server has fired the early admission. */
  eligible: boolean;
  /** Server clock minus device clock, ms. */
  offsetMs: number;
  /** The Butler's letter at the doors once the server has fired 19:00. */
  letter: EarlyLetter | null;
}

export interface EarlyLetter {
  title: string;
  body: string;
}

export interface EarlyView {
  /** What the clock shows, ms. */
  remainingMs: number;
  phase: TimePhase;
}

/** The clock at server time `now`, given when the final ten seconds began. */
export function earlyView(
  now: number,
  admission: EarlyAdmission,
  finalStartedAt: number | null,
): EarlyView {
  if (finalStartedAt !== null && admission.eligible) {
    const remainingMs = Math.max(0, finalStartedAt + FINAL_SECONDS_MS - now);
    return { remainingMs, phase: remainingMs <= 0 ? 'open' : 'final-minute' };
  }
  // Counts down truthfully, then holds at ten seconds: never opens alone.
  const remainingMs = Math.max(admission.opensAt - now, FINAL_SECONDS_MS);
  return {
    remainingMs,
    phase: remainingMs <= FINAL_MINUTE_MS ? 'final-minute' : 'locked',
  };
}

/**
 * Whether the final ten seconds should begin now. The time alone never
 * opens the doors: the membership card must have been presented (ADR-023).
 */
export function shouldStartFinal(
  now: number,
  admission: EarlyAdmission,
  finalStartedAt: number | null,
  visible: boolean,
  carded: boolean,
): boolean {
  return (
    finalStartedAt === null &&
    admission.eligible &&
    carded &&
    visible &&
    now >= admission.opensAt
  );
}

/**
 * A remembered start survives a reload during the final ten seconds; an
 * older one (she left before the doors opened) starts again.
 */
export function resumableStart(
  stored: number | null,
  now: number,
): number | null {
  return stored !== null && now - stored >= 0 && now - stored < FINAL_SECONDS_MS
    ? stored
    : null;
}

/** Early admission applies only before the birthday's own opening. */
export function earlyActive(
  admission: EarlyAdmission | null,
  birthdayOpening: number,
): admission is EarlyAdmission {
  return admission !== null && admission.opensAt < birthdayOpening;
}

/** The server's answer, parsed defensively; anything odd means none. */
export function parseEntrance(
  data: unknown,
  deviceNow: number,
): EarlyAdmission | null {
  if (!data || typeof data !== 'object') return null;
  const d = data as {
    now?: unknown;
    opensAt?: unknown;
    eligible?: unknown;
    letter?: unknown;
  };
  const server = typeof d.now === 'string' ? Date.parse(d.now) : NaN;
  const opensAt = typeof d.opensAt === 'string' ? Date.parse(d.opensAt) : NaN;
  if (!Number.isFinite(opensAt) || !Number.isFinite(server)) return null;
  const eligible = d.eligible === true;
  return {
    opensAt,
    eligible,
    offsetMs: server - deviceNow,
    letter: eligible ? parseLetter(d.letter) : null,
  };
}

function parseLetter(value: unknown): EarlyLetter | null {
  if (!value || typeof value !== 'object') return null;
  const { title, body } = value as { title?: unknown; body?: unknown };
  return typeof title === 'string' &&
    typeof body === 'string' &&
    title.trim() !== '' &&
    body.trim() !== ''
    ? { title, body }
    : null;
}

/**
 * Server clock minus device clock from any entrance answer, or null. Used
 * for the birthday's own countdown too, so changing the phone's clock
 * never brings the doors forward once the server has been reached.
 */
export function serverOffset(data: unknown, deviceNow: number): number | null {
  if (!data || typeof data !== 'object') return null;
  const now = (data as { now?: unknown }).now;
  const server = typeof now === 'string' ? Date.parse(now) : NaN;
  return Number.isFinite(server) ? server - deviceNow : null;
}
