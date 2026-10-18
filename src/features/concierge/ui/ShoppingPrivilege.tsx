/**
 * The Shopping Privilege: the Butler opens the Concierge Desk and offers to
 * arrange a sum. Reached by `/?concierge=shopping`. The website never knows
 * any ceiling; the service decides and the Butler relays its answer. The
 * request counts only when the service says it was accepted.
 */
import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type FormEvent,
} from 'react';
import { createPortal } from 'react-dom';
import { newIdempotencyKey } from '../client/api';
import { clearSession, activeSession } from '../client/sessionStore';
import {
  httpShoppingApi,
  type ShoppingApi,
  type ShoppingState,
} from '../client/shoppingApi';
import { hasScope } from '../domain/session';
import { WaxSeal } from './Artwork';
import { MembershipPrompt } from './EntranceConcierge';
import './departure.css';
import './shoppingPrivilege.css';

type Phase = 'verify' | 'loading' | 'ready' | 'sending' | 'done' | 'trouble';

const OPENING = [
  'Ah, Madam. I see you’ve discovered your latest privilege.',
  'The Club has made certain arrangements for your shopping today.',
  'May I enquire what sum you would like me to arrange?',
];
const CLOSING = [
  'An excellent choice, Madam.',
  'Your request has been received, and I shall personally attend to the necessary arrangements.',
  'Please, do continue enjoying your shopping. You needn’t concern yourself with the administrative details.',
];

function eligibleToken(): string | null {
  const session = activeSession();
  if (!session) return null;
  return hasScope(session.claims, 'membership') ||
    hasScope(session.claims, 'departure')
    ? session.token
    : null;
}

function pounds(pence: number): string {
  return `£${(pence / 100).toFixed(2)}`;
}

function Lines({ lines }: { lines: readonly string[] }) {
  return (
    <div className="shop__lines" aria-live="polite">
      {lines.map((line, index) => (
        <p
          key={line}
          className="shop__line"
          style={{ animationDelay: `${index * 1.1 + 0.3}s` }}
        >
          {line}
        </p>
      ))}
    </div>
  );
}

export function ShoppingPrivilege({
  onClose,
  api = httpShoppingApi,
}: {
  onClose(): void;
  api?: ShoppingApi;
}) {
  const [phase, setPhase] = useState<Phase>(() =>
    eligibleToken() ? 'loading' : 'verify',
  );
  const [settled, setSettled] = useState<ShoppingState | null>(null);
  const [amount, setAmount] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const key = useRef(newIdempotencyKey());
  const fieldId = useId();
  const titleId = useId();

  // The rest of the club is set aside while the Butler speaks.
  useEffect(() => {
    const app = document.getElementById('root');
    app?.setAttribute('inert', '');
    return () => app?.removeAttribute('inert');
  }, []);

  const load = useCallback(async () => {
    const token = eligibleToken();
    if (!token) {
      setPhase('verify');
      return;
    }
    setPhase('loading');
    const result = await api.state(token);
    if (result.ok) {
      setSettled(result.data);
      setPhase(result.data.status === 'available' ? 'ready' : 'done');
      return;
    }
    if (
      result.kind === 'http' &&
      (result.status === 401 || result.status === 403)
    ) {
      clearSession(activeSession()?.claims.realm ?? 'live');
      setPhase('verify');
      return;
    }
    setMessage(
      'I cannot reach the club’s office just now, Madam. Do try again in a moment.',
    );
    setPhase('trouble');
  }, [api]);

  useEffect(() => {
    // Opening the desk is the point of this effect.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (phase === 'loading') void load();
  }, [phase, load]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    const token = eligibleToken();
    if (phase === 'sending' || amount.trim() === '') return;
    if (!token) {
      setPhase('verify');
      return;
    }
    setPhase('sending');
    setMessage(null);
    const result = await api.request(
      { amount: amount.trim(), idempotencyKey: key.current },
      token,
    );
    if (result.ok) {
      setSettled(result.data);
      setPhase('done');
      return;
    }
    if (result.kind === 'http' && result.status === 409) {
      await load();
      return;
    }
    if (
      result.kind === 'http' &&
      (result.status === 401 || result.status === 403)
    ) {
      setPhase('verify');
      return;
    }
    setMessage(
      result.kind === 'http' && result.body?.message
        ? result.body.message
        : 'I cannot reach the club’s office just now, Madam. Do try again in a moment.',
    );
    setPhase('ready');
  }

  const awaiting = settled?.status === 'awaiting-settlement' ? settled : null;

  return createPortal(
    <div
      className="shop"
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
    >
      <div className="shop__frame">
        <div className="shop__seal" aria-hidden="true">
          <WaxSeal />
        </div>
        <p className="shop__eyebrow">The Concierge Desk</p>
        <h2 id={titleId} className="shop__title">
          Your Shopping Privilege
        </h2>

        {phase === 'verify' && (
          <>
            <Lines lines={['Before we begin, Madam, a small formality.']} />
            <MembershipPrompt
              onPresented={() => {
                if (eligibleToken()) setPhase('loading');
                else {
                  setMessage(
                    'I could not confirm your membership with the club’s office, Madam. Do try again when you are online.',
                  );
                }
              }}
            />
            {message && (
              <p className="shop__note" role="status">
                {message}
              </p>
            )}
          </>
        )}

        {phase === 'loading' && (
          <p className="shop__note" role="status">
            One moment, Madam…
          </p>
        )}

        {phase === 'trouble' && (
          <>
            <p className="shop__note" role="status">
              {message}
            </p>
            <button
              type="button"
              className="brass-button"
              onClick={() => setPhase('loading')}
            >
              Try again
            </button>
          </>
        )}

        {(phase === 'ready' || phase === 'sending') && (
          <>
            <Lines lines={OPENING} />
            <form className="shop__form" onSubmit={submit} noValidate>
              <label htmlFor={fieldId} className="shop__label">
                The sum you would like
              </label>
              <div className="shop__field">
                <span aria-hidden="true">£</span>
                <input
                  id={fieldId}
                  value={amount}
                  onChange={(event) => setAmount(event.target.value)}
                  inputMode="decimal"
                  autoComplete="off"
                  autoCorrect="off"
                  spellCheck={false}
                  enterKeyHint="send"
                  placeholder="0.00"
                  aria-describedby={message ? `${fieldId}-note` : undefined}
                />
              </div>
              <button
                type="submit"
                className="brass-button"
                disabled={phase === 'sending' || amount.trim() === ''}
              >
                {phase === 'sending' ? 'One moment, Madam…' : 'Make my request'}
              </button>
              {message && (
                <p id={`${fieldId}-note`} className="shop__note" role="status">
                  {message}
                </p>
              )}
            </form>
          </>
        )}

        {phase === 'done' && (
          <>
            <Lines lines={CLOSING} />
            <div className="shop__status" role="status">
              <span className="shop__badge">Awaiting settlement</span>
              {awaiting && (
                <span className="shop__amount">
                  {pounds(awaiting.amountPence)} requested
                </span>
              )}
            </div>
            <button type="button" className="quiet-button" onClick={onClose}>
              Return to the Club
            </button>
          </>
        )}

        {phase !== 'done' && phase !== 'sending' && (
          <button type="button" className="quiet-button" onClick={onClose}>
            Not just now
          </button>
        )}
      </div>
    </div>,
    document.body,
  );
}

export default ShoppingPrivilege;
