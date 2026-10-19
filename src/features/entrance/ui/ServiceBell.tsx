import { useEffect, useRef, useState } from 'react';
import {
  butlerLine,
  speechDuration,
  type ButlerContext,
} from '../domain/butlerScript';

interface Speech {
  text: string;
  turn: number;
}

/**
 * The butler's bell. As a `plate` it is the brass bell-push of the poster
 * facade; as `scene` it is an accessible button laid over the 3D bell-push
 * on the door jamb (positioned by the scene through CSS variables).
 */
export function ServiceBell({
  context,
  currentHour,
  variant = 'plate',
  onRing,
  announcement = null,
}: {
  context: ButlerContext | null;
  currentHour: () => number;
  variant?: 'plate' | 'scene';
  onRing?: (speakingForMs: number) => void;
  /** Something the Butler says unprompted (his service): spoken once per turn. */
  announcement?: { text: string; turn: number } | null;
}) {
  const [rings, setRings] = useState<Partial<Record<ButlerContext, number>>>(
    {},
  );
  const [speech, setSpeech] = useState<Speech | null>(null);
  const available = context !== null;
  const [heard, setHeard] = useState(0);
  if (announcement && announcement.turn !== heard) {
    setHeard(announcement.turn);
    setSpeech({ text: announcement.text, turn: (speech?.turn ?? 0) + 1 });
  }
  // On the scrolling poster facade his words can fall below the fold; bring
  // an unprompted remark into view (the 3D plinth is already on screen).
  const voice = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (heard === 0) return;
    const box = voice.current?.getBoundingClientRect();
    if (box && box.bottom > window.innerHeight)
      voice.current?.scrollIntoView?.({
        block: 'end',
        behavior: window.matchMedia?.('(prefers-reduced-motion: reduce)')
          .matches
          ? 'auto'
          : 'smooth',
      });
  }, [heard]);

  useEffect(() => {
    if (!speech) return;
    const timer = setTimeout(
      () => setSpeech(null),
      speechDuration(speech.text),
    );
    return () => clearTimeout(timer);
  }, [speech]);

  function ring() {
    if (!context) return;
    const index = rings[context] ?? 0;
    const text = butlerLine(context, index, currentHour());
    setRings({ ...rings, [context]: index + 1 });
    setSpeech({ text, turn: (speech?.turn ?? 0) + 1 });
    onRing?.(speechDuration(text));
  }

  return (
    <div
      className="service"
      data-speaking={speech ? 'true' : 'false'}
      inert={!available}
    >
      <div ref={voice} className="service__speech" aria-live="polite">
        {speech && (
          <figure key={speech.turn} className="service__words">
            <blockquote>
              <p>{speech.text}</p>
            </blockquote>
            <figcaption>The Butler</figcaption>
          </figure>
        )}
      </div>
      {variant === 'scene' ? (
        <button
          type="button"
          className="bell bell--scene"
          onClick={ring}
          disabled={!available}
        >
          <span className="bell__caption">Ring for service</span>
        </button>
      ) : (
        <button
          type="button"
          className="bell"
          onClick={ring}
          disabled={!available}
        >
          <span className="bell__grille" aria-hidden="true" />
          <span className="bell__label">Ring for service</span>
          <span className="bell__push" aria-hidden="true">
            <span key={speech?.turn ?? 0} className="bell__pearl" />
          </span>
        </button>
      )}
    </div>
  );
}
