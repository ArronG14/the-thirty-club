import { lazy, Suspense } from 'react';
import type { ButlerOverlaysProps } from './ButlerOverlays';

const ButlerOverlays = lazy(() => import('./ButlerOverlays'));

/** Loads the Butler's overlays on demand, outside the main bundle. */
export function OverlaysSlot(props: ButlerOverlaysProps) {
  return (
    <Suspense fallback={null}>
      <ButlerOverlays {...props} />
    </Suspense>
  );
}
