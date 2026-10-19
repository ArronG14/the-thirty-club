/**
 * The concierge's two appearances at the Grand Entrance:
 *
 * - `EntranceLetter`: before the birthday, a sealed letter on the step
 *   (Phase One), which later points to the Departure Lounge.
 * - `MembershipPrompt`: on the birthday, once midnight has passed, the
 *   butler asks for the membership card, gives the riddle and accepts the
 *   number printed on the card as recovery.
 */
import { useEffect, useId, useRef, useState, type FormEvent } from 'react';
import { Link } from 'react-router';
import { httpConciergeApi, type ConciergeApi } from '../client/api';
import { recordMembership, markMembershipOffline } from '../client/membership';
import { matchesOfflineMembership } from '../client/offlineMembership';
import { activeSession, saveSession } from '../client/sessionStore';
import {
  markStepLetterOpened,
  STEP_LETTERS_EVENT,
  stepLetters,
  type StepLetterId,
} from '../client/stepLetters';
import { ACTIVE_RIDDLES, DEPARTURE_LOUNGE_OPENS } from '../domain/catalogue';
import {
  describeCountdown,
  describeInstant,
  greetingIn,
  instantOf,
  UK_ZONE,
} from '../domain/time';
import { WaxSeal } from './Artwork';
import { LetterCountdown } from './LetterCountdown';
import { ConciergeLetter, PaperSheet } from './Paper';
import './departure.css';
import './entranceConcierge.css';
import { appClock } from '../../rehearsal/clock';

/**
 * The newest unread concierge letter on the step. Opening it (the existing
 * sheet) marks it read: it leaves the step and remains in My
 * Correspondence; a newer letter arriving later appears unread.
 */
export function EntranceLetter({ now }: { now: number }) {
  // The button that opened the letter; focus returns to it on close.
  const [opener, setOpener] = useState<HTMLElement | null>(null);
  const [showing, setShowing] = useState<StepLetterId | null>(null);
  const opensAt = instantOf(DEPARTURE_LOUNGE_OPENS);
  // The letter's own clock can reach the hour before the entrance's does.
  const [elapsed, setElapsed] = useState(false);
  const [, setVersion] = useState(0);
  useEffect(() => {
    const changed = () => setVersion((v) => v + 1);
    window.addEventListener(STEP_LETTERS_EVENT, changed);
    return () => window.removeEventListener(STEP_LETTERS_EVENT, changed);
  }, []);
  const ready = elapsed || now >= opensAt;
  const waiting = stepLetters(ready ? Math.max(now, opensAt) : now).find(
    (l) => !l.opened,
  );

  return (
    <>
      {waiting && !showing && (
        <button
          type="button"
          className="step-letter"
          data-ready={waiting.id === 'departure-ready'}
          onClick={(event) => {
            setOpener(event.currentTarget.parentElement);
            setShowing(waiting.id);
            markStepLetterOpened(waiting.id);
          }}
        >
          <span className="step-letter__envelope" aria-hidden="true">
            <span className="step-letter__flap" />
            <span className="step-letter__seal">
              <WaxSeal />
            </span>
          </span>
          <span className="step-letter__caption">
            {waiting.id === 'departure-ready'
              ? 'Your Departure Lounge is ready'
              : 'A letter has been left for you'}
          </span>
        </button>
      )}
      {showing && (
        <StepLetterSheet
          id={ready ? 'departure-ready' : showing}
          now={now}
          returnFocusTo={opener}
          onElapsed={() => setElapsed(true)}
          onClose={() => setShowing(null)}
        />
      )}
    </>
  );
}

