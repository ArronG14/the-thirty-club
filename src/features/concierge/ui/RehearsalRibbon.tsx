import { useEffect, useState } from 'react';
import { activeSession, endRehearsal } from '../client/sessionStore';
import { JAMAICA_ZONE, UK_ZONE } from '../domain/time';
import './entranceConcierge.css';

function virtualTime(offsetMs: number): string {
  const now = new Date(Date.now() + offsetMs);
  const format = (zone: string) =>
    new Intl.DateTimeFormat('en-GB', {
      timeZone: zone,
      weekday: 'short',
      hour: '2-digit',
      minute: '2-digit',
    }).format(now);
  return `${format(UK_ZONE)} UK · ${format(JAMAICA_ZONE)} JM`;
}

/**
 * A small, always-visible marker while the owner rehearses on this device,
 * so a rehearsal can never be mistaken for the live journey.
 */
export function RehearsalRibbon() {
  const [session] = useState(() => activeSession());
  const offset = session?.claims.offsetMs ?? 0;
  const [label, setLabel] = useState(() => virtualTime(offset));
  const rehearsing = session?.claims.realm === 'rehearsal';

  useEffect(() => {
    if (!rehearsing) return;
    const timer = setInterval(() => setLabel(virtualTime(offset)), 15_000);
    return () => clearInterval(timer);
  }, [offset, rehearsing]);

  if (!rehearsing) return null;
  return (
    <aside className="rehearsal-ribbon" aria-label="Rehearsal">
      <span>Rehearsal · {label}</span>
      <button
        type="button"
        onClick={() => {
          endRehearsal();
          window.location.assign('/concierge/owner');
        }}
      >
        End
      </button>
    </aside>
  );
}
