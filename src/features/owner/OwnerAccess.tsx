import { useEffect, useRef, useState } from 'react';
import { useRehearsalTime } from '../rehearsal/useRehearsalTime';
import {
  BUTLER_LINES,
  type ButlerMoment,
} from '../butler-service/domain/dialogue';
import {
  advanceRehearsal,
  followsRealTime,
  resetRehearsalClock,
  setRehearsalTime,
} from '../rehearsal/clock';
import {
  applyScenario,
  formatRehearsalTime,
  LAUNCH_TARGETS,
  launchRoom,
  nextEvent,
  rehearsalLabel,
  resetEverything,
  resetRoom,
  SCENARIOS,
} from '../rehearsal/engine';
import {
  documentWorld,
  LIVE_CENTRE_PATH,
  TEST_CENTRE_PATH,
} from '../rehearsal/mode';
import { authenticateOwner, exitOwner, ownerActive } from './session';
import './owner.css';

const MOMENT_NAMES: Record<ButlerMoment, string> = {
  'unread-greeting': 'Greeting, when a letter is waiting',
  ring: 'Answering the bell',
  correspondence: 'Introducing her correspondence',
  'request-received': 'Acknowledging a request',
  thanks: 'Thanking her',
  departure: 'Inviting her to the Departure Lounge',
};

const RESETTABLE = [
  { id: 'entrance', label: 'Entrance' },
  { id: 'lounge', label: 'Lounge & membership' },
  { id: 'screening-room', label: 'Screening Room' },
  { id: 'casino', label: 'Casino & prizes' },
  { id: 'gift-vault', label: 'Gift Vault & office' },
] as const;

/**
 * The secret Dev Menu (five taps on the timepiece, then the PIN): a
 * rehearsal launcher. Everything here changes only this tab's rehearsal
 * (ADR-018); the Owner Control Centre's LIVE tab still asks for the real
 * owner password on the server.
 */
