/**
 * The communication hold (ADR-021), at the top of every Control Centre
 * section. While held, nothing new reaches Alise: no letter is published to
 * her and no SMS to her is approved or sent. The server enforces it; this
 * panel shows it and is the only place it is released.
 */
import { useCallback, useEffect, useId, useState } from 'react';
import {
  JOURNEY_TIME_ZONE,
  type HoldState,
} from '../../shared/journey/contract';
import {
  deskRequest,
  failureText,
} from '../correspondence/client/correspondenceApi';
import { ownerCommunications } from '../journey/client/journeyApi';

const when = (at: string, zone: string) =>
  new Intl.DateTimeFormat('en-GB', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: zone,
  }).format(new Date(at));
const both = (at: string) =>
  `${when(at, JOURNEY_TIME_ZONE)} Jamaica · ${when(at, 'Europe/London')} UK`;

export default function CommunicationHold() {
  const [hold, setHold] = useState<HoldState | null>(null);
  const [hidden, setHidden] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [typed, setTyped] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const field = useId();

  const apply = useCallback(
    (result: Awaited<ReturnType<typeof ownerCommunications>>) => {
      if (result.ok) {
        setHold(result.data);
        setHidden(false);
      } else if (
        result.kind === 'http' &&
        (result.status === 401 || result.status === 403)
      )
        setHidden(true);
      else setError(failureText(result));
    },
    [],
  );
  const load = useCallback(
    async () => apply(await ownerCommunications()),
    [apply],
  );

  useEffect(() => {
    let active = true;
    const refresh = () =>
      void ownerCommunications().then((result) => {
        if (active) apply(result);
      });
    refresh();
    const timer = setInterval(refresh, 30_000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [apply]);

  if (hidden)
    return (
      <p className="cc-hold cc-hold--unknown" role="note">
        Sign in to the Butler’s Office to see the communication hold.
      </p>
    );
  if (!hold)
    return error ? (
      <p className="cc-hold cc-hold--unknown" role="alert">
        {error}
      </p>
    ) : null;

  async function release() {
    setBusy(true);
    setError('');
    const result = await deskRequest<
      HoldState & { released?: Record<string, number> }
    >('/owner/communications/release', {
      body: { confirm: typed, ...(note.trim() ? { note: note.trim() } : {}) },
    });
    setBusy(false);
    if (!result.ok) {
      setError(
        result.kind === 'http' && result.code === 'not-open'
          ? `Not yet: communications may be released from ${both(hold!.releaseNotBefore)}.`
          : failureText(result),
      );
      return;
    }
    const r = result.data.released;
    setMessage(
      r
        ? `Released. ${r.lettersReturnedToDraft} due letter(s) returned to draft, ${r.milestonesHeld} due milestone(s) held, ${r.eventsToRetry} event(s) to retry. Nothing was sent by the release itself.`
        : 'Communications were already released.',
    );
    setConfirming(false);
    setTyped('');
    setNote('');
    await load();
  }

  async function holdAgain() {
    if (
      !window.confirm(
        'Hold all communications to Alise again? Unsent SMS to her are cancelled (you can resend them later).',
      )
    )
      return;
    setBusy(true);
    const result = await deskRequest<HoldState>('/owner/communications/hold', {
      body: {},
    });
    setBusy(false);
    if (!result.ok) setError(failureText(result));
    else setMessage('Communications to Alise are on hold.');
    await load();
  }

  const early = Date.parse(hold.now) < Date.parse(hold.releaseNotBefore);
  return (
    <section
      className="cc-hold"
      data-active={hold.active ? 'true' : 'false'}
      aria-labelledby="cc-hold-title"
    >
      <h2 id="cc-hold-title">
        {hold.active
          ? 'Communications to Alise: ON HOLD'
          : 'Communications to Alise: released'}
      </h2>
      {hold.active ? (
        <>
          <p>
            Since {both(hold.heldSince)}. No letter is published to Alise and no
            SMS to her is approved or sent, by any route or schedule. Her
            existing letters and rooms are unchanged.
          </p>
          <p>
            Earliest release: <strong>{both(hold.releaseNotBefore)}</strong>.
            Waiting: {hold.waiting.milestonesDue} due milestone(s),{' '}
            {hold.waiting.lettersDue} due letter(s),{' '}
            {hold.waiting.eventsWaiting} event(s);{' '}
            {hold.waiting.smsCancelledByHold} SMS cancelled by the hold.
            Releasing sends nothing by itself: due items come back to you to
            confirm one by one.
          </p>
          {!confirming ? (
            <button
              type="button"
              disabled={busy || early}
              onClick={() => setConfirming(true)}
            >
              {early
                ? 'Release is possible from 21 October (Jamaica)'
                : 'Release communications…'}
            </button>
          ) : (
            <div className="cc-hold__confirm">
              <label htmlFor={field}>
                Type RELEASE to allow the club to contact Alise again
              </label>
              <input
                id={field}
                value={typed}
                autoComplete="off"
                autoCapitalize="characters"
                onChange={(e) => setTyped(e.target.value)}
              />
              <label>
                Note (optional)
                <input
                  value={note}
                  maxLength={300}
                  onChange={(e) => setNote(e.target.value)}
                />
              </label>
              <div className="cc-hold__actions">
                <button
                  type="button"
                  disabled={busy || typed !== 'RELEASE'}
                  onClick={() => void release()}
                >
                  Release communications
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => {
                    setConfirming(false);
                    setTyped('');
                  }}
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </>
      ) : (
        <>
          <p>
            Released {hold.releasedAt ? both(hold.releasedAt) : ''}
            {hold.releaseNote ? ` — “${hold.releaseNote}”` : ''}. Milestones,
            letters and SMS (while the SMS switch is on) are delivered normally.
          </p>
          <button
            type="button"
            disabled={busy}
            onClick={() => void holdAgain()}
          >
            Hold all communications again
          </button>
        </>
      )}
      {message && (
        <p role="status" className="cc-hold__message">
          {message}
        </p>
      )}
      {error && (
        <p role="alert" className="cc-hold__error">
          {error}
        </p>
      )}
    </section>
  );
}
