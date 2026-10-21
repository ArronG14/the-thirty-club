import { useCallback, useEffect, useId, useRef, useState } from 'react';
import {
  DRINK_COPY,
  MAX_BEVERAGE_LENGTH,
  type DrinkKind,
} from '../../shared/drinks/templates';
import { establishStanding } from '../vault/client/vaultApi';
import {
  claimDrinks,
  loadDrinks,
  requestDrink,
  type DrinkBalance,
  type DrinksStatus,
  type UnclaimedDrinks,
} from './drinksApi';
import './drinks.css';
import { deviceStorage } from '../rehearsal/storage';

const DRAFT = (kind: DrinkKind) => `thirty-club:drinks:draft:${kind}`;
const KEY = (kind: DrinkKind) => `thirty-club:drinks:key:${kind}`;

function storage(): Storage | null {
  try {
    return deviceStorage();
  } catch {
    return null;
  }
}

/** Engraved tokens: ● available, ○ enjoyed. */
function Tokens({ balance, label }: { balance: DrinkBalance; label: string }) {
  return (
    <p
      className="drinks__tokens"
      aria-label={`${balance.available} of ${balance.granted} ${label} remaining`}
    >
      {Array.from({ length: balance.granted }, (_, i) => (
        <span
          key={i}
          aria-hidden="true"
          data-used={i >= balance.available ? 'true' : 'false'}
        />
      ))}
    </p>
  );
}

function Claim({
  prize,
  onClaimed,
}: {
  prize: UnclaimedDrinks;
  onClaimed(): void;
}) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  return (
    <article className="drinks__claim">
      <p className="drinks__eyebrow">Won at the Grand Casino</p>
      <h3>{prize.title}</h3>
      {prize.presentation && <p>{prize.presentation}</p>}
      <button
        type="button"
        className="drinks__button"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          setMessage('');
          const result = await claimDrinks(prize.id);
          setBusy(false);
          if (result.ok) onClaimed();
          else setMessage(result.message);
        }}
      >
        {busy ? 'One moment…' : `Claim your ${prize.quantity} drinks`}
      </button>
      {message && <p role="alert">{message}</p>}
    </article>
  );
}

function Composer({
  kind,
  balance,
  onSent,
}: {
  kind: DrinkKind;
  balance: DrinkBalance;
  onSent(): void;
}) {
  const copy = DRINK_COPY[kind];
  const id = useId();
  const [text, setText] = useState(() => storage()?.getItem(DRAFT(kind)) ?? '');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{
    tone: 'ok' | 'error';
    text: string;
  } | null>(null);
  const sending = useRef(false);

  const submit = async () => {
    const beverage = text.trim();
    if (!beverage || sending.current) return;
    sending.current = true;
    setBusy(true);
    setMessage(null);
    // The same key until the server answers, so a retry after a dropped
    // connection is the same request (one voucher, one SMS).
    const store = storage();
    const key = store?.getItem(KEY(kind)) ?? crypto.randomUUID();
    store?.setItem(KEY(kind), key);
    const result = await requestDrink(kind, beverage, key);
    sending.current = false;
    setBusy(false);
    if (result.ok) {
      store?.removeItem(KEY(kind));
      store?.removeItem(DRAFT(kind));
      setText('');
      setMessage({
        tone: 'ok',
        text:
          result.data.request.notice === 'sent'
            ? 'Your drink request has been sent to your husband.'
            : result.data.request.notice === 'delayed'
              ? 'Your request is recorded. The notification is delayed; please let your husband know.'
              : 'Your request is recorded. The notification to your husband is waiting to be sent.',
      });
      onSent();
    } else {
      // A definite refusal frees the key; an interrupted call keeps it.
      if (result.status >= 400 && result.status < 500)
        store?.removeItem(KEY(kind));
      setMessage({ tone: 'error', text: result.message });
    }
  };

  if (balance.available < 1)
    return (
      <>
        <p className="drinks__none">{copy.none}</p>
        {message && (
          <p className="drinks__message" data-tone={message.tone} role="status">
            {message.text}
          </p>
        )}
      </>
    );
  return (
    <form
      className="drinks__form"
      onSubmit={(event) => {
        event.preventDefault();
        void submit();
      }}
    >
      <label htmlFor={id}>{copy.prompt}</label>
      <textarea
        id={id}
        rows={2}
        maxLength={MAX_BEVERAGE_LENGTH}
        value={text}
        placeholder={copy.placeholder}
        onChange={(event) => {
          setText(event.target.value);
          storage()?.setItem(DRAFT(kind), event.target.value);
        }}
      />
      <button
        type="submit"
        className="drinks__button"
        disabled={busy || !text.trim()}
      >
        {busy ? 'Sending word…' : copy.submit}
      </button>
      {message && (
        <p
          className="drinks__message"
          data-tone={message.tone}
          role={message.tone === 'error' ? 'alert' : 'status'}
        >
          {message.text}
        </p>
      )}
    </form>
  );
}

