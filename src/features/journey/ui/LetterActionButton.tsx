import { useState } from 'react';
import { Link, useNavigate } from 'react-router';
import type { LetterAction } from '../../../shared/journey/contract';
import { enterLabel } from '../../../shared/journey/templates';
import { findRoom } from '../../club/domain/rooms';
import { useJourney } from '../journeyContext';
import './admission.css';

/** Where a room is entered from a letter. */
const roomPath = (room: LetterAction['roomId']) =>
  room === 'lounge' ? '/lounge' : (findRoom(room)?.path ?? '/');

/**
 * The button at the foot of a birthday-journey letter (ADR-020).
 *
 * - The Lounge's own admission is accepted here, then she is shown in.
 * - Any other admission leads to the Lounge, where its Letter of Admission
 *   is presented; once accepted, the same letter leads straight in.
 * - A return leads straight to the (admitted) room.
 * A withdrawn or not-yet-admitted room is never offered or named.
 */
export function LetterActionButton({
  action,
  preview = false,
}: {
  action: LetterAction;
  preview?: boolean;
}) {
  const journey = useJourney();
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const state = journey?.stateOf(action.roomId) ?? 'locked';

  if (preview)
    return (
      <div className="journey-action">
        <span className="journey-action__button" aria-disabled="true">
          {action.label}
        </span>
        <p className="journey-action__note">Preview: the button is inert.</p>
      </div>
    );

  if (action.kind === 'admission' && action.roomId === 'lounge') {
    if (state === 'locked') return null;
    const enter = async () => {
      if (state === 'admitted') {
        navigate('/lounge');
        return;
      }
      setBusy(true);
      setError(null);
      const outcome = await journey!.accept('lounge');
      if (outcome.ok) navigate('/lounge');
      else {
        setBusy(false);
        setError(outcome.message);
      }
    };
    return (
      <div className="journey-action">
        <button
          type="button"
          className="journey-action__button"
          onClick={() => void enter()}
          disabled={busy}
          aria-busy={busy}
        >
          {busy ? 'One moment…' : action.label}
        </button>
        {error && (
          <p className="journey-action__note" role="alert">
            {error}
          </p>
        )}
      </div>
    );
  }

  if (state === 'admitted')
    return (
      <div className="journey-action">
        <Link className="journey-action__button" to={roomPath(action.roomId)}>
          {action.kind === 'return' ? action.label : enterLabel(action.roomId)}
        </Link>
      </div>
    );
  if (action.kind === 'admission' && state === 'invited')
    return (
      <div className="journey-action">
        <Link
          className="journey-action__button"
          to={`/lounge?admission=${action.roomId}`}
        >
          {action.label}
        </Link>
      </div>
    );
  return null;
}
