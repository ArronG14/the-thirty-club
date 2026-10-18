/**
 * Alise's correspondence collection (`/correspondence`) and a single letter
 * (`/correspondence/:id`). Outside RoomGate on purpose: letters arrive before
 * the birthday too, and nothing here opens or records any club room.
 */
import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import type { MemberLetter } from '../../../shared/concierge/types';
import { WaxSeal } from '../../concierge/ui/Artwork';
import {
  consumeInvitationFragment,
  failureText,
  listLetters,
  memberStanding,
  openLetter,
  type DeskFailure,
} from '../client/correspondenceApi';
import { collectionLine, NEEDS_MEMBERSHIP } from '../domain/butlerLines';
import { letterDate } from '../domain/format';
import { LetterPresentation } from './LetterPresentation';
import './correspondence.css';

type Load =
  | { kind: 'loading' }
  | { kind: 'needs-membership'; refused: boolean }
  | { kind: 'owner' }
  | { kind: 'trouble'; failure: DeskFailure }
  | { kind: 'ready'; letters: MemberLetter[] };

function useLetters() {
  const [load, setLoad] = useState<Load>({ kind: 'loading' });
  const refresh = useCallback(async () => {
    setLoad({ kind: 'loading' });
    const invitation = await consumeInvitationFragment();
    const standing = await memberStanding();
    if (standing.kind === 'owner') return setLoad({ kind: 'owner' });
    if (standing.kind === 'needs-membership')
      return setLoad({
        kind: 'needs-membership',
        refused: invitation === 'refused',
      });
    if (standing.kind === 'unavailable')
      return setLoad({ kind: 'trouble', failure: standing.failure });
    const result = await listLetters();
    if (result.ok) setLoad({ kind: 'ready', letters: result.data.letters });
    else setLoad({ kind: 'trouble', failure: result });
  }, []);
  useEffect(() => {
    // Loading from the network is the effect's purpose.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void refresh();
  }, [refresh]);
  const replace = useCallback((letter: MemberLetter) => {
    setLoad((current) =>
      current.kind === 'ready'
        ? {
            kind: 'ready',
            letters: current.letters.map((l) =>
              l.id === letter.id ? letter : l,
            ),
          }
        : current,
    );
  }, []);
  return { load, refresh, replace };
}

function Frame({ children }: { children: ReactNode }) {
  return (
    <main className="cd-room">
      <header className="cd-room__head">
        <Link to="/" className="cd-room__house">
          The Thirty Club
        </Link>
      </header>
      {children}
    </main>
  );
}

function Standing({
  load,
  refresh,
}: {
  load: Exclude<Load, { kind: 'ready' }>;
  refresh(): void;
}) {
  if (load.kind === 'loading')
    return (
      <p className="cd-room__status" role="status">
        The Butler is fetching your correspondence…
      </p>
    );
  if (load.kind === 'owner')
    return (
      <section className="cd-room__notice">
        <p>
          This device is signed in to the Butler’s Office. Alise’s letters are
          handed only to Alise; preview a letter from the Correspondence Desk
          instead.
        </p>
        <Link to="/owner" className="cd-button">
          The Correspondence Desk
        </Link>
      </section>
    );
  if (load.kind === 'trouble')
    return (
      <section className="cd-room__notice">
        <p role="alert">{failureText(load.failure)}</p>
        <button type="button" className="cd-button" onClick={refresh}>
          Try again
        </button>
      </section>
    );
  return (
    <section className="cd-room__notice cd-room__notice--membership">
      <p className="cd-room__line">{NEEDS_MEMBERSHIP}</p>
      <p className="cd-room__small" role="status">
        {load.refused
          ? 'That introduction has already been used or has expired. Arron can send a fresh one.'
          : 'Arron’s private introduction link will present you; this device is then remembered for thirty days.'}
      </p>
      <button type="button" className="cd-button" onClick={refresh}>
        Try again
      </button>
    </section>
  );
}

/** `/correspondence`: unread first, then everything already opened. */
export function CorrespondenceCollection() {
  const { load, refresh } = useLetters();
  if (load.kind !== 'ready')
    return (
      <Frame>
        <h1 className="cd-room__title">Your Correspondence</h1>
        <Standing load={load} refresh={() => void refresh()} />
      </Frame>
    );
  const unread = load.letters.filter((l) => !l.openedAt);
  const opened = load.letters.filter((l) => l.openedAt);
  return (
    <Frame>
      <h1 className="cd-room__title">Your Correspondence</h1>
      <p className="cd-room__line" aria-live="polite">
        {collectionLine(unread.length, load.letters.length)}
      </p>
      {unread.length > 0 && (
        <section aria-labelledby="cd-unread">
          <h2 id="cd-unread" className="cd-room__section">
            Awaiting your attention
          </h2>
          <ul className="cd-list">
            {unread.map((letter) => (
              <LetterRow key={letter.id} letter={letter} />
            ))}
          </ul>
        </section>
      )}
      {opened.length > 0 && (
        <section aria-labelledby="cd-opened">
          <h2 id="cd-opened" className="cd-room__section">
            Previously opened
          </h2>
          <ul className="cd-list">
            {opened.map((letter) => (
              <LetterRow key={letter.id} letter={letter} />
            ))}
          </ul>
        </section>
      )}
      <Link to="/" className="cd-room__back">
        Return to the club
      </Link>
    </Frame>
  );
}

function LetterRow({ letter }: { letter: MemberLetter }) {
  const unread = !letter.openedAt;
  return (
    <li>
      <Link
        to={`/correspondence/${letter.id}`}
        className="cd-row"
        data-unread={unread}
      >
        <span className="cd-row__seal" aria-hidden="true">
          <WaxSeal lit={unread} />
        </span>
        <span className="cd-row__text">
          <span className="cd-row__title">{letter.title}</span>
          <span className="cd-row__meta">
            {letterDate(letter.deliveredAt, letter.timezone)}
          </span>
        </span>
        <span className="cd-row__state">
          {unread ? 'Unread' : letter.thankedAt ? 'Thanked' : 'Opened'}
        </span>
      </Link>
    </li>
  );
}

/** `/correspondence/:id`: one letter, opened by hand. */
export function CorrespondenceLetter() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { load, refresh, replace } = useLetters();
  if (load.kind !== 'ready')
    return (
      <Frame>
        <Standing load={load} refresh={() => void refresh()} />
      </Frame>
    );
  const letter = load.letters.find((l) => l.id === id);
  if (!letter)
    return (
      <Frame>
        <section className="cd-room__notice">
          <p>
            I can find no such letter, Madam. Perhaps it has not arrived just
            yet.
          </p>
          <Link to="/correspondence" className="cd-button">
            Your correspondence
          </Link>
        </section>
      </Frame>
    );
  return (
    <Frame>
      <LetterPresentation
        key={letter.id}
        letter={letter}
        onOpen={() => {
          // The server records the opening; the letter is already in hand.
          void openLetter(letter.id).then((r) => {
            if (r.ok) replace(r.data.letter);
          });
        }}
        onThanked={replace}
      />
      <button
        type="button"
        className="cd-room__back"
        onClick={() => void navigate('/correspondence')}
      >
        Back to your correspondence
      </button>
    </Frame>
  );
}
