import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { deskRequest } from '../../correspondence/client/correspondenceApi';
import { RequestComposer } from '../../butler-service/ui/RequestComposer';

/** A first visit is complete only after her real introductory request is recorded. */
export function DepartureWelcome({
  introduced,
  body,
}: {
  introduced: boolean;
  body: string;
}) {
  const [done, setDone] = useState(introduced);
  const [writing, setWriting] = useState(!introduced);
  return (
    <section
      className="paper letter"
      aria-label="Your Departure Lounge welcome"
    >
      <h2>Your Departure Lounge Awaits</h2>
      {!done &&
        body.split(/\n\n+/).map((p, i) => (
          <p
            className="letter__body"
            key={i}
            style={{ whiteSpace: 'pre-line' }}
          >
            {p}
          </p>
        ))}
      {!done && (
        <p>
          For your first visit, introduce yourself through A Word with the
          Butler. A greeting is quite sufficient.
        </p>
      )}
      {writing && (
        <RequestComposer
          send={(body, idempotencyKey) =>
            deskRequest('/service/requests', {
              body: { body, idempotencyKey, purpose: 'departure-introduction' },
            })
          }
          onSent={() => {
            setDone(true);
            setWriting(false);
          }}
          onCancel={() => setWriting(false)}
          cancelLabel="Read the welcome again"
        />
      )}
      {done && (
        <p role="status">
          Your introduction is recorded. No further action is needed; enjoy your
          holiday. A Word with the Butler remains available whenever you need
          assistance.
        </p>
      )}
      {!writing && (
        <button className="brass-button" onClick={() => setWriting(true)}>
          A Word with the Butler
        </button>
      )}
      {done && (
        <p>
          <Link to="/lounge">Return to the Members’ Lounge</Link>
        </p>
      )}
    </section>
  );
}

/** A server-fired invitation is the admission; the old travel credential retains its own flow. */
// eslint-disable-next-line react-refresh/only-export-components
export function useDepartureWelcome() {
  const [state, setState] = useState<{
    available: boolean;
    introduced: boolean;
    body: string;
  } | null>(null);
  useEffect(() => {
    let active = true;
    void deskRequest<{
      departure?: { available: boolean; introduced: boolean; body: string };
    }>('/journey').then((result) => {
      if (active && result.ok && result.data.departure)
        setState(result.data.departure);
    });
    return () => {
      active = false;
    };
  }, []);
  return state;
}
