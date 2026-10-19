import { lazy, StrictMode, Suspense } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router';
import { App } from './app/App';
import { FirstVisitCinematic } from './features/verification/FirstVisitCinematic';
import './styles/global.css';
import { simulationActive } from './features/rehearsal/mode';
import { installRehearsalFetch } from './features/rehearsal/sim/interceptor';

// A rehearsal document answers its own API calls (ADR-018); nothing real.
if (simulationActive) installRehearsalFetch();

// DEV-MENU (remove with src/dev): statically false, so absent from production.
const DevMenu = import.meta.env.DEV
  ? lazy(() => import('./dev/DevMenu'))
  : null;

const root = document.getElementById('root');
if (!root) throw new Error('Application root is missing.');

createRoot(root).render(
  <StrictMode>
    <BrowserRouter>
      <App />
      <FirstVisitCinematic />
      {DevMenu && (
        <Suspense fallback={null}>
          <DevMenu />
        </Suspense>
      )}
    </BrowserRouter>
  </StrictMode>,
);
