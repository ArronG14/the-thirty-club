import { fiveTapGesture } from '../../owner/session';
import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { butlerContextFor } from '../domain/butlerScript';
import { canRender3D } from '../scene/canRender3D';
import {
  diagnosticsRequested,
  noteEntrance,
} from '../scene/entranceDiagnostics';
import { EntranceDiagBadge } from './EntranceDiagBadge';
import type { SceneHandle } from '../scene/EntranceCanvas';
import { preloadLounge } from '../../lounge/preload';
import {
  EntranceLetter,
  MembershipPrompt,
} from '../../concierge/ui/EntranceConcierge';
import type { EntranceModel } from '../useEntrance';
import { Portal } from './Portal';
import { ServiceBell } from './ServiceBell';
import { Timepiece } from './Timepiece';

const EntranceCanvas = lazy(() => import('../scene/EntranceCanvas'));

/**
 * poster   — the SVG facade (no WebGL, or the scene gave up)
 * loading  — SVG facade showing while the 3D chunk and textures load
 * fading   — first 3D frame drawn; the scene dissolves in over the poster
 * scene    — the real-time entrance with HTML overlays
 */
type RenderMode = 'poster' | 'loading' | 'fading' | 'scene';
const FADE_MS = 1400;

/** The street-side entrance: sign, doors, timepiece and bell. */
export function Facade({ model }: { model: EntranceModel }) {
  const {
    stage,
    remaining,
    anticipation,
    reducedMotion,
    enter,
    currentHour,
    member,
    presentMembership,
    now,
  } = model;
  const [secretTap] = useState(() =>
    fiveTapGesture(() =>
      window.dispatchEvent(new Event('thirty-club:owner-prompt')),
    ),
  );
  const onClockTap = () => secretTap(performance.now());
  const awaiting = stage === 'awaiting-entry';
  const awaitingCard = stage === 'awaiting-credential';
  const prepared = stage === 'locked' || stage === 'final-minute';
  const [mode, setMode] = useState<RenderMode>(() => {
    if (canRender3D()) return 'loading';
    noteEntrance({
      state: 'fallback',
      reason: 'webgl-unavailable',
      message: 'WebGL2 probe failed',
    });
    return 'poster';
  });
  const scene = useRef<SceneHandle | null>(null);

  // Fetch the lounge while the doors open, so the room beyond is ready.
  const unlocked = !prepared;
  useEffect(() => {
    if (unlocked) preloadLounge();
  }, [unlocked]);

  useEffect(() => {
    if (mode !== 'fading') return;
    const timer = setTimeout(() => setMode('scene'), FADE_MS);
    return () => clearTimeout(timer);
  }, [mode]);

  const live = mode === 'fading' || mode === 'scene';

  return (
    <section className="facade" data-render={mode} aria-labelledby="club-title">
      {mode !== 'poster' && (
        <Suspense fallback={null}>
          <EntranceCanvas
            stage={stage}
            anticipation={anticipation}
            remaining={remaining}
            reducedMotion={reducedMotion}
            handle={scene}
            onReady={() => setMode((m) => (m === 'loading' ? 'fading' : m))}
            onFallback={() => setMode('poster')}
            onDoorTap={enter}
            onClockTap={onClockTap}
          />
        </Suspense>
      )}

      <header className="facade__sign">
        <p className="facade__est">Est. MMXXVI</p>
        <h1 id="club-title" className="facade__title">
          The Thirty Club
        </h1>
        <p className="facade__membership">
          <span>Private membership</span>
          <span className="facade__rule" aria-hidden="true" />
          <span>By invitation only</span>
        </p>
      </header>

      {diagnosticsRequested() && <EntranceDiagBadge />}

      <Portal onEnter={awaiting ? enter : undefined} />

      <div className="facade__plinth">
        <Timepiece
          remaining={remaining}
          reducedMotion={reducedMotion}
          onTap={onClockTap}
        />
        <p className="facade__line">
          {awaitingCard
            ? 'Happy birthday, Alise. Your membership card, if you please.'
            : prepared
              ? member
                ? 'Alise, your card is in order. Your table is being prepared.'
                : 'Alise, your table is being prepared.'
              : 'Alise, your table is ready.'}
        </p>
        {stage === 'locked' && <EntranceLetter now={now} />}
        {awaitingCard && <MembershipPrompt onPresented={presentMembership} />}
        {awaiting && (
          <button type="button" className="facade__enter" onClick={enter}>
            Enter the club
          </button>
        )}
        <ServiceBell
          context={butlerContextFor(stage)}
          currentHour={currentHour}
          variant={live ? 'scene' : 'plate'}
          onRing={(ms) => scene.current?.ring(ms)}
        />
      </div>
    </section>
  );
}
