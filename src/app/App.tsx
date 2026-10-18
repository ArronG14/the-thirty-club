import OwnerAccess from '../features/owner/OwnerAccess';
import { lazy, Suspense } from 'react';
import { Route, Routes } from 'react-router';
import { RoomGate } from '../features/club/ui/RoomGate';
import { Entrance } from '../features/entrance/ui/Entrance';
import { AppShell } from '../shared/ui/AppShell';
import { useConnectivity } from '../shared/state/useConnectivity';

const ScreeningPreview = import.meta.env.DEV
  ? lazy(() => import('../features/screening/preview/ScreeningPreview'))
  : null;

export function App() {
  useConnectivity();
  const preview = import.meta.env.DEV
    ? new URLSearchParams(window.location.search).get('preview')
    : null;
  if (ScreeningPreview && preview?.startsWith('screening')) {
    return (
      <Suspense fallback={null}>
        <ScreeningPreview mode={preview} />
      </Suspense>
    );
  }
  return (
    <AppShell>
      <OwnerAccess />
      <Routes>
        <Route path="/" element={<Entrance />} />
        <Route path="/rooms/:roomId" element={<RoomGate />} />
        <Route
          path="*"
          element={
            <section className="plain-page">
              <h1>This room does not exist.</h1>
              <a href="/">Return to the entrance</a>
            </section>
          }
        />
      </Routes>
    </AppShell>
  );
}
