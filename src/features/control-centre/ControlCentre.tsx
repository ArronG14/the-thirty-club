/**
 * The Owner Control Centre (ADR-018): one dashboard at `/concierge/owner`
 * with two unmistakable worlds.
 *
 * - LIVE (`/concierge/owner`): the real Butler's Office (password, server
 *   session) and the real Concierge console (owner key). Everything acts on
 *   production records.
 * - TEST (`/concierge/owner/test`): the same two consoles, unchanged,
 *   answered by the simulated office in this tab, plus the rehearsal
 *   engine: clock, timeline, scenarios, room launches and event triggers.
 *
 * The two are separate documents. Switching is a full navigation, and the
 * guard below reloads any page that finds itself in the wrong world, so a
 * simulated action can never reach the real server, nor the reverse.
 */
import { lazy, Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router';
import { OFFICE_TABS, type OfficeTab } from '../butlers-office/tabs';
import { ownerActive } from '../owner/session';
import {
  documentWorld,
  LIVE_CENTRE_PATH,
  simulatedOwnerDocument,
  TEST_CENTRE_PATH,
} from '../rehearsal/mode';
import { TEST_ENV } from '../../../netlify/concierge/testing';
import { OWNER_KEY_STORAGE } from '../concierge/owner/ownerApi';
import { deviceStorage } from '../rehearsal/storage';
import './controlCentre.css';

const ButlersOffice = lazy(() => import('../butlers-office/ButlersOffice'));
const OwnerConsole = lazy(() => import('../concierge/owner/OwnerConsole'));
const RehearsalDesk = lazy(() => import('./RehearsalDesk'));
const CasinoRewardsDesk = lazy(() => import('./CasinoRewardsDesk'));
const DrinksDesk = lazy(() => import('./DrinksDesk'));
const CardDesk = lazy(() => import('./CardDesk'));
const FilmsDesk = lazy(() => import('./FilmsDesk'));
const CommunicationHold = lazy(() => import('./CommunicationHold'));
const SmsOperations = lazy(() => import('./SmsOperations'));

type Section =
  | 'rehearsal'
  | 'office'
  | 'concierge'
  | 'casino'
  | 'drinks'
  | 'card'
  | 'films'
  | 'sms';

const isOfficeTab = (value: string | null): value is OfficeTab =>
  OFFICE_TABS.includes(value as OfficeTab);

function Loading() {
  return (
    <p className="cc-status" role="status">
      One moment…
    </p>
  );
}

export default function ControlCentre({ world }: { world: 'live' | 'test' }) {
  const [params, setParams] = useSearchParams();
  const wrongWorld =
    (world === 'test') !== simulatedOwnerDocument ||
    (world === 'live' && documentWorld !== 'live');
  useEffect(() => {
    // An in-app navigation crossed between LIVE and TEST: start a fresh
    // document in the right world before anything can be requested.
    if (wrongWorld) window.location.reload();
  }, [wrongWorld]);

  const requested = params.get('section');
  const start = params.get('start');
  const fallback: Section =
    start === 'departure' || start === 'shopping'
      ? 'concierge'
      : world === 'test'
        ? 'rehearsal'
        : 'office';
  const [section, setSection] = useState<Section>(
    requested === 'office' ||
      requested === 'concierge' ||
      requested === 'casino' ||
      requested === 'drinks' ||
      requested === 'card' ||
      requested === 'films' ||
      requested === 'sms' ||
      (requested === 'rehearsal' && world === 'test')
      ? requested
      : fallback,
  );
  const tab = params.get('tab');
  useState(() => {
    // The simulated concierge's owner key is the obviously fake test key;
    // it is kept in this tab's rehearsal storage only.
    if (world === 'test' && simulatedOwnerDocument && ownerActive)
      try {
        deviceStorage().setItem(
          OWNER_KEY_STORAGE,
          TEST_ENV.CONCIERGE_OWNER_KEY,
        );
      } catch {
        // The console will ask for it; it is shown in the Rehearsal section.
      }
    return null;
  });

  const choose = (next: Section) => {
    setSection(next);
    const query = new URLSearchParams(params);
    query.set('section', next);
    query.delete('tab');
    setParams(query, { replace: true });
  };

  if (wrongWorld) return <Loading />;

  const sections: { id: Section; label: string }[] = [
    ...(world === 'test'
      ? [{ id: 'rehearsal' as const, label: 'Rehearsal' }]
      : []),
    { id: 'office', label: 'Butler’s Office' },
    { id: 'concierge', label: 'Concierge & privileges' },
    { id: 'casino', label: 'Casino & rewards' },
    { id: 'drinks', label: 'Drinks' },
    { id: 'card', label: 'Birthday card' },
    { id: 'films', label: 'Films' },
    { id: 'sms', label: 'SMS operations' },
  ];

  return (
    <main className="control-centre" data-world={world}>
      <header className="cc-header">
        <a className="cc-eyebrow" href="/">
          The Thirty Club
        </a>
        <h1>Owner Control Centre</h1>
        <nav className="cc-worlds" aria-label="Operating mode">
          <a
            href={LIVE_CENTRE_PATH}
            aria-current={world === 'live' ? 'page' : undefined}
            data-world="live"
          >
            <strong>LIVE</strong>
            <span>The real club</span>
          </a>
          <a
            href={TEST_CENTRE_PATH}
            aria-current={world === 'test' ? 'page' : undefined}
            data-world="test"
          >
            <strong>TEST</strong>
            <span>Simulation</span>
          </a>
        </nav>
      </header>

      {world === 'live' ? (
        <p className="cc-banner" data-world="live" role="note">
          <strong>LIVE.</strong> These controls act on Alise’s real records. SMS
          still requires approval and the server switch.
        </p>
      ) : (
        <p className="cc-banner" data-world="test" role="note">
          <strong>TEST · simulation.</strong> Everything here runs in this
          browser tab. Nothing reaches Alise, Twilio, Telegram or the real
          database.
        </p>
      )}

      {world === 'test' && !ownerActive ? (
        <section className="cc-gate">
          <h2>Dev Mode required</h2>
          <p>
            TEST uses the Dev Mode rehearsal of this tab. Enter the private
            access code to begin. LIVE is unaffected.
          </p>
          <button
            type="button"
            onClick={() =>
              window.dispatchEvent(new Event('thirty-club:owner-prompt'))
            }
          >
            Enter the private access code
          </button>
        </section>
      ) : (
        <>
          <Suspense fallback={null}>
            <CommunicationHold />
          </Suspense>
          <nav className="cc-sections" aria-label="Control Centre sections">
            {sections.map((s) => (
              <button
                key={s.id}
                type="button"
                aria-pressed={section === s.id}
                onClick={() => choose(s.id)}
              >
                {s.label}
              </button>
            ))}
          </nav>
          <Suspense fallback={<Loading />}>
            {section === 'rehearsal' && world === 'test' && <RehearsalDesk />}
            {section === 'office' && (
              <ButlersOffice
                embedded
                initialTab={isOfficeTab(tab) ? tab : 'overview'}
                onTab={(next) => {
                  const query = new URLSearchParams(params);
                  query.set('section', 'office');
                  query.set('tab', next);
                  setParams(query, { replace: true });
                }}
              />
            )}
            {section === 'concierge' && <OwnerConsole embedded />}
            {section === 'casino' && <CasinoRewardsDesk />}
            {section === 'drinks' && <DrinksDesk />}
            {section === 'card' && <CardDesk />}
            {section === 'films' && <FilmsDesk />}
            {section === 'sms' && <SmsOperations />}
          </Suspense>
        </>
      )}
    </main>
  );
}
