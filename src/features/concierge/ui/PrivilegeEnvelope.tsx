import { useState } from 'react';
import type { PrivilegeId } from '../domain/catalogue';
import type { PrivilegeView } from '../domain/lounge';
import {
  calendarDay,
  clockTime,
  JAMAICA_ZONE,
  stampDate,
} from '../domain/time';
import { WaxSeal } from './Artwork';

/** How long the seal takes to break before the card rises. */
export const BREAK_MS = 820;

function zoneName(zone: string) {
  return zone === JAMAICA_ZONE ? 'Jamaica time' : 'UK time';
}

function statusLine(view: PrivilegeView, now: number): string {
  const { privilege, status, redemption, opensAt } = view;
  switch (status) {
    case 'locked': {
      const sameDay =
        calendarDay(opensAt, privilege.displayZone) ===
        calendarDay(now, privilege.displayZone);
      const day = sameDay
        ? ''
        : `${calendarDay(opensAt, privilege.displayZone).split(' ')[0]}, `;
      return `${privilege.lockedHint} · ${day}${clockTime(opensAt, privilege.displayZone)} ${zoneName(privilege.displayZone)}`;
    }
    case 'sealed':
      return privilege.kind === 'request' ? 'Break the seal' : 'Sealed for you';
    case 'open':
      return privilege.kind === 'request'
        ? 'Opened · awaiting your selection'
        : 'Read';
    case 'pending':
      return 'Awaiting a connection';
    case 'redeemed':
      return redemption?.delivery === 'delivered'
        ? `Redeemed · ${stampDate(Date.parse(redemption.redeemedAt), privilege.displayZone)} · Arron informed`
        : `Redeemed · ${redemption ? stampDate(Date.parse(redemption.redeemedAt), privilege.displayZone) : ''}`;
  }
}

/**
 * One privilege in the travel wallet: an envelope closed with wax. Locked,
 * it is not a control at all. Sealed, tapping breaks the seal; afterwards
 * it opens the card directly.
 */
export function PrivilegeEnvelope({
  view,
  now,
  reducedMotion,
  onOpen,
}: {
  view: PrivilegeView;
  now: number;
  reducedMotion: boolean;
  onOpen(id: PrivilegeId, opener: HTMLElement): void;
}) {
  const [breaking, setBreaking] = useState(false);
  const { privilege, status } = view;
  const locked = status === 'locked';
  const flap =
    status === 'sealed' ? (breaking ? 'breaking' : 'closed') : 'open';

  const face = (
    <>
      <span className="envelope__body" aria-hidden="true" />
      <span className="envelope__flap" aria-hidden="true" />
      <span className="envelope__seal" aria-hidden="true">
        <WaxSeal lit={!locked} />
      </span>
      <span className="envelope__text">
        <span className="envelope__eyebrow">{privilege.eyebrow}</span>
        <span className="envelope__title">
          {locked ? 'Sealed until released' : privilege.title}
        </span>
        {status === 'redeemed' && privilege.kind === 'request' && (
          <span className="envelope__mark" aria-hidden="true">
            {privilege.stamp}
          </span>
        )}
        <span className="envelope__status">{statusLine(view, now)}</span>
      </span>
    </>
  );

  if (locked) {
    return (
      <li className="envelope" data-status={status} data-flap="closed">
        <div className="envelope__face">{face}</div>
      </li>
    );
  }

  function open(target: HTMLElement) {
    if (status !== 'sealed' || reducedMotion) {
      onOpen(privilege.id, target);
      return;
    }
    if (breaking) return;
    setBreaking(true);
    setTimeout(() => {
      setBreaking(false);
      onOpen(privilege.id, target);
    }, BREAK_MS);
  }

  return (
    <li className="envelope" data-status={status} data-flap={flap}>
      <button
        type="button"
        className="envelope__face"
        aria-label={
          status === 'sealed'
            ? `Break the seal: ${privilege.title}`
            : `${privilege.title}. ${statusLine(view, now)}`
        }
        onClick={(event) => open(event.currentTarget)}
      >
        {face}
      </button>
    </li>
  );
}
