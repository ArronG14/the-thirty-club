import { Route, Routes } from 'react-router';
import { FoundationPage } from '../features/foundation/FoundationPage';
import { AppShell } from '../shared/ui/AppShell';
import { useConnectivity } from '../shared/state/useConnectivity';

export function App() {
  useConnectivity();
  return (
    <AppShell>
      <Routes>
        <Route path="/" element={<FoundationPage />} />
        <Route
          path="*"
          element={
            <section>
              <h1>This room does not exist.</h1>
              <a href="/">Return to the entrance</a>
            </section>
          }
        />
      </Routes>
    </AppShell>
  );
}
