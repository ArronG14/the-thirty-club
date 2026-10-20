import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { httpConciergeApi, type ConciergeApi } from '../client/api';
import { activeSession, saveSession } from '../client/sessionStore';
import { matchesOfflineMembership } from '../client/offlineMembership';
import { markMembershipOffline } from '../client/membership';
import { destinationFor, isPlausibleToken } from '../domain/credentials';
import { heldKey } from '../../vault/client/pendingKey';
import { presentCardToClub } from '../../journey/client/membershipCard';

/** The doors never wait longer than this for the club to record the card. */
const CARD_RECORD_WAIT_MS = 4000;
import { WaxSeal } from './Artwork';
import './departure.css';

type Status =
  | { kind: 'examining' }
  | { kind: 'unrecognised' }
  | { kind: 'offline' }
  | { kind: 'unavailable' };

/** Router state the entrance reads to play the membership ceremony. */
export interface PresentedState {
  presented: 'membership';
}

/**
 * `/c/:token`, where every NFC tag points. The concierge examines the
 * credential with the service, keeps the session on this device, replaces
 * the address (so the token does not linger in history) and sends Alise on.
 */
export default function CredentialArrival({
  api = httpConciergeApi,
}: {
  api?: ConciergeApi;
}) {
  const { token = '' } = useParams();
  const navigate = useNavigate();
  const [status, setStatus] = useState<Status>({ kind: 'examining' });
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    if (!isPlausibleToken(token)) {
      // A credential that cannot be genuine: say so, without a request.
      queueMicrotask(() => setStatus({ kind: 'unrecognised' }));
      return;
    }
    void (async () => {
      const result = await api.activate({ token }, activeSession()?.token);
      if (result.ok) {
        saveSession(result.data.session);
        const credential = result.data.credential;
        // The club records the card and gives this device a member session
        // before the doors (ADR-023), so her membership is the server's on
        // every tab and device. Bounded: a slow network never stalls the
        // ceremony; the journey provider retries before recording her.
        if (credential === 'membership')
          await Promise.race([
            presentCardToClub(),
            new Promise((done) => setTimeout(done, CARD_RECORD_WAIT_MS)),
          ]);
        // A vault key found before the card was presented: resume at the vault.
        if (heldKey()) {
          navigate('/vault', { replace: true });
          return;
        }
        if (credential === 'membership') {
          navigate('/', {
            replace: true,
            state: { presented: 'membership' } satisfies PresentedState,
          });
        } else {
          navigate(destinationFor(credential), { replace: true });
        }
        return;
      }
      const unreachable = result.kind !== 'http' || result.status >= 500;
      // The birthday must not depend on hotel Wi-Fi (docs/CONCIERGE.md).
      if (unreachable && (await matchesOfflineMembership(token, 'token'))) {
        markMembershipOffline();
        navigate('/', {
          replace: true,
          state: { presented: 'membership' } satisfies PresentedState,
        });
        return;
      }
      if (result.kind === 'http' && result.status === 404) {
        setStatus({ kind: 'unrecognised' });
      } else if (result.kind === 'http') {
        setStatus({ kind: 'unavailable' });
      } else {
        setStatus({ kind: 'offline' });
      }
    })();
  }, [api, navigate, token]);

  const copy: Record<Status['kind'], { title: string; body: string }> = {
    examining: {
      title: 'One moment, Madam',
      body: 'The concierge is examining your credential.',
    },
    unrecognised: {
      title: 'Not quite, Madam',
      body: 'The concierge does not recognise this credential. If it is genuine, it may be presented by hand from the club’s door.',
    },
    offline: {
      title: 'No connection',
      body: 'The concierge needs a connection to examine your credential. Please try again once you are online.',
    },
    unavailable: {
      title: 'The concierge is indisposed',
      body: 'The service cannot be reached just now. Please try again in a moment.',
    },
  };
  const { title, body } = copy[status.kind];

  return (
    <div className="departure arrival" data-phase="arrival">
      <div
        className="arrival__seal"
        data-examining={status.kind === 'examining'}
      >
        <WaxSeal />
      </div>
      <h1 className="arrival__title">{title}</h1>
      <p className="arrival__body" role="status">
        {body}
      </p>
      {status.kind !== 'examining' && (
        <div className="arrival__actions">
          {(status.kind === 'offline' || status.kind === 'unavailable') && (
            <button
              type="button"
              className="brass-button"
              onClick={() => window.location.reload()}
            >
              Try again
            </button>
          )}
          <Link to="/" className="quiet-button arrival__link">
            To the club’s door
          </Link>
          <Link to="/departure" className="quiet-button arrival__link">
            To the Departure Lounge
          </Link>
        </div>
      )}
    </div>
  );
}
