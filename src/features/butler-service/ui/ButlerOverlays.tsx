/**
 * The Butler's overlays: his menu, the translucent correspondence collection
 * (the doors or the lounge stay visible behind it), the request composer and
 * his invitation to the Departure Lounge. Rendered into a portal; the rest
 * of the page is inert while it is open, and focus returns on close.
 *
 * The letter itself is the existing LetterPresentation, with its wax seal
 * and envelope animation unchanged.
 */
import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router';
import type { MemberLetter } from '../../../shared/concierge/types';
import { useReducedMotion } from '../../../shared/ui/useReducedMotion';
import { WaxSeal } from '../../concierge/ui/Artwork';
import { failureText } from '../../correspondence/client/correspondenceApi';
import {
  ALREADY_THANKED,
  collectionLine,
  NEEDS_MEMBERSHIP,
} from '../../correspondence/domain/butlerLines';
import { letterDate } from '../../correspondence/domain/format';
import { LetterPresentation } from '../../correspondence/ui/LetterPresentation';
import type { ButlerDesk } from '../client/desk';
import { nextLine } from '../domain/dialogue';
import type {
  ServicePlace,
  ServiceStanding,
  ServiceView,
} from '../useButlerService';
import { RequestComposer } from './RequestComposer';
import '../../correspondence/ui/correspondence.css';
import './butlerService.css';

const CLOSE_MS = 380;

export interface ButlerOverlaysProps {
  place: ServicePlace;
  view: Exclude<ServiceView, { kind: 'none' }>;
  standing: ServiceStanding;
  letters: readonly MemberLetter[];
  desk: ButlerDesk;
  onView(view: ServiceView): void;
  onLetter(letter: MemberLetter): void;
  /** Closes the overlay; `after` is what the Butler says once it has gone. */
  onClose(after?: string): void;
}

/** Makes everything else on the page inert while the overlay is open. */
function usePortal(): HTMLElement | null {
  const [host, setHost] = useState<HTMLElement | null>(null);
  useEffect(() => {
    const node = document.createElement('div');
    node.className = 'bs-portal';
    document.body.append(node);
    const others = Array.from(document.body.children).filter(
      (el): el is HTMLElement =>
        el !== node && el instanceof HTMLElement && !el.inert,
    );
    for (const el of others) el.inert = true;
    const opener =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    // Mounting a portal target is this effect's purpose.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setHost(node);
    return () => {
      for (const el of others) el.inert = false;
      node.remove();
      opener?.focus({ preventScroll: true });
    };
  }, []);
  return host;
}

