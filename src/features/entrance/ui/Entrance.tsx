import { useState, type CSSProperties } from 'react';
import type { EntranceStage } from '../domain/entranceMachine';
import type { EntranceEnvironment } from '../domain/environment';
import { createEntranceEnvironment } from '../entranceEnvironment';
import { DevPreviewBar } from '../preview/DevPreviewBar';
import { useEntrance } from '../useEntrance';
import { ClubDefs } from './ClubDefs';
import { Facade } from './Facade';
import { Lounge } from '../../lounge/ui/Lounge';
import './entrance.css';

const ANNOUNCEMENTS: Partial<Record<EntranceStage, string>> = {
  'final-minute': 'Less than one minute until the club opens.',
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
  const model = useEntrance(env);
  const { stage, anticipation, reducedMotion } = model;

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
