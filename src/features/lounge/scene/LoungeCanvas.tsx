/**
 * Mounts the real-time lounge. Lazily imported by the Lounge, so three.js
 * stays out of the main bundle; the CSS lounge shows until the first frame.
 */
import { useEffect, useRef } from 'react';
import {
  LoungeScene,
  type LoungeAnchors,
  type LoungeFallbackReason,
  type LoungeInput,
  type LoungeTarget,
} from './LoungeScene';

export interface LoungeCanvasProps extends LoungeInput {
  /** Room names engraved on the directory board. */
  directoryNames: readonly string[];
  screeningName: string;
  onReady(): void;
  onFallback(reason: LoungeFallbackReason): void;
  onSelect(target: LoungeTarget): void;
}

export default function LoungeCanvas(props: LoungeCanvasProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<LoungeScene | null>(null);
  const latest = useRef(props);
  useEffect(() => {
    latest.current = props;
    sceneRef.current?.update(props);
  });

  useEffect(() => {
    const container = hostRef.current;
    if (!container) return;
    // A fresh canvas per scene: a disposed scene releases its WebGL context.
    const canvas = document.createElement('canvas');
    canvas.className = 'scene-canvas lounge__canvas';
    canvas.setAttribute('aria-hidden', 'true');
    container.append(canvas);
    const host = container.closest<HTMLElement>('.lounge');
    let cancelled = false;
    let scene: LoungeScene | null = null;

    // Labels stay wholly on screen even when their anchor nears an edge.
    const inset = (x: number) =>
      Math.min(window.innerWidth - 72, Math.max(72, x));
    const place = ({ screening, directory }: LoungeAnchors) => {
      if (!host) return;
      host.style.setProperty('--screening-x', `${inset(screening.x)}px`);
      host.style.setProperty('--screening-y', `${screening.y}px`);
      host.dataset.screeningMark = screening.visible ? 'visible' : 'hidden';
      host.style.setProperty('--directory-x', `${inset(directory.x)}px`);
      host.style.setProperty('--directory-y', `${directory.y}px`);
      host.dataset.directoryMark = directory.visible ? 'visible' : 'hidden';
    };

    const { directoryNames, screeningName } = latest.current;
    LoungeScene.create(
      canvas,
      {
        onReady: () => latest.current.onReady(),
        onFallback: (reason) => {
          if (import.meta.env.DEV)
            console.warn('[lounge] 3D scene fell back:', reason);
          latest.current.onFallback(reason);
        },
        onFrame: place,
        onSelect: (target) => latest.current.onSelect(target),
      },
      directoryNames,
      screeningName,
    ).then(
      (created) => {
        if (cancelled) {
          created.dispose();
          return;
        }
        scene = created;
        sceneRef.current = created;
        created.update(latest.current);
      },
      (error: unknown) => {
        if (import.meta.env.DEV)
          console.warn('[lounge] 3D scene failed', error);
        if (!cancelled) latest.current.onFallback('error');
      },
    );

    return () => {
      cancelled = true;
      sceneRef.current = null;
      scene?.dispose();
      canvas.remove();
    };
  }, []);

  return <div ref={hostRef} className="scene-host" aria-hidden="true" />;
}
