import OwnerAccess from '../features/owner/OwnerAccess';
import { lazy, Suspense } from 'react';
import {
  Navigate,
  Route,
  Routes,
  useLocation,
  useSearchParams,
} from 'react-router';
import { RoomGate } from '../features/club/ui/RoomGate';
import { RehearsalRibbon } from '../features/concierge/ui/RehearsalRibbon';
import { Entrance } from '../features/entrance/ui/Entrance';
import { AppShell } from '../shared/ui/AppShell';
import { useConnectivity } from '../shared/state/useConnectivity';

const ControlCentre = lazy(
  () => import('../features/control-centre/ControlCentre'),
);

const DepartureLounge = lazy(
  () => import('../features/concierge/ui/DepartureLounge'),
);
const CredentialArrival = lazy(
  () => import('../features/concierge/ui/CredentialArrival'),
);
const ShoppingPrivilege = lazy(
  () => import('../features/concierge/ui/ShoppingPrivilege'),
);
const VaultKeyArrival = lazy(() =>
  import('../features/vault/ui/VaultRoutes').then((m) => ({
    default: m.VaultKeyArrival,
  })),
);
const VaultRoute = lazy(() =>
  import('../features/vault/ui/VaultRoutes').then((m) => ({
    default: m.VaultRoute,
  })),
);
const VaultPreviewRoute = lazy(() =>
  import('../features/vault/ui/VaultRoutes').then((m) => ({
    default: m.VaultPreviewRoute,
  })),
);
const CorrespondenceCollection = lazy(() =>
  import('../features/correspondence/ui/CorrespondenceRoom').then((m) => ({
    default: m.CorrespondenceCollection,
  })),
);
const CorrespondenceLetter = lazy(() =>
  import('../features/correspondence/ui/CorrespondenceRoom').then((m) => ({
    default: m.CorrespondenceLetter,
  })),
);

/**
 * `/owner` was the Butler's Office; it now lives in the Owner Control
 * Centre's LIVE tab. Old links and bookmarks (with `?tab=`) still work.
 */
function OwnerRedirect() {
  const { search, hash } = useLocation();
  const query = new URLSearchParams(search);
  query.set('section', 'office');
  return <Navigate to={`/concierge/owner?${query}${hash}`} replace />;
}

/** Quiet holding state while a lazily loaded room arrives. */
function Arriving() {
  return (
    <p className="plain-page" role="status">
      One moment…
    </p>
  );
}

const ScreeningPreview = import.meta.env.DEV
  ? lazy(() => import('../features/screening/preview/ScreeningPreview'))
  : null;

export function App() {
  useConnectivity();
  const [params, setParams] = useSearchParams();
  const shopping = params.get('concierge') === 'shopping';
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
      <RehearsalRibbon />
      {shopping && (
        <Suspense fallback={null}>
          <ShoppingPrivilege
            onClose={() => {
              const next = new URLSearchParams(params);
              next.delete('concierge');
              setParams(next, { replace: true });
            }}
          />
        </Suspense>
      )}
      <Routes>
        <Route path="/" element={<Entrance />} />
        <Route path="/owner" element={<OwnerRedirect />} />
        <Route
          path="/owner/vault-preview/:id"
          element={
            <Suspense fallback={<Arriving />}>
              <VaultPreviewRoute />
            </Suspense>
          }
        />
        <Route
          path="/vault"
          element={
            <Suspense fallback={<Arriving />}>
              <VaultRoute />
            </Suspense>
          }
        />
        <Route
          path="/v/:token"
          element={
            <Suspense fallback={<Arriving />}>
              <VaultKeyArrival />
            </Suspense>
          }
        />
        <Route
          path="/correspondence"
          element={
            <Suspense fallback={<Arriving />}>
              <CorrespondenceCollection />
            </Suspense>
          }
        />
        <Route
          path="/correspondence/:id"
          element={
            <Suspense fallback={<Arriving />}>
              <CorrespondenceLetter />
            </Suspense>
          }
        />
        <Route path="/rooms/:roomId" element={<RoomGate />} />
        <Route
          path="/departure"
          element={
            <Suspense fallback={<Arriving />}>
              <DepartureLounge />
            </Suspense>
          }
        />
        <Route
          path="/c/:token"
          element={
            <Suspense fallback={<Arriving />}>
              <CredentialArrival />
            </Suspense>
          }
        />
        <Route
          path="/concierge/owner"
          element={
            <Suspense fallback={<Arriving />}>
              <ControlCentre world="live" />
            </Suspense>
          }
        />
        <Route
          path="/concierge/owner/test"
          element={
            <Suspense fallback={<Arriving />}>
              <ControlCentre world="test" />
            </Suspense>
          }
        />
        <Route
          path="/concierge/owner/test/vault-preview/:id"
          element={
            <Suspense fallback={<Arriving />}>
              <VaultPreviewRoute />
            </Suspense>
          }
        />
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
