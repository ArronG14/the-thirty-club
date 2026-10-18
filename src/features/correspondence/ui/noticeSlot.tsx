import { lazy, Suspense } from 'react';

const CorrespondenceNotice = lazy(() => import('./CorrespondenceNotice'));

/** Loads the Butler's correspondence notice on demand, outside the main bundle. */
export function CorrespondenceNoticeSlot({
  delayMs,
}: {
  delayMs?: number | undefined;
}) {
  return (
    <Suspense fallback={null}>
      <CorrespondenceNotice delayMs={delayMs} />
    </Suspense>
  );
}