export default function OwnerAccess() {
  const dialog = useRef<HTMLDialogElement>(null);
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState('');
  const opener = useRef<HTMLElement | null>(null);
  const rehearsing = ownerActive && documentWorld === 'rehearsal';
  const now = useRehearsalTime(ownerActive);
  const time = formatRehearsalTime(now);
  const upcoming = nextEvent(now);

  useEffect(() => {
    const show = () => {
      opener.current = document.activeElement as HTMLElement;
      setPin('');
      setError('');
      dialog.current?.showModal();
    };
    window.addEventListener('thirty-club:owner-prompt', show);
    return () => window.removeEventListener('thirty-club:owner-prompt', show);
  }, []);

  async function act(label: string, action: () => Promise<void> | void) {
    setBusy(label);
    setError('');
    try {
      await action();
    } catch (e) {
      setError(
        e instanceof Error ? e.message : 'That rehearsal step did not finish.',
      );
    } finally {
      setBusy('');
    }
  }
  const reload = () => window.location.reload();

  return (
    <>
      {ownerActive && (
        <button
          className="owner-toggle"
          aria-label="Open Dev Mode"
          data-world={documentWorld}
          onClick={() => {
            opener.current = document.activeElement as HTMLElement;
            dialog.current?.showModal();
          }}
        >
          Dev
        </button>
      )}
      {rehearsing && (
        <p className="rehearsal-indicator" data-testid="rehearsal-indicator">
          <span>
            Rehearsal in progress · {time.jm} Jamaica time (simulated)
          </span>
        </p>
      )}
      <dialog
        ref={dialog}
        className="owner-dialog"
        aria-labelledby="owner-title"
        onClose={() => opener.current?.focus()}
      >
        <p className="owner-eyebrow">The Thirty Club · Private office</p>
        <h2 id="owner-title">
          {ownerActive ? 'Dev Mode' : 'A private appointment'}
        </h2>
        {ownerActive && !rehearsing && (
          <>
            <p>
              This page is <strong>LIVE</strong>: it works on the real club.
              Rehearsal controls work on any club page and in TEST.
            </p>
            <div className="owner-actions">
              <button onClick={() => window.location.assign(TEST_CENTRE_PATH)}>
                Open Owner Control Centre · TEST
              </button>
              <button onClick={() => window.location.assign('/')}>
                Return to the rehearsal
              </button>
            </div>
          </>
        )}
        {rehearsing && (
          <>
            <p className="owner-time" role="status">
              <strong>Rehearsal time</strong>
              <span>{time.jm} · Jamaica</span>
              <span>{time.uk} · UK</span>
              <span>
                {followsRealTime()
                  ? 'Following the real clock'
                  : (rehearsalLabel() ?? 'Simulated clock')}
              </span>
            </p>
            <div className="owner-actions owner-actions--row">
              <button
                onClick={() =>
                  void act('clock', () => {
                    advanceRehearsal(10 * 60_000);
                    reload();
                  })
                }
              >
                +10 min
              </button>
              <button
                onClick={() =>
                  void act('clock', () => {
                    advanceRehearsal(3_600_000);
                    reload();
                  })
                }
              >
                +1 hour
              </button>
              <button
                onClick={() =>
                  void act('clock', () => {
                    resetRehearsalClock();
                    reload();
                  })
                }
              >
                Real time
              </button>
            </div>
            {upcoming && (
              <div className="owner-actions">
                <button
                  onClick={() =>
                    void act('clock', () => {
                      setRehearsalTime(upcoming.at - 10_000);
                      reload();
                    })
                  }
                >
                  Next event, 10 s before: {upcoming.label}
                </button>
              </div>
            )}

            <h3>Launch a room in rehearsal</h3>
            <p className="owner-note">
              Each room opens as Alise would find it: the rehearsal clock moves
              forward to when it opens and its prerequisites are created.
            </p>
            <div className="owner-actions">
              {LAUNCH_TARGETS.map((target) => (
                <button
                  key={target.id}
                  disabled={busy !== ''}
                  onClick={() =>
                    void act(target.id, () => launchRoom(target.id))
                  }
                >
                  {busy === target.id ? 'Preparing…' : target.label}
                  <small>{target.detail}</small>
                </button>
              ))}
            </div>

            <h3>Scenario</h3>
            <div className="owner-actions">
              {SCENARIOS.map((scenario) => (
                <button
                  key={scenario.id}
                  disabled={busy !== ''}
                  onClick={() =>
                    void act(scenario.id, () => applyScenario(scenario.id))
                  }
                >
                  {busy === scenario.id ? 'Preparing…' : scenario.label}
                  <small>{scenario.detail}</small>
                </button>
              ))}
            </div>

            <h3>Owner Control Centre</h3>
            <div className="owner-actions">
              <button onClick={() => window.location.assign(TEST_CENTRE_PATH)}>
                Concierge Owner · TEST (simulated office and timeline)
              </button>
              <button onClick={() => window.location.assign(LIVE_CENTRE_PATH)}>
                Concierge Owner · LIVE (real club, password)
              </button>
            </div>

            <h3>Reset</h3>
            <div className="owner-actions owner-actions--row">
              {RESETTABLE.map((room) => (
                <button
                  key={room.id}
                  disabled={busy !== ''}
                  onClick={() =>
                    void act(`reset-${room.id}`, async () => {
                      await resetRoom(room.id);
                      reload();
                    })
                  }
                >
                  Reset {room.label}
                </button>
              ))}
            </div>
            <div className="owner-actions">
              <button
                disabled={busy !== ''}
                onClick={() =>
                  void act('reset', async () => {
                    await resetEverything();
                    window.location.assign('/');
                  })
                }
              >
                {busy === 'reset' ? 'Resetting…' : 'Reset the entire rehearsal'}
              </button>
              <button onClick={() => window.location.assign('/?verify=replay')}>
                Replay first-visit verification
              </button>
            </div>

            <details className="owner-lines">
              <summary>Every line the Butler can say</summary>
              {(Object.keys(BUTLER_LINES) as ButlerMoment[]).map((moment) => (
                <section key={moment}>
                  <h4>{MOMENT_NAMES[moment]}</h4>
                  <ol>
                    {BUTLER_LINES[moment].map((line) => (
                      <li key={line}>{line}</li>
                    ))}
                  </ol>
                </section>
              ))}
            </details>
          </>
        )}
        {ownerActive && (
          <div className="owner-actions">
            <button
              disabled={busy !== ''}
              onClick={() =>
                void act('exit', async () => {
                  if (rehearsing) await resetEverything();
                  exitOwner();
                  window.location.replace('/');
                })
              }
            >
              Exit Dev Mode · return to the normal experience
            </button>
          </div>
        )}
        {!ownerActive && (
          <form
            onSubmit={(event) => {
              event.preventDefault();
              if (authenticateOwner(pin)) window.location.reload();
              else {
                setError('Access not granted. Please try again.');
                setPin('');
              }
            }}
          >
            <label htmlFor="owner-pin">Private access code</label>
            <input
              id="owner-pin"
              type="password"
              inputMode="numeric"
              pattern="[0-9]{4}"
              maxLength={4}
              autoComplete="off"
              value={pin}
              onChange={(e) =>
                setPin(e.target.value.replace(/\D/g, '').slice(0, 4))
              }
              required
            />
            <button type="submit">Unlock private office</button>
          </form>
        )}
        {error && <p role="alert">{error}</p>}
        <button className="owner-close" onClick={() => dialog.current?.close()}>
          Close
        </button>
      </dialog>
    </>
  );
}
