/**
 * Mounts the real-time vault. Lazily imported by the vault view, so
 * three.js stays out of the main bundle; the CSS chamber shows until the
 * first frame and whenever WebGL is unavailable. Remount (change `key`)
 * when the set of compartments changes: their layout is built once.
 */
import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react';
import {
  VaultScene,
  type LabelAnchor,
  type Mechanism,
  type SceneCompartment,
  type VaultFallbackReason,
  type VaultSceneInput,
} from './VaultScene';

export interface VaultStage {
  playOpening(id: string, again: boolean): Promise<void>;
}

export interface VaultCanvasProps extends VaultSceneInput {
  compartments: readonly SceneCompartment[];
  intro: boolean;
  onReady(): void;
  onFallback(reason: VaultFallbackReason): void;
  onSelect(id: string): void;
  onMechanism(kind: Mechanism): void;
}

const VaultCanvas = forwardRef<VaultStage, VaultCanvasProps>(
  function VaultCanvas(props, ref) {
    const hostRef = useRef<HTMLDivElement>(null);
    const sceneRef = useRef<VaultScene | null>(null);
    const latest = useRef(props);
    useEffect(() => {
      latest.current = props;
      sceneRef.current?.update(props);
    });

    useImperativeHandle(
      ref,
      () => ({
        playOpening: (id, again) =>
          sceneRef.current?.playOpening(id, again) ?? Promise.resolve(),
      }),
      [],
    );

    useEffect(() => {
      const container = hostRef.current;
      if (!container) return;
      // A fresh canvas per scene: a disposed scene releases its WebGL context.
      const canvas = document.createElement('canvas');
      canvas.className = 'scene-canvas gift-vault__canvas';
      canvas.setAttribute('aria-hidden', 'true');
      container.append(canvas);
      const host = container.closest<HTMLElement>('.gift-vault');
      let cancelled = false;
      let scene: VaultScene | null = null;

      const place = (anchors: LabelAnchor[]) => {
        if (!host) return;
        for (const a of anchors) {
          const label = host.querySelector<HTMLElement>(
            `[data-vault-label="${a.id}"]`,
          );
          if (!label) continue;
          label.style.transform = `translate(${a.x}px, ${a.y}px)`;
          label.dataset.visible = a.visible ? 'true' : 'false';
        }
      };

      VaultScene.create(
        canvas,
        {
          onReady: () => latest.current.onReady(),
          onFallback: (reason) => {
            if (import.meta.env.DEV)
              console.warn('[vault] 3D scene fell back:', reason);
            latest.current.onFallback(reason);
          },
          onFrame: place,
          onSelect: (id) => latest.current.onSelect(id),
          onMechanism: (kind) => latest.current.onMechanism(kind),
        },
        latest.current.compartments,
        latest.current.intro,
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
            console.warn('[vault] 3D scene failed', error);
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
  },
);

export default VaultCanvas;
