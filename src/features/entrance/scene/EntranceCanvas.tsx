/**
 * Mounts the real-time entrance. Lazily imported by the Facade, so three.js
 * stays out of the main bundle; the SVG facade shows until the first frame.
 */
import { useEffect, useRef, type RefObject } from 'react';
import type { Remaining } from '../domain/countdown';
import type { EntranceStage } from '../domain/entranceMachine';
import {
  EntranceScene,
  type FallbackReason,
  type SceneAnchors,
} from './EntranceScene';

export interface SceneHandle {
  ring(speakingForMs: number): void;
}

export interface EntranceCanvasProps {
  stage: EntranceStage;
  anticipation: number;
  remaining: Remaining;
  reducedMotion: boolean;
  handle: RefObject<SceneHandle | null>;
  onReady(): void;
  onFallback(reason: FallbackReason): void;
  onDoorTap(): void;
  onClockTap(): void;
}

// Instrument-style abbreviations fit the plate; the timer text is in full.
const LABELS = ['Days', 'Hours', 'Mins', 'Secs'];

export default function EntranceCanvas(props: EntranceCanvasProps) {
  const clockRef = useRef<HTMLDivElement>(null);
  const hostRef = useRef<HTMLDivElement>(null);
  const labelRefs = useRef<(HTMLSpanElement | null)[]>([]);
  const sceneRef = useRef<EntranceScene | null>(null);
  // Latest props for callbacks created once per mount.
  const latest = useRef(props);
  useEffect(() => {
    latest.current = props;
    sceneRef.current?.update(props);
  });

  useEffect(() => {
    const container = hostRef.current;
    if (!container) return;
    // A fresh canvas per scene: a disposed scene releases its WebGL context,
    // which must never be one another instance (e.g. StrictMode) is using.
    const canvas = document.createElement('canvas');
    canvas.className = 'scene-canvas';
    canvas.setAttribute('aria-hidden', 'true');
    container.append(canvas);
    const host = container.closest<HTMLElement>('.facade');
    let cancelled = false;
    let scene: EntranceScene | null = null;

    const place = ({ bell, labels, clock }: SceneAnchors) => {
      host?.style.setProperty('--bell-left', `${bell.left}px`);
      host?.style.setProperty('--bell-top', `${bell.top}px`);
      host?.style.setProperty('--bell-width', `${bell.width}px`);
      host?.style.setProperty('--bell-height', `${bell.height}px`);
      const target = clockRef.current;
      if (target) {
        target.style.left = `${clock.left}px`;
        target.style.top = `${clock.top - Math.max(0, 44 - clock.height) / 2}px`;
        target.style.width = `${clock.width}px`;
        target.style.height = `${Math.max(44, clock.height)}px`;
      }
      labels.forEach((point, i) => {
        const el = labelRefs.current[i];
        if (el)
          el.style.transform = `translate(${point.x}px, ${point.y}px) translate(-50%, -50%)`;
      });
    };

    EntranceScene.create(canvas, {
      onReady: () => latest.current.onReady(),
      onFallback: (reason) => {
        if (import.meta.env.DEV)
          console.warn('[entrance] 3D scene fell back:', reason);
        latest.current.onFallback(reason);
      },
      onFrame: place,
      onDoorTap: () => latest.current.onDoorTap(),
    }).then(
      (created) => {
        if (cancelled) {
          created.dispose();
          return;
        }
        scene = created;
        sceneRef.current = created;
        created.update(latest.current);
        latest.current.handle.current = {
          ring: (ms) => created.ring(ms),
        };
      },
      (error: unknown) => {
        if (import.meta.env.DEV)
          console.warn('[entrance] 3D scene failed', error);
        if (!cancelled) latest.current.onFallback('error');
      },
    );

    return () => {
      cancelled = true;
      latest.current.handle.current = null;
      sceneRef.current = null;
      scene?.dispose();
      canvas.remove();
    };
  }, []);

  return (
    <>
      <div
        ref={clockRef}
        className="owner-clock-target"
        aria-hidden="true"
        onClick={(e) => {
          e.stopPropagation();
          props.onClockTap();
        }}
      />
      <div ref={hostRef} className="scene-host" aria-hidden="true" />
      <div className="scene-labels" aria-hidden="true">
        {LABELS.map((label, i) => (
          <span
            key={label}
            ref={(el) => {
              labelRefs.current[i] = el;
            }}
          >
            {label}
          </span>
        ))}
      </div>
    </>
  );
}
