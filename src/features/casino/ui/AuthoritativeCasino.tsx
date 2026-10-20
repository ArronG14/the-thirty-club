import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router';
import { establishStanding, vaultRequest } from '../../vault/client/vaultApi';
import './authoritativeCasino.css';

interface Prize {
  title: string;
  description: string;
  presentation: string;
  kind: 'VOUCHER' | 'VAULT_GIFT';
  imageUrl?: string | null;
}
interface Spin {
  id: string;
  batchId: string;
  position: number;
  prize: Prize | null;
  entitlementId: string | null;
  idempotencyKey?: string;
  createdAt?: string;
}
interface Status {
  available: number;
  spins: Spin[];
}
const PENDING = 'thirty-club:casino:pending';

/** The animation follows a committed result; it never chooses a prize. */
export default function AuthoritativeCasino({
  onComplete,
}: {
  onComplete(): void;
}) {
  const [status, setStatus] = useState<Status | null>(null);
  const [result, setResult] = useState<Spin | null>(null);
  const [phase, setPhase] = useState<'ready' | 'spinning' | 'reveal'>('ready');
  const [error, setError] = useState('');
  const [standing, setStanding] = useState<'checking' | 'member' | 'other'>(
    'checking',
  );
  const busy = useRef(false);

  const refresh = useCallback(async () => {
    const response = await vaultRequest<Status>('/casino');
    if (!response.ok) {
      setError(
        response.kind === 'http'
          ? response.message
          : 'The tables are temporarily unavailable.',
      );
      return null;
    }
    setStatus(response.data);
    const pending = sessionStorage.getItem(PENDING);
    if (pending) {
      const recovered = response.data.spins.find(
        (spin) => spin.idempotencyKey === pending,
      );
      if (recovered) {
        sessionStorage.removeItem(PENDING);
        setResult(recovered);
        setPhase('reveal');
      }
    }
    return response.data;
  }, []);

  useEffect(() => {
    let active = true;
    establishStanding().then((found) => {
      if (!active) return;
      if (found.kind === 'member') {
        setStanding('member');
        void refresh();
      } else setStanding('other');
    });
    return () => {
      active = false;
    };
  }, [refresh]);

  const spin = async () => {
    if (busy.current || !status?.available) return;
    busy.current = true;
    setError('');
    setPhase('spinning');
    const key = sessionStorage.getItem(PENDING) ?? crypto.randomUUID();
    sessionStorage.setItem(PENDING, key);
    const response = await vaultRequest<Spin>('/casino/spins', {
      body: { idempotencyKey: key },
    });
    if (!response.ok) {
      setPhase('ready');
      setError(
        response.kind === 'http'
          ? response.message
          : 'The connection was interrupted. Check the table before trying again.',
      );
      await refresh();
      busy.current = false;
      return;
    }
    await new Promise((resolve) =>
      setTimeout(
        resolve,
        window.matchMedia('(prefers-reduced-motion: reduce)').matches
          ? 0
          : 1600,
      ),
    );
    setResult(response.data);
    setPhase('reveal');
    sessionStorage.removeItem(PENDING);
    const updated = await refresh();
    if (updated?.available === 0) onComplete();
    busy.current = false;
  };

  return (
    <main className="casino-live" aria-labelledby="casino-live-title">
      <div className="casino-live__glow" aria-hidden="true" />
      <header className="casino-live__header">
        <Link to="/lounge">‹ Members’ Lounge</Link>
        <span>The Thirty Club · Private gaming room</span>
      </header>
      <section className="casino-live__table">
        <p className="casino-live__eyebrow">An invitation to chance</p>
        <h1 id="casino-live-title">The Grand Casino</h1>
        <div
          className="casino-live__reels"
          data-spinning={phase === 'spinning'}
          aria-hidden="true"
        >
          <span>✦</span>
          <span>30</span>
          <span>✦</span>
        </div>
        {standing === 'checking' && (
          <p role="status">The croupier is preparing the table…</p>
        )}
        {standing === 'other' && (
          <p role="status">
            Please present your membership card before playing.
          </p>
        )}
        {standing === 'member' && (
          <>
            <p className="casino-live__count">
              {status?.available ?? '—'}{' '}
              {status?.available === 1 ? 'spin' : 'spins'} at your pleasure
            </p>
            <button
              className="casino-live__spin"
              type="button"
              disabled={!status?.available || phase === 'spinning'}
              onClick={() => void spin()}
            >
              {phase === 'spinning'
                ? 'The wheel is turning…'
                : status?.available
                  ? 'Spin the wheel'
                  : 'Awaiting your next invitation'}
            </button>
            {result && phase === 'reveal' && (
              <div className="casino-live__result" role="status">
                <p className="casino-live__eyebrow">
                  {result.prize
                    ? 'Fortune favours you'
                    : 'Another turn of fate'}
                </p>
                <h2>{result.prize?.title ?? 'The house keeps this one'}</h2>
                {result.prize?.imageUrl &&
                  (/^https:\/\//.test(result.prize.imageUrl) ||
                    result.prize.imageUrl.startsWith('/')) && (
                    <img
                      className="casino-live__prize-art"
                      src={result.prize.imageUrl}
                      alt=""
                    />
                  )}
                <p>
                  {result.prize?.presentation ||
                    result.prize?.description ||
                    (result.prize
                      ? 'A new privilege is yours.'
                      : 'A graceful spin. The croupier awaits your return.')}
                </p>
                {result.prize?.kind === 'VOUCHER' && (
                  <Link to="/lounge">
                    View your vouchers in the Members’ Lounge
                  </Link>
                )}
                {result.prize?.kind === 'VAULT_GIFT' && (
                  <Link to="/rooms/gift-vault">Visit the Gift Vault</Link>
                )}
              </div>
            )}
            {error && (
              <p className="casino-live__error" role="alert">
                {error}
              </p>
            )}
            <details className="casino-live__history">
              <summary>Your recent spins</summary>
              <ol>
                {status?.spins.map((entry) => (
                  <li key={entry.id}>
                    {entry.prize?.title ?? 'A quiet spin'}
                    {entry.createdAt
                      ? ` · ${new Date(entry.createdAt).toLocaleString('en-GB', { timeZone: 'America/Jamaica' })}`
                      : ''}
                  </li>
                ))}
              </ol>
            </details>
          </>
        )}
      </section>
    </main>
  );
}