/** One concierge letter on its laid paper (from the step or the collection). */
export function StepLetterSheet({
  id,
  now,
  returnFocusTo,
  onClose,
  onElapsed,
}: {
  id: StepLetterId;
  now: number;
  returnFocusTo: HTMLElement | null;
  onClose(): void;
  onElapsed?(): void;
}) {
  const titleId = useId();
  const opensAt = instantOf(DEPARTURE_LOUNGE_OPENS);
  const ready = id === 'departure-ready';
  return (
    <PaperSheet
      labelledBy={titleId}
      returnFocusTo={returnFocusTo}
      onClose={onClose}
      footer={
        ready ? (
          <Link to="/departure" className="brass-button step-letter__go">
            Proceed to the Departure Lounge
          </Link>
        ) : null
      }
    >
      <h2 id={titleId} className="sr-only">
        A letter from the concierge
      </h2>
      {ready ? (
        <ConciergeLetter
          greeting={`${greetingIn(Math.max(now, opensAt), UK_ZONE)}, Madam.`}
          paragraphs={[
            'Your Departure Lounge is now ready to receive you.',
            'Certain arrangements have been made for your journey. Your concierge awaits.',
          ]}
        />
      ) : (
        <ConciergeLetter
          greeting="Madam,"
          paragraphs={[
            'Your membership has been approved.',
            'While the doors of The Thirty Club remain closed until your birthday, certain privileges have been arranged for your journey.',
            'Your Departure Lounge will be ready to receive you on Thursday at two o’clock.',
          ]}
          signOff="We shall be in touch."
        >
          {now < opensAt && (
            <>
              <p className="letter__when">
                <span>{describeInstant(opensAt, UK_ZONE)}</span>
                <span>In {describeCountdown(now, opensAt)}</span>
              </p>
              <LetterCountdown
                target={opensAt}
                now={appClock.now}
                onElapsed={() => onElapsed?.()}
              />
            </>
          )}
        </ConciergeLetter>
      )}
    </PaperSheet>
  );
}

const POLL_MS = 15_000;

/**
 * Midnight has passed in Jamaica: the doors wait for the membership card.
 * Scanning the card opens `/c/<token>` and returns here with the ceremony.
 * The number on the card can be presented by hand. A paired display (an
 * iPad in the room) notices when the card is presented on another device.
 */
export function MembershipPrompt({
  onPresented,
  api = httpConciergeApi,
}: {
  onPresented(): void;
  api?: ConciergeApi;
}) {
  const [byHand, setByHand] = useState(false);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const fieldId = useId();
  const presented = useRef(onPresented);
  useEffect(() => {
    presented.current = onPresented;
  }, [onPresented]);

  // A paired display (or a device that holds a session) listens for the
  // card being presented elsewhere.
  useEffect(() => {
    const session = activeSession();
    if (!session) return;
    let stopped = false;
    const check = async () => {
      const result = await api.state(session.token);
      if (stopped || !result.ok) return;
      const at = result.data.activations.membership;
      if (at) {
        recordMembership(at);
        presented.current();
      }
    };
    void check();
    const timer = setInterval(() => {
      if (document.visibilityState !== 'hidden') void check();
    }, POLL_MS);
    return () => {
      stopped = true;
      clearInterval(timer);
    };
  }, [api]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busy || code.trim() === '') return;
    setBusy(true);
    setMessage(null);
    const result = await api.activate({ code }, activeSession()?.token);
    if (result.ok) {
      setBusy(false);
      if (result.data.credential === 'membership') {
        saveSession(result.data.session);
        presented.current();
      } else {
        saveSession(result.data.session);
        setMessage(
          'That is your travel credential, madam. The club requires your membership card.',
        );
      }
      return;
    }
    const unreachable = result.kind !== 'http' || result.status >= 500;
    if (unreachable && (await matchesOfflineMembership(code, 'code'))) {
      setBusy(false);
      markMembershipOffline();
      presented.current();
      return;
    }
    setBusy(false);
    setMessage(
      result.kind === 'http' && result.status === 404
        ? 'I do not recognise that number, madam. Might you try it once more?'
        : result.kind === 'http' && result.status === 429
          ? 'Rather a lot of attempts, madam. Do allow me a few minutes.'
          : 'I cannot reach the club’s office just now, madam. Do try again in a moment.',
    );
  }

  return (
    <div className="card-prompt">
      <blockquote className="card-prompt__riddle">
        {ACTIVE_RIDDLES.membership.map((line) => (
          <p key={line}>{line}</p>
        ))}
      </blockquote>
      {byHand ? (
        <form
          className="by-hand card-prompt__form"
          onSubmit={submit}
          noValidate
        >
          <label htmlFor={fieldId} className="by-hand__label">
            The number on your membership card
          </label>
          <input
            id={fieldId}
            className="by-hand__input"
            value={code}
            onChange={(event) => setCode(event.target.value)}
            autoComplete="off"
            autoCapitalize="characters"
            autoCorrect="off"
            spellCheck={false}
            enterKeyHint="go"
            maxLength={40}
          />
          <button type="submit" className="brass-button" disabled={busy}>
            {busy ? 'One moment…' : 'Present membership'}
          </button>
        </form>
      ) : (
        <button
          type="button"
          className="quiet-button"
          onClick={() => setByHand(true)}
        >
          Present the card by hand
        </button>
      )}
      <p className="card-prompt__message" role="status">
        {message}
      </p>
    </div>
  );
}
