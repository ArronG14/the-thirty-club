import { useEffect, useState, type CSSProperties } from 'react';
import { useLocation } from 'react-router';
import type { EntranceStage } from '../domain/entranceMachine';
import type { EntranceEnvironment } from '../domain/environment';
import { createEntranceEnvironment } from '../entranceEnvironment';
import { DevPreviewBar } from '../preview/DevPreviewBar';
import { useEntrance } from '../useEntrance';
import { ClubDefs } from './ClubDefs';
import { Facade } from './Facade';
import { Lounge } from '../../lounge/ui/Lounge';
import { useJourney } from '../../journey/journeyContext';
import './entrance.css';

const ANNOUNCEMENTS: Partial<Record<EntranceStage, string>> = {
  'final-minute': 'Less than one minute until the club opens.',
  'awaiting-credential':
    'Midnight. The club is open to members. Please present your membership card.',
  unlocking: 'Midnight. The doors are unlocking.',
  'awaiting-entry': 'The doors are unlocked. The club is open.',
  opening: 'The doors are opening.',
};

export function Entrance({
  environment,
}: {
  environment?: EntranceEnvironment;
}) {
  const [env] = useState(() => environment ?? createEntranceEnvironment());
  // Arriving from the membership card's link (/c/<token>): play the ceremony.
  const location = useLocation();
  const [presentedNow] = useState(
    () =>
      (location.state as { presented?: string } | null)?.presented ===
      'membership',
  );
  const model = useEntrance(env, { presentedNow });
  const { stage, anticipation, reducedMotion, admitted, member } = model;
  // Admitted on another device (ADR-022): straight into the Lounge. Once
  // this device holds the card (a member session follows it, ADR-023) the
  // doors ask the server, so a second device or tab skips the ceremony.
  const journey = useJourney();
  const want = journey?.want;
  useEffect(() => {
    if (member) want?.();
  }, [member, want]);
  const knownMember = journey?.stateOf('lounge') === 'admitted';
  useEffect(() => {
    if (knownMember) admitted();
  }, [knownMember, admitted]);

  return (
    <div
      className="club"
      data-stage={stage}
      data-motion={reducedMotion ? 'reduced' : 'full'}
      style={{ '--anticipation': anticipation.toFixed(3) } as CSSProperties}
    >
      <ClubDefs />
      {stage === 'foyer' ? (
        <Lounge model={model} environment={env} />
      ) : (
        <Facade model={model} />
      )}
      <p className="sr-only" aria-live="polite">
        {ANNOUNCEMENTS[stage] ?? ''}
      </p>
      {import.meta.env.DEV && env.preview && (
        <DevPreviewBar mode={env.preview} />
      )}
    </div>
  );
}