const NOTICE: Record<string, string> = {
  pending: 'Word is on its way',
  sent: 'Word has been sent',
  delayed: 'Delayed — the Butler will follow up',
};

/**
 * The drinks privileges (ADR-024): two separate balances, each request one
 * voucher and one SMS to the owner. Nothing to fulfil, nothing to locate:
 * the owner is with her. Shown in the Lounge, at `/drinks`, and after the
 * Casino's prize.
 */
export function DrinksPrivilege({
  onStatus,
}: {
  onStatus?(status: DrinksStatus): void;
}) {
  const [status, setStatus] = useState<DrinksStatus | null>(null);
  const [notice, setNotice] = useState('');
  const [standing, setStanding] = useState<
    'checking' | 'member' | 'other' | 'unavailable'
  >('checking');

  const load = useCallback(async () => {
    const result = await loadDrinks();
    if (result.ok) {
      setStatus(result.data);
      setNotice('');
      onStatus?.(result.data);
    } else setNotice(result.message);
  }, [onStatus]);

  useEffect(() => {
    let active = true;
    void establishStanding().then((found) => {
      if (!active) return;
      setStanding(
        found.kind === 'member' || found.kind === 'unavailable'
          ? found.kind
          : 'other',
      );
      if (found.kind === 'member') void load();
    });
    const again = () => {
      if (document.visibilityState === 'visible') void load();
    };
    document.addEventListener('visibilitychange', again);
    return () => {
      active = false;
      document.removeEventListener('visibilitychange', again);
    };
  }, [load]);

  if (standing === 'checking')
    return (
      <p className="drinks__status" role="status">
        One moment…
      </p>
    );
  if (standing === 'unavailable')
    return (
      <p className="drinks__status" role="status">
        The club cannot be reached just now. Your drinks are safe; please try
        again in a moment.
      </p>
    );
  if (standing === 'other')
    return (
      <p className="drinks__status" role="status">
        Please present your membership card to see your privileges.
      </p>
    );

  const kinds = (['jamaica', 'airport'] as const).filter(
    (kind) => status && status[kind].granted > 0,
  );
  return (
    <div className="drinks">
      {notice && (
        <p className="drinks__status" role="status">
          {notice}
        </p>
      )}
      {status?.unclaimed.map((prize) => (
        <Claim key={prize.id} prize={prize} onClaimed={() => void load()} />
      ))}
      {status && kinds.length === 0 && status.unclaimed.length === 0 && (
        <p className="drinks__status">
          No drinks have been placed at your disposal yet.
        </p>
      )}
      {status &&
        kinds.map((kind) => (
          <section
            key={kind}
            className="drinks__privilege"
            data-kind={kind}
            aria-labelledby={`drinks-${kind}`}
          >
            <p className="drinks__eyebrow">{DRINK_COPY[kind].eyebrow}</p>
            <h3 id={`drinks-${kind}`}>{DRINK_COPY[kind].title}</h3>
            <Tokens balance={status[kind]} label="drinks" />
            <p className="drinks__intro">{DRINK_COPY[kind].intro}</p>
            <Composer
              kind={kind}
              balance={status[kind]}
              onSent={() => void load()}
            />
            {status.requests.some((r) => r.kind === kind) && (
              <ol className="drinks__history" aria-label="Your requests">
                {status.requests
                  .filter((r) => r.kind === kind)
                  .map((r) => (
                    <li key={r.id}>
                      <span>{r.beverage}</span>
                      <small>
                        {new Date(r.createdAt).toLocaleTimeString('en-GB', {
                          hour: '2-digit',
                          minute: '2-digit',
                        })}{' '}
                        · {NOTICE[r.notice]}
                      </small>
                    </li>
                  ))}
              </ol>
            )}
          </section>
        ))}
    </div>
  );
}