export default function ButlerOverlays(props: ButlerOverlaysProps) {
  const host = usePortal();
  const reducedMotion = useReducedMotion();
  const [closing, setClosing] = useState<string | null | undefined>(undefined);
  const { onClose } = props;

  // A graceful exit: fade, then hand back to the room.
  const close = useCallback((after?: string) => setClosing(after ?? null), []);
  useEffect(() => {
    if (closing === undefined) return;
    const timer = setTimeout(
      () => onClose(closing ?? undefined),
      reducedMotion ? 0 : CLOSE_MS,
    );
    return () => clearTimeout(timer);
  }, [closing, onClose, reducedMotion]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') close();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [close]);

  if (!host) return null;
  return createPortal(
    <div
      className="bs-overlay"
      data-view={props.view.kind}
      data-place={props.place}
      data-closing={closing !== undefined}
      data-motion={reducedMotion ? 'reduced' : 'full'}
    >
      <div
        className="bs-overlay__scrim"
        aria-hidden="true"
        onClick={() => close()}
      />
      {props.view.kind === 'menu' ? (
        <Menu {...props} close={close} />
      ) : props.view.kind === 'departure' ? (
        <Departure {...props} close={close} />
      ) : (
        <Panel {...props} close={close} />
      )}
    </div>,
    host,
  );
}

type Inner = ButlerOverlaysProps & { close(after?: string): void };

/** The bell's answer: two (at the locked doors, three) ways he can help. */
function Menu({ place, letters, onView, close }: Inner) {
  const [line] = useState(() => nextLine('ring'));
  const titleId = useId();
  const first = useRef<HTMLButtonElement>(null);
  useEffect(() => first.current?.focus({ preventScroll: true }), []);
  const unread = letters.filter((l) => !l.openedAt).length;
  return (
    <section
      className="bs-menu"
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
    >
      <p className="bs-eyebrow">The Butler</p>
      <h2 id={titleId} className="bs-menu__line">
        {line}
      </h2>
      <div className="bs-menu__options">
        <button
          ref={first}
          type="button"
          className="bs-option"
          onClick={() =>
            onView({ kind: 'collection', letterId: null, direct: false })
          }
        >
          <span className="bs-option__title">My Correspondence</span>
          <span className="bs-option__note">
            {unread > 0
              ? `${unread} unread ${unread === 1 ? 'letter' : 'letters'}`
              : 'Every letter you have received'}
          </span>
        </button>
        <button
          type="button"
          className="bs-option"
          onClick={() => onView({ kind: 'composer' })}
        >
          <span className="bs-option__title">A Word with the Butler</span>
          <span className="bs-option__note">A request, in confidence</span>
        </button>
        {place === 'entrance' && (
          <button
            type="button"
            className="bs-option bs-option--quiet"
            onClick={() => onView({ kind: 'departure' })}
          >
            <span className="bs-option__title">The Departure Lounge</span>
            <span className="bs-option__note">
              Open to you before the doors
            </span>
          </button>
        )}
      </div>
      <button type="button" className="bs-dismiss" onClick={() => close()}>
        Not just now
      </button>
    </section>
  );
}

/** "Shall I escort you?" — the doors stay locked; the lounge is its own room. */
function Departure({ close }: Inner) {
  const [line] = useState(() => nextLine('departure'));
  const navigate = useNavigate();
  const titleId = useId();
  const go = useRef<HTMLButtonElement>(null);
  useEffect(() => go.current?.focus({ preventScroll: true }), []);
  return (
    <section
      className="bs-menu"
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
    >
      <p className="bs-eyebrow">The Butler</p>
      <h2 id={titleId} className="bs-menu__line">
        {line}
      </h2>
      <div className="bs-menu__options">
        <button
          ref={go}
          type="button"
          className="cd-button"
          onClick={() => void navigate('/departure')}
        >
          Please escort me
        </button>
        <button
          type="button"
          className="cd-button cd-button--quiet"
          onClick={() => close()}
        >
          Perhaps later
        </button>
      </div>
    </section>
  );
}

/** The scrolling panel: the collection, one letter, or the composer. */
function Panel(props: Inner) {
  const { view, standing, close, place } = props;
  const titleId = useId();
  const panel = useRef<HTMLDivElement>(null);
  useEffect(() => {
    panel.current?.focus({ preventScroll: true });
    panel.current?.scrollTo?.({ top: 0 });
  }, [view]);

  let body: ReactNode;
  let title = 'Your Correspondence';
  if (standing.kind !== 'member') {
    body = <Standing standing={standing} />;
    if (view.kind === 'composer') title = 'A Word with the Butler';
  } else if (view.kind === 'composer') {
    title = 'A Word with the Butler';
    body = <Composer {...props} />;
  } else if (view.kind === 'collection' && view.letterId) {
    title = 'Your Letter';
    body = <OneLetter {...props} letterId={view.letterId} />;
  } else {
    body = <Collection {...props} />;
  }

  return (
    <div
      ref={panel}
      className="bs-panel"
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      tabIndex={-1}
    >
      <header className="bs-panel__head">
        <p className="bs-eyebrow">The Thirty Club</p>
        <h2 id={titleId} className="bs-panel__title">
          {title}
        </h2>
        <button
          type="button"
          className="bs-close"
          onClick={() => close()}
          aria-label={
            place === 'entrance'
              ? 'Close and return to the doors'
              : 'Close and return to the lounge'
          }
        >
          <span aria-hidden="true">×</span>
        </button>
      </header>
      {body}
      <button type="button" className="bs-return" onClick={() => close()}>
        {place === 'entrance' ? 'Return to the doors' : 'Return to the lounge'}
      </button>
    </div>
  );
}

function Standing({ standing }: { standing: ServiceStanding }) {
  if (standing.kind === 'loading')
    return (
      <p className="bs-status" role="status">
        The Butler is fetching your correspondence…
      </p>
    );
  if (standing.kind === 'owner')
    return (
      <p className="bs-status">
        This device is signed in to the Butler’s Office. Alise’s letters and
        requests are handled only on her own device; use Dev Mode to rehearse
        them here.
      </p>
    );
  if (standing.kind === 'unavailable')
    return (
      <p className="bs-status" role="alert">
        {failureText(standing.failure)}
      </p>
    );
  return (
    <div className="bs-status">
      <p className="bs-butler-line">{NEEDS_MEMBERSHIP}</p>
      <p>
        Arron’s private introduction link will present you; this device is then
        remembered for thirty days.
      </p>
    </div>
  );
}

function Collection({ letters, onView }: Inner) {
  const [line] = useState(() => nextLine('correspondence'));
  const unread = letters.filter((l) => !l.openedAt).length;
  return (
    <>
      <blockquote className="bs-butler-line">
        <p>{letters.length === 0 ? collectionLine(0, 0) : line}</p>
        <footer>— The Butler</footer>
      </blockquote>
      {letters.length > 0 && (
        <p className="bs-count" aria-live="polite">
          {collectionLine(unread, letters.length)}
        </p>
      )}
      <ul className="cd-list bs-list">
        {letters.map((letter) => {
          const isUnread = !letter.openedAt;
          return (
            <li key={letter.id}>
              <button
                type="button"
                className="cd-row bs-row"
                data-unread={isUnread}
                onClick={() =>
                  onView({
                    kind: 'collection',
                    letterId: letter.id,
                    direct: false,
                  })
                }
              >
                <span className="cd-row__seal" aria-hidden="true">
                  <WaxSeal lit={isUnread} />
                </span>
                <span className="cd-row__text">
                  <span className="cd-row__title">{letter.title}</span>
                  <span className="cd-row__meta">
                    {letterDate(letter.deliveredAt, letter.timezone)}
                  </span>
                </span>
                <span className="cd-row__state">
                  {isUnread
                    ? 'Unread'
                    : letter.thankedAt
                      ? 'Thanked'
                      : 'Opened'}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </>
  );
}

function OneLetter({
  letters,
  letterId,
  desk,
  onLetter,
  onView,
  close,
  view,
}: Inner & { letterId: string }) {
  const letter = letters.find((l) => l.id === letterId);
  if (!letter)
    return (
      <p className="bs-status">
        I can find no such letter, Madam. Perhaps it has not arrived just yet.
      </p>
    );
  const direct = view.kind === 'collection' && view.direct;
  return (
    <>
      <LetterPresentation
        key={letter.id}
        letter={letter}
        desk={desk}
        onOpen={() => {
          void desk.open(letter.id).then((r) => {
            if (r.ok) onLetter(r.data.letter);
          });
        }}
        onThanked={(updated, duplicate) => {
          onLetter(updated);
          // The letter closes; the Butler answers in the room itself.
          close(duplicate ? ALREADY_THANKED : nextLine('thanks'));
        }}
      />
      <button
        type="button"
        className="bs-back"
        onClick={() =>
          onView({ kind: 'collection', letterId: null, direct: false })
        }
      >
        {direct ? 'All of your correspondence' : 'Back to your correspondence'}
      </button>
    </>
  );
}

function Composer({ desk, close, onView }: Inner) {
  const [sent, setSent] = useState<{ words: string; line: string } | null>(
    null,
  );
  const done = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (sent) done.current?.focus({ preventScroll: true });
  }, [sent]);
  if (sent)
    return (
      <div className="bs-sent" role="status">
        <blockquote className="bs-butler-line">
          <p>{sent.line}</p>
          <footer>— The Butler</footer>
        </blockquote>
        <figure className="bs-sent__record">
          <figcaption>Recorded in the club’s book</figcaption>
          <p>{sent.words}</p>
        </figure>
        <p className="bs-sent__truth">
          {desk.mode === 'rehearsal'
            ? 'Dev Mode rehearsal: nothing was recorded for Alise, and no SMS was sent.'
            : 'Your request has been received. Arron will see it in the Butler’s Office and reply in his own time.'}
        </p>
        <div className="bs-menu__options">
          <button
            ref={done}
            type="button"
            className="cd-button"
            onClick={() => close()}
          >
            Thank you, Butler
          </button>
          <button
            type="button"
            className="cd-button cd-button--quiet"
            onClick={() =>
              onView({ kind: 'collection', letterId: null, direct: false })
            }
          >
            My correspondence
          </button>
        </div>
      </div>
    );
  return (
    <RequestComposer
      send={(body, key) => desk.request(body, key)}
      onSent={(words) => setSent({ words, line: nextLine('request-received') })}
      onCancel={() => close()}
      note={
        desk.mode === 'rehearsal'
          ? 'Dev Mode rehearsal · this request stays on this device and sends nothing.'
          : undefined
      }
    />
  );
}
