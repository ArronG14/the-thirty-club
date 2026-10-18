/**
 * Mounts the real-time casino. Lazily imported by the Casino view, so
 * three.js stays out of the main bundle; the CSS lobby shows until the
 * first frame and whenever WebGL is unavailable.
 */
import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react';
import { CASINO_ASSETS, SCENE_ASSET_KEYS } from '../config/casinoAssets';
import {
  CasinoScene,
  type AssetUrls,
  type CasinoAnchors,
  type CasinoFallbackReason,
  type CasinoInput,
  type CasinoTarget,
} from './CasinoScene';
import type { Station } from './casinoMath';

export interface CasinoStage {
  spinRoulette(pocket: number): Promise<void>;
  spinSlots(stops: readonly number[]): Promise<void>;
  celebrate(kind: 'win' | 'jackpot'): void;
}

export interface CasinoCanvasProps extends CasinoInput {
  onReady(): void;
  onFallback(reason: CasinoFallbackReason): void;
  onSelect(target: CasinoTarget): void;
  onLever(): void;
  onArrive(station: Station): void;
}

function assetUrls(): AssetUrls {
  const urls: AssetUrls = {};
  for (const key of SCENE_ASSET_KEYS) urls[key] = CASINO_ASSETS[key].src;
  return urls;
}

const CasinoCanvas = forwardRef<CasinoStage, CasinoCanvasProps>(
  function CasinoCanvas(props, ref) {
    const hostRef = useRef<HTMLDivElement>(null);
    const sceneRef = useRef<CasinoScene | null>(null);
    const latest = useRef(props);
    useEffect(() => {
      latest.current = props;
      sceneRef.current?.update(props);
    });

    useImperativeHandle(
      ref,
      () => ({
        spinRoulette: (pocket) =>
          sceneRef.current?.spinRoulette(pocket) ?? Promise.resolve(),
        spinSlots: (stops) =>
          sceneRef.current?.spinSlots(stops) ?? Promise.resolve(),
        celebrate: (kind) => sceneRef.current?.celebrate(kind),
      }),
      [],
    );

    useEffect(() => {
      const container = hostRef.current;
      if (!container) return;
      // A fresh canvas per scene: a disposed scene releases its WebGL context.
      const canvas = document.createElement('canvas');
      canvas.className = 'scene-canvas casino__canvas';
      canvas.setAttribute('aria-hidden', 'true');
      container.append(canvas);
      const host = container.closest<HTMLElement>('.casino');
      let cancelled = false;
      let scene: CasinoScene | null = null;

      // Labels stay wholly on screen even when their anchor nears an edge.
      const inset = (x: number) =>
        Math.min(window.innerWidth - 64, Math.max(64, x));
      const place = ({ roulette, slots }: CasinoAnchors) => {
        if (!host) return;
        host.style.setProperty('--roulette-x', `${inset(roulette.x)}px`);
        host.style.setProperty('--roulette-y', `${roulette.y}px`);
        host.dataset.rouletteMark = roulette.visible ? 'visible' : 'hidden';
        host.style.setProperty('--slots-x', `${inset(slots.x)}px`);
        host.style.setProperty('--slots-y', `${slots.y}px`);
        host.dataset.slotsMark = slots.visible ? 'visible' : 'hidden';
      };

      CasinoScene.create(
        canvas,
        {
          onReady: () => latest.current.onReady(),
          onFallback: (reason) => {
            if (import.meta.env.DEV)
              console.warn('[casino] 3D scene fell back:', reason);
            latest.current.onFallback(reason);
          },
          onFrame: place,
          onSelect: (target) => latest.current.onSelect(target),
          onLever: () => latest.current.onLever(),
          onArrive: (station) => latest.current.onArrive(station),
        },
        assetUrls(),
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
            console.warn('[casino] 3D scene failed', error);
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

export default CasinoCanvas;
