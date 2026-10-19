import { useCallback, useState } from 'react';
import { Navigate, useNavigate } from 'react-router';
import { useReducedMotion } from '../../../shared/ui/useReducedMotion';
import { createEntranceEnvironment } from '../../entrance/entranceEnvironment';
import { ClubDefs } from '../../entrance/ui/ClubDefs';
import { useJourney } from '../../journey/journeyContext';
import { Lounge } from './Lounge';
import '../../entrance/ui/entrance.css';

/**
 * `/lounge` (ADR-020): the Members' Lounge reached without the birthday
 * doors, for the founding membership before 24 October and for collecting
 * a Letter of Admission. It is open when the journey has admitted her to
 * the Lounge, when a Letter of Admission is waiting for her, or once her
 * membership has been presented. Otherwise it is the street door again.
 */
export default function LoungeRoute() {
  const [environment] = useState(() => createEntranceEnvironment());
  const [inducted] = useState(
    () => environment.membership.load().inductedAt !== null,
  );
  const journey = useJourney();
  const navigate = useNavigate();
  const reducedMotion = useReducedMotion();
  const replay = useCallback(() => navigate('/'), [navigate]);
  const currentHour = useCallback(
    () => new Date(environment.clock.now()).getHours(),
    [environment],
  );

  const allowed =
    inducted ||
    journey?.stateOf('lounge') === 'admitted' ||
    (journey?.snapshot.pending.length ?? 0) > 0;
  if (!allowed) {
    if (journey?.status === 'loading')
      return (
        <p className="plain-page" role="status">
          One moment…
        </p>
      );
    return <Navigate to="/" replace />;
  }
  return (
    <div
      className="club"
      data-stage="foyer"
      data-motion={reducedMotion ? 'reduced' : 'full'}
    >
      <ClubDefs />
      <Lounge
        model={{ welcomed: false, replay, reducedMotion, currentHour }}
        environment={environment}
      />
    </div>
  );
}
