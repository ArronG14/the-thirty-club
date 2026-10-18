import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useReducedMotion } from '../../shared/ui/useReducedMotion';
import {
  entranceReady,
  markVerified,
  shouldPlayVerification,
} from './firstVisit';
import './firstVisit.css';

type Beat = 'title' | 'init' | 'verify' | 'confirmed' | 'authorised';
const BEATS: readonly Beat[] = [
  'title',
  'init',
  'verify',
  'confirmed',
  'authorised',
];
/** Milliseconds each beat holds. `verify` also waits for readiness. */
const HOLD: Record<Beat, number> = {
  title: 900,
  init: 1100,
  verify: 1700,
  confirmed: 1100,
  authorised: 1500,
};
const REDUCED_HOLD = 0.7;
const EXIT_MS = 900;

function Scanner({ active }: { active: boolean }) {
  const dots: [number, number][] = [
    [70, 70],
    [130, 70],
    [100, 92],
    [76, 118],
    [124, 118],
    [100, 138],
    [58, 100],
    [142, 100],
    [100, 52],
    [84, 156],
    [116, 156],
  ];
  return (
    <svg
      className="fv-scanner"
      viewBox="0 0 200 200"
      aria-hidden="true"
      data-active={active}
    >
      <defs>
        <clipPath id="fv-lens">
          <circle cx="100" cy="100" r="78" />
        </clipPath>
        <linearGradient id="fv-beam" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#e9d39b" stopOpacity="0" />
          <stop offset="0.85" stopColor="#e9d39b" stopOpacity="0.55" />
          <stop offset="1" stopColor="#f6e7bd" stopOpacity="1" />
        </linearGradient>
      </defs>
      <circle className="fv-ring fv-ring--outer" cx="100" cy="100" r="94" />
      <circle className="fv-ring" cx="100" cy="100" r="86" />
      <g className="fv-ticks">
        {Array.from({ length: 48 }, (_, i) => (
          <line
            key={i}
            x1="100"
            y1="4"
            x2="100"
            y2={i % 4 === 0 ? 14 : 9}
            transform={`rotate(${i * 7.5} 100 100)`}
          />
        ))}
      </g>
      <circle className="fv-lens" cx="100" cy="100" r="78" />
      <g clipPath="url(#fv-lens)">
        <g className="fv-face">
          <ellipse cx="100" cy="100" rx="38" ry="52" />
          <path d="M70 70 Q100 56 130 70 M76 118 Q100 134 124 118 M100 92 L96 118 L104 118" />
          <path d="M70 70 L100 92 L130 70 M76 118 L100 138 L124 118 M58 100 L70 70 M142 100 L130 70 M100 52 L70 70 M100 52 L130 70" />
          {dots.map(([x, y]) => (
            <circle key={`${x}-${y}`} cx={x} cy={y} r="1.8" />
          ))}
        </g>
        <g className="fv-sweep">
          <rect x="22" y="-24" width="156" height="24" fill="url(#fv-beam)" />
        </g>
      </g>
      <path
        className="fv-brackets"
        d="M30 58 V40 H48 M170 58 V40 H152 M30 142 V160 H48 M170 142 V160 H152"
      />
    </svg>
  );
}

const CAPTIONS: Partial<Record<Beat, string>> = {
  init: 'Initialising private connection',
  verify: 'Verifying membership credentials',
};

function Sequence({ onEnter, onDone }: { onEnter(): void; onDone(): void }) {
  const reduced = useReducedMotion();
  const [beat, setBeat] = useState(0);
  const [ready, setReady] = useState(false);
  const [leaving, setLeaving] = useState(false);

  useEffect(() => {
    let live = true;
    void entranceReady().then(() => {
      if (live) setReady(true);
    });
    return () => {
      live = false;
    };
  }, []);

  const name = BEATS[beat] ?? 'authorised';
  const lastVerify = name === 'verify';
  useEffect(() => {
    const hold = HOLD[name] * (reduced ? REDUCED_HOLD : 1);
    // Hold on the verification beat until the entrance is ready: the
    // sequence extends itself rather than revealing a half-loaded scene.
    if (lastVerify && !ready) return;
    // The last beat stays until the visitor chooses to enter.
    if (beat >= BEATS.length - 1) return;
    const timer = setTimeout(() => setBeat(beat + 1), hold);
    return () => clearTimeout(timer);
  }, [beat, name, lastVerify, ready, reduced]);

  const enter = useRef<HTMLButtonElement>(null);
  const stage = BEATS.indexOf(name);
  useEffect(() => {
    if (stage === 4) enter.current?.focus();
  }, [stage]);

  useEffect(() => {
    if (!leaving) return;
    const timer = setTimeout(onDone, reduced ? 300 : EXIT_MS);
    return () => clearTimeout(timer);
  }, [leaving, onDone, reduced]);

  return (
    <div
      className="fv"
      data-beat={name}
      data-leaving={leaving}
      data-motion={reduced ? 'reduced' : 'full'}
      role="status"
      aria-live="polite"
    >
      <div className="fv__inner">
        <header className="fv__head">
          <h1 className="fv__title">The Thirty Club</h1>
          <p className="fv__sub">Private membership authentication</p>
        </header>
        {stage >= 1 && stage <= 2 && <Scanner active={name === 'verify'} />}
        {stage >= 3 && (
          <div className="fv__result">
            <p className="fv__confirmed">Identity confirmed</p>
            <p className="fv__name">Alise Gill</p>
            <p className="fv__rank">Founding Member · 001</p>
          </div>
        )}
        <div className="fv__foot">
          {CAPTIONS[name] && (
            <p className="fv__caption" key={name}>
              {CAPTIONS[name]}
            </p>
          )}
          {stage === 4 && (
            <>
              <p className="fv__access">Access authorised</p>
              <p className="fv__quote">
                “Ah, Mrs Gill. We’ve been expecting you.”
              </p>
              <button
                ref={enter}
                type="button"
                className="fv__enter"
                disabled={!ready || leaving}
                onClick={() => {
                  onEnter();
                  setLeaving(true);
                }}
              >
                Enter the Club
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * Renders above the entrance (which stays mounted and keeps loading beneath)
 * and makes it inert until the sequence ends.
 */
export function FirstVisitCinematic() {
  const [playing, setPlaying] = useState(() => shouldPlayVerification());

  useEffect(() => {
    if (!playing) return;
    const app = document.getElementById('root');
    app?.setAttribute('inert', '');
    return () => app?.removeAttribute('inert');
  }, [playing]);

  if (!playing) return null;
  return createPortal(
    <Sequence onEnter={markVerified} onDone={() => setPlaying(false)} />,
    document.body,
  );
}
