/**
 * The owner's rehearsal copy of an SMS (ADR-022). The LIVE text is produced
 * by the same templates and records as always; a rehearsal copy differs only
 * by its banner and by its club links, which open the TEST rehearsal
 * instead of the real club.
 */
import { CLUB_LINK } from '../correspondence/templates.ts';

export const REHEARSAL_BANNER =
  '[REHEARSAL — This message will be sent to Alise]';

/** Where a rehearsal link lands: the club path, and what to rehearse there. */
export interface RehearsalTarget {
  scenario?: string;
  launch?: string;
}

const LINK = new RegExp(
  `${CLUB_LINK.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(/[^\\s]*)?`,
  'g',
);

/** Every club link in a body, as paths ('/', '/rooms/casino', …). */
export function clubPaths(body: string): string[] {
  return [...body.matchAll(LINK)].map((m) => m[1] || '/');
}

/** True when the body invites her somewhere with a working HTTPS link. */
export function hasClubLink(body: string): boolean {
  return clubPaths(body).length > 0;
}

export function rehearsalLink(path: string, target: RehearsalTarget = {}) {
  const query = new URLSearchParams({ path });
  if (target.scenario) query.set('scenario', target.scenario);
  if (target.launch) query.set('launch', target.launch);
  return `${CLUB_LINK}/rehearse?${query.toString()}`;
}

/** The rehearsal copy: banner, then the LIVE text with TEST links. */
export function rehearsalSms(
  liveBody: string,
  target: RehearsalTarget = {},
): string {
  const body = liveBody.replace(LINK, (_match, path?: string) =>
    rehearsalLink(path || '/', target),
  );
  return `${REHEARSAL_BANNER}\n${body}`;
}
