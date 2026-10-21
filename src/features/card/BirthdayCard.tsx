import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router';
import { useReducedMotion } from '../../shared/ui/useReducedMotion';
import { establishStanding, vaultRequest } from '../vault/client/vaultApi';
import './birthdayCard.css';

type CardReply =
  | { state: 'sealed'; opensAt: string }
  | { state: 'preparing'; opensAt: string }
  | { state: 'open'; opensAt: string; message: string; signature: string };

type View =
  | { kind: 'checking' }
  | { kind: 'needs-membership' }
  | { kind: 'unavailable' }
  | { kind: 'card'; card: CardReply };

/** Her last opened card, so a dropped hotel connection never hides it. */
const KEPT = 'thirty-club:birthday-card';

function kept(): CardReply | null {
  try {
    const raw = window.localStorage.getItem(KEPT);
    return raw ? (JSON.parse(raw) as CardReply) : null;
  } catch {
    return null;
  }
}
function keep(card: CardReply) {
  try {
    window.localStorage.setItem(KEPT, JSON.stringify(card));
  } catch {
    // Storage unavailable: the card simply is not kept for offline.
  }
}

const day = (iso: string) =>
  new Intl.DateTimeFormat('en-GB', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    timeZone: 'America/Jamaica',
  }).format(new Date(iso));

type Stage = 'envelope' | 'flap' | 'rising' | 'closed-card' | 'unfolded';

/**
 * `/birthdaycard` (ADR-024): the private card, reached by its NFC tag or the
 * Butler's letter. The server decides when it opens and gives its words only
 * to her member session; the owner writes it in the Control Centre.
 */
export default function BirthdayCard() {
  const reducedMotion = useReducedMotion();
  const [view, setView] = useState<View>({ kind: 'checking' });
  const [stage, setStage] = useState<Stage>('envelope');
  const timers = useRef<number[]>([]);

  const load = useCallback(async () => {
    const standing = await establishStanding();
    if (standing.kind === 'needs-membership' || standing.kind === 'owner') {
      setView({ kind: 'needs-membership' });
      return;
    }
    if (standing.kind === 'unavailable') {
      const card = kept();
      setView(card ? { kind: 'card', card } : { kind: 'unavailable' });
      return;
    }
    const reply = await vaultRequest<CardReply>('/card');
    if (reply.ok) {
      if (reply.data.state === 'open') keep(reply.data);
      setView({ kind: 'card', card: reply.data });
    } else {
      const card = kept();
      setView(card ? { kind: 'card', card } : { kind: 'unavailable' });
    }
  }, []);

  useEffect(() => {
    const first = window.setTimeout(() => void load(), 0);
    const list = timers.current;
    return () => {
      window.clearTimeout(first);
      list.forEach((t) => window.clearTimeout(t));
    };
  }, [load]);

  const open = () => {
    if (stage !== 'envelope') return;
    if (reducedMotion) {
      setStage('unfolded');
      return;
    }
    const at = (ms: number, next: Stage) =>
      timers.current.push(window.setTimeout(() => setStage(next), ms));
    setStage('flap');
    at(900, 'rising');
    at(2100, 'closed-card');
    at(2900, 'unfolded');
  };

  if (view.kind === 'checking')
    return (
      <main className="bcard bcard--quiet">
        <p role="status">One moment…</p>
      </main>
    );
  if (view.kind === 'needs-membership')
    return (
      <main className="bcard bcard--quiet">
        <h1>A private card</h1>
        <p>
          This card is addressed to a member. Please present your membership
          card on this device first.
        </p>
        <Link to="/">The entrance</Link>
      </main>
    );
  if (view.kind === 'unavailable')
    return (
      <main className="bcard bcard--quiet">
        <h1>A private card</h1>
        <p>
          The club cannot be reached just now. Your card is quite safe; please
          try again in a moment.
        </p>
        <button type="button" onClick={() => void load()}>
          Try again
        </button>
      </main>
    );

  const { card } = view;
  const message = card.state === 'open' ? card.message : '';
  const signature = card.state === 'open' ? card.signature : '';
  return (
    <main
      className="bcard"
      data-stage={card.state === 'open' ? stage : 'envelope'}
      aria-labelledby="bcard-title"
    >
      <h1 id="bcard-title" className="sr-only">
        Your birthday card
      </h1>
      <div className="bcard__stage">
        <div className="bcard__envelope" aria-hidden="true">
          <div className="bcard__back" />
          <div className="bcard__card">
            <div className="bcard__inside">
              <p className="bcard__words">{message}</p>
              {signature && <p className="bcard__signature">{signature}</p>}
            </div>
            <div className="bcard__cover">
              <div className="bcard__cover-front">
                <span className="bcard__monogram">A</span>
                <span className="bcard__cover-line">Thirty</span>
                <span className="bcard__cover-date">24 · x · 2026</span>
              </div>
              <div className="bcard__cover-back" />
            </div>
          </div>
          <div className="bcard__pocket" />
          <div className="bcard__flap">
            <span className="bcard__seal">30</span>
          </div>
        </div>
      </div>

      <div className="bcard__caption">
        {card.state === 'sealed' && (
          <>
            <p className="bcard__eyebrow">To be opened on</p>
            <p className="bcard__when">{day(card.opensAt)}</p>
            <p>Not quite yet, Madam. It will keep.</p>
          </>
        )}
        {card.state === 'preparing' && (
          <p>The ink is still drying. Do come back in a little while.</p>
        )}
        {card.state === 'open' && stage === 'envelope' && (
          <button type="button" className="bcard__open" onClick={open}>
            Break the seal
          </button>
        )}
        {card.state === 'open' && stage === 'unfolded' && (
          <>
            {/* The words, for every reader (the 3D card is decorative). */}
            <section className="sr-only" aria-label="The card">
              <p>{message}</p>
              {signature && <p>{signature}</p>}
            </section>
            <button
              type="button"
              className="bcard__again"
              onClick={() => setStage('envelope')}
            >
              Fold it away
            </button>
            <Link className="bcard__home" to="/lounge">
              The Members’ Lounge
            </Link>
          </>
        )}
      </div>
    </main>
  );
}
