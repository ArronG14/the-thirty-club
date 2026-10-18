import { useEffect, useRef, useState } from 'react';
import { ROOMS } from '../club/domain/rooms';
import { endRehearsal } from '../concierge/client/sessionStore';
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

export default function OwnerAccess() {
  const dialog = useRef<HTMLDialogElement>(null);
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');
  const opener = useRef<HTMLElement | null>(null);
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
          onClick={() => dialog.current?.showModal()}
        >
          Owner · test mode
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
          {ownerActive ? 'Owner access' : 'A private appointment'}
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
              {ROOMS.filter((r) => r.built && r.id !== 'entrance').map(
                (room) => (
                  <button key={room.id} onClick={() => go('open', room.path)}>
                    {room.name}
                  </button>
                ),
              )}
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
