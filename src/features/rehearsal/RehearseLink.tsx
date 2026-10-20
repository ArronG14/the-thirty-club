/**
 * `/rehearse` — where the owner's rehearsal SMS links lead (ADR-022). It
 * acts only in Dev Mode (after the private access code), and then only on
 * the TEST rehearsal in this browser tab: it launches the moment the SMS
 * belongs to. Anyone else sees a quiet notice; nothing LIVE is touched.
 */
import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router';
import { ownerActive } from '../owner/session';
import { simulationActive } from './mode';

const SAFE_PATH = /^\/(?:[a-z0-9-]+(?:\/[a-z0-9-]+)*)?$/;

export default function RehearseLink() {
  const [params] = useSearchParams();
  const [error, setError] = useState('');
  const scenario = params.get('scenario');
  const launch = params.get('launch');
  const path = params.get('path') ?? '/';
  const ready = ownerActive && simulationActive;

  useEffect(() => {
    if (!ready) return;
    let alive = true;
    void import('./engine')
      .then(async (engine) => {
        if (scenario && engine.SCENARIOS.some((s) => s.id === scenario))
          await engine.applyScenario(scenario);
        else if (launch && engine.LAUNCH_TARGETS.some((t) => t.id === launch))
          await engine.launchRoom(launch);
        else window.location.assign(SAFE_PATH.test(path) ? path : '/');
      })
      .catch(() => {
        if (alive) setError('The rehearsal could not be prepared.');
      });
    return () => {
      alive = false;
    };
  }, [ready, scenario, launch, path]);

  return (
    <section className="plain-page" aria-labelledby="rehearse-title">
      <p className="room-gate__eyebrow">The Thirty Club · Owner rehearsal</p>
      <h1 id="rehearse-title">A rehearsal link</h1>
      {ready ? (
        <p role="status">{error || 'Preparing the rehearsal in TEST…'}</p>
      ) : (
        <>
          <p>
            This link opens a rehearsal in TEST, on this phone only. Enter the
            private access code to continue; nothing real is affected.
          </p>
          <button
            type="button"
            className="link-button"
            onClick={() =>
              window.dispatchEvent(new Event('thirty-club:owner-prompt'))
            }
          >
            Enter the private access code
          </button>
        </>
      )}
      <a href="/">Return to the club</a>
    </section>
  );
}
