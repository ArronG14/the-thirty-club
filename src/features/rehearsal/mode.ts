/**
 * Which world this document lives in (ADR-018). Decided once, when the
 * document is created, exactly like the owner storage adapter (ADR-011):
 *
 * - LIVE owner documents (`/owner…`, `/concierge/owner`) always talk to the
 *   real server, even while Dev Mode is active in the tab.
 * - Every other document in an authenticated Dev Mode tab is a REHEARSAL
 *   document: its `/api/` calls are answered by the simulated club office
 *   in this browser, and nothing reaches production.
 * - `/concierge/owner/test` is the TEST Control Centre: a rehearsal
 *   document that acts as the owner of the simulated office.
 *
 * Moving between LIVE and rehearsal paths always reloads the document
 * (`useDocumentWorld`), so a simulated action can never become real.
 */
import { ownerActive } from '../owner/session';

export const TEST_CENTRE_PATH = '/concierge/owner/test';
export const LIVE_CENTRE_PATH = '/concierge/owner';

export function isTestCentrePath(path: string): boolean {
  return path === TEST_CENTRE_PATH || path.startsWith(`${TEST_CENTRE_PATH}/`);
}

/** Paths that operate the real club: never simulated. */
export function isLiveOwnerPath(path: string): boolean {
  if (isTestCentrePath(path)) return false;
  return (
    path === '/owner' ||
    path.startsWith('/owner/') ||
    path === LIVE_CENTRE_PATH ||
    path.startsWith(`${LIVE_CENTRE_PATH}/`)
  );
}

export type DocumentWorld = 'live' | 'rehearsal';

/** The world a document at `path` must belong to in this tab. */
export function worldFor(path: string, owner = ownerActive): DocumentWorld {
  if (isTestCentrePath(path)) return 'rehearsal';
  return owner && !isLiveOwnerPath(path) ? 'rehearsal' : 'live';
}

function initialPath(): string {
  try {
    return window.location.pathname;
  } catch {
    return '/';
  }
}

/** Fixed for this document's lifetime. */
export const documentWorld: DocumentWorld = worldFor(initialPath());

/**
 * True when this document's network calls go to the simulated office. The
 * TEST centre counts even before the PIN is entered: it shows the PIN form
 * and must never reach the real server either.
 */
export const simulationActive = documentWorld === 'rehearsal';

/** The TEST Control Centre acts as the simulated office's owner. */
export const simulatedOwnerDocument = isTestCentrePath(initialPath());
