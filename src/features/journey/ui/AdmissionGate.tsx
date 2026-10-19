import type { ReactNode } from 'react';
import { Navigate } from 'react-router';
import { isAdmissionRoom } from '../../../shared/journey/contract';
import { useJourney } from '../journeyContext';

/**
 * The door staff for rooms that need an admission (ADR-020). Enforced in
 * routing, not by hiding buttons: a deep link to a room she has not been
 * admitted to never renders it.
 *
 * - ADMITTED: the room.
 * - INVITED: escorted to the Lounge, where the Letter of Admission waits.
 * - LOCKED: a quiet notice that names nothing.
 */
export function AdmissionGate({
  roomId,
  children,
}: {
  roomId: string | undefined;
  children: ReactNode;
}) {
  const journey = useJourney();
  if (!journey || !isAdmissionRoom(roomId) || roomId === 'lounge')
    return children;
  const state = journey.stateOf(roomId);
  if (state === 'admitted') return children;
  if (journey.status === 'loading')
    return (
      <p className="plain-page" role="status">
        One moment…
      </p>
    );
  if (state === 'invited')
    return <Navigate to={`/lounge?admission=${roomId}`} replace />;
  const unreachable =
    journey.status === 'offline' || journey.status === 'unavailable';
  return (
    <section className="plain-page room-gate" aria-labelledby="room-title">
      <p className="room-gate__eyebrow">The Thirty Club</p>
      <h1 id="room-title">Not this way, Madam.</h1>
      <p className="room-gate__notice">
        {unreachable
          ? 'The Butler cannot reach the club’s office just now. Rooms you have already been admitted to remain open to you.'
          : 'This door is not yet open to you. The Butler will write when it is.'}
      </p>
      {unreachable && (
        <button
          type="button"
          className="link-button"
          onClick={() => journey.refresh()}
        >
          Try again
        </button>
      )}
      <a href="/">Return to the club</a>
    </section>
  );
}
