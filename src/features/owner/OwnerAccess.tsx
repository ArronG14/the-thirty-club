import { useEffect, useRef, useState } from 'react';
import { ROOMS } from '../club/domain/rooms';
import { endRehearsal } from '../concierge/client/sessionStore';
import {
  clearRehearsal,
  rehearsalCounts,
  rehearseLetters,
} from '../butler-service/client/desk';
import {
  BUTLER_LINES,
  type ButlerMoment,
} from '../butler-service/domain/dialogue';
import {
  authenticateOwner,
  clearOwnerProgress,
  exitOwner,
  ownerActive,
  ownerMode,
  setOwnerMode,
  type OwnerMode,
} from './session';
import './owner.css';

const MOMENT_NAMES: Record<ButlerMoment, string> = {
  'unread-greeting': 'Greeting, when a letter is waiting',
  ring: 'Answering the bell',
  correspondence: 'Introducing her correspondence',
  'request-received': 'Acknowledging a request',
  thanks: 'Thanking her',
  departure: 'Inviting her to the Departure Lounge',
};

export default function OwnerAccess() {
  const dialog = useRef<HTMLDialogElement>(null);
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');
  const opener = useRef<HTMLElement | null>(null);
  const [counts, setCounts] = useState(() =>
    ownerActive ? rehearsalCounts() : null,
  );
  const rehearse = (change: () => void) => {
    change();
    setCounts(rehearsalCounts());
  };
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
  function go(mode: OwnerMode, path = '/') {
    try {
      setOwnerMode(mode);
      window.location.assign(path);
    } catch {
      setError(
        'Session storage is unavailable. Please allow website storage and try again.',
      );
    }
  }
  return (
    <>
      {ownerActive && (
        <button
          className="owner-toggle"
          aria-label="Open Dev Mode"
          onClick={() => {
            setCounts(rehearsalCounts());
            dialog.current?.showModal();
          }}
        >
          Dev
        </button>
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
        {ownerActive ? (
          <>
            <p>
              Isolated rehearsal ·{' '}
              {ownerMode === 'locked'
                ? 'Pre-birthday'
                : ownerMode === 'birthday'
                  ? 'Birthday preview'
                  : 'Club open'}
            </p>
            <div className="owner-actions">
              <button onClick={() => go('open')}>Enter Club</button>
              <button onClick={() => go('birthday')}>
                Preview birthday unlock
              </button>
              <button onClick={() => go('locked')}>
                Return to locked entrance
              </button>
            </div>
            <h3>Visit a room</h3>
            <div className="owner-actions">
              {ROOMS.filter(
                (r) =>
                  r.built && r.id !== 'entrance' && r.id !== 'departure-lounge',
              ).map((room) => (
                <button key={room.id} onClick={() => go('open', room.path)}>
                  {room.name}
                </button>
              ))}
              <button
                onClick={() => go('open', '/concierge/owner?start=departure')}
              >
                The Departure Lounge
              </button>
            </div>
            <div className="owner-actions">
              <button onClick={() => go('open', '/concierge/owner')}>
                Concierge Owner Console
              </button>
            </div>
            <h3>The Butler’s service</h3>
            <p>
              Rehearse letters, the service bell and requests exactly as Alise
              sees them. Everything stays in this tab: no SMS is sent and no
              real correspondence is read or changed.
            </p>
            <p role="status">
              {counts
                ? `${counts.unread} unread of ${counts.letters} simulated letters · ${counts.requests} simulated requests`
                : ''}
            </p>
            <div className="owner-actions">
              <button onClick={() => rehearse(() => rehearseLetters(1))}>
                Simulate one unread letter
              </button>
              <button onClick={() => rehearse(() => rehearseLetters(3))}>
                Simulate three unread letters
              </button>
              <button onClick={() => rehearse(clearRehearsal)}>
                Clear simulated correspondence
              </button>
              <button onClick={() => go('locked')}>
                See the letter at the locked doors
              </button>
              <button onClick={() => window.location.assign('/correspondence')}>
                Open the correspondence page
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
            <p>
              Casino test controls are available inside the Grand Casino. Test
              rewards never affect Alise’s collection.
            </p>
            <div className="owner-actions">
              <button
                onClick={() => {
                  try {
                    clearOwnerProgress();
                    endRehearsal();
                    go('locked');
                  } catch {
                    setError('Unable to reset session storage.');
                  }
                }}
              >
                Reset test progress
              </button>
              <button onClick={() => window.location.assign('/?verify=replay')}>
                Replay first-visit verification
              </button>
              <button
                onClick={() => {
                  try {
                    exitOwner();
                    endRehearsal();
                    window.location.replace('/');
                  } catch {
                    setError(
                      'Unable to clear session. Close this tab to leave owner mode.',
                    );
                  }
                }}
              >
                Exit owner mode
              </button>
            </div>
          </>
        ) : (
          <form
            onSubmit={(event) => {
              event.preventDefault();
              if (authenticateOwner(pin)) window.location.replace('/');
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
