import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { officeRequest } from '../butlers-office/client';
import type { DrinkKind } from '../../shared/drinks/templates';
import './drinksDesk.css';

interface Balance {
  granted: number;
  used: number;
  available: number;
}
interface OwnerDrinks {
  airport: Balance;
  jamaica: Balance;
  requests: {
    id: string;
    kind: DrinkKind;
    beverage: string;
    createdAt: string;
    message: {
      state: string;
      status: string;
      lastError: string | null;
      attempts: number;
    } | null;
  }[];
  grants: {
    id: string;
    kind: DrinkKind;
    quantity: number;
    source: string;
    note: string;
    createdAt: string;
  }[];
  unclaimed: { id: string; title: string; kind: DrinkKind; quantity: number }[];
}

const NAMES: Record<DrinkKind, string> = {
  airport: 'Airport drinks (you pay)',
  jamaica: 'Bring Me a Drink (resort delivery)',
};
const SMS: Record<string, string> = {
  queued: 'Queued — sends within a minute',
  sending: 'Sending',
  sent: 'Sent to your phone',
  delivered: 'Delivered to your phone',
  paused: 'Waiting — SMS operations are not LIVE',
  failed: 'FAILED — check SMS operations',
  uncertain: 'UNCERTAIN — check Twilio before resending',
  cancelled: 'Cancelled',
};
const when = (iso: string) =>
  new Intl.DateTimeFormat('en-GB', {
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'America/Jamaica',
  }).format(new Date(iso));

/**
 * The drinks privileges for the owner (ADR-024): both balances, every
 * request with its SMS state, and adding or restoring a voucher. There is
 * deliberately no fulfilment step: the SMS is the whole job.
 */
export default function DrinksDesk() {
  const [data, setData] = useState<OwnerDrinks | null>(null);
  const [kind, setKind] = useState<DrinkKind>('jamaica');
  const [quantity, setQuantity] = useState(1);
  const [note, setNote] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setData(await officeRequest<OwnerDrinks>('/owner/drinks'));
  }, []);
  useEffect(() => {
    const timer = window.setTimeout(() => {
      void load().catch((e: unknown) =>
        setMessage(
          e instanceof Error ? e.message : 'The office is unavailable.',
        ),
      );
    }, 0);
    const again = window.setInterval(() => void load().catch(() => {}), 30_000);
    return () => {
      window.clearTimeout(timer);
      window.clearInterval(again);
    };
  }, [load]);

  function grant(event: FormEvent) {
    event.preventDefault();
    const fingerprint = JSON.stringify({ kind, quantity, note });
    const stored = sessionStorage.getItem('thirty-club:owner:pending-drinks');
    const parsed = stored
      ? (JSON.parse(stored) as { fingerprint: string; key: string })
      : null;
    const key =
      parsed?.fingerprint === fingerprint
        ? parsed.key
        : crypto.randomUUID().replace(/-/g, '');
    sessionStorage.setItem(
      'thirty-club:owner:pending-drinks',
      JSON.stringify({ fingerprint, key }),
    );
    setBusy(true);
    setMessage('');
    officeRequest('/owner/drinks/grants', {
      kind,
      quantity,
      note,
      idempotencyKey: key,
    })
      .then(async () => {
        sessionStorage.removeItem('thirty-club:owner:pending-drinks');
        setNote('');
        setMessage(
          `${quantity} ${kind === 'airport' ? 'airport' : 'Bring Me a Drink'} ${quantity === 1 ? 'voucher' : 'vouchers'} added.`,
        );
        await load();
      })
      .catch((e: unknown) =>
        setMessage(
          e instanceof Error ? e.message : 'The vouchers could not be added.',
        ),
      )
      .finally(() => setBusy(false));
  }

  return (
    <div className="dd">
      <header className="dd__head">
        <h2>Drinks</h2>
        <p>
          Every request texts you her drink at once (LIVE). Nothing to mark as
          done. Add or restore a voucher below if ever needed.
        </p>
      </header>
      {message && (
        <p className="dd__message" role="status">
          {message}
        </p>
      )}
      {data && (
        <div className="dd__balances">
          {(['airport', 'jamaica'] as const).map((k) => (
            <section key={k} className="dd__card">
              <h3>{NAMES[k]}</h3>
              <p className="dd__count">
                {data[k].available} <span>of {data[k].granted} left</span>
              </p>
              <p>{data[k].used} requested</p>
            </section>
          ))}
        </div>
      )}
      {data && data.unclaimed.length > 0 && (
        <p className="dd__note">
          Won but not yet claimed by her:{' '}
          {data.unclaimed
            .map((u) => `${u.title} (${u.quantity} ${u.kind})`)
            .join(', ')}
          . She claims it in the Casino or under Drinks.
        </p>
      )}
      <form className="dd__card dd__form" onSubmit={grant}>
        <h3>Add or restore vouchers</h3>
        <label>
          Kind{' '}
          <select
            value={kind}
            onChange={(e) => setKind(e.target.value as DrinkKind)}
          >
            <option value="jamaica">Bring Me a Drink (Jamaica)</option>
            <option value="airport">Airport drinks</option>
          </select>
        </label>
        <label>
          How many{' '}
          <input
            type="number"
            min={1}
            max={10}
            value={quantity}
            onChange={(e) => setQuantity(Number(e.target.value) || 1)}
          />
        </label>
        <label>
          Note (for you){' '}
          <input
            value={note}
            maxLength={300}
            placeholder="e.g. the bar was closed"
            onChange={(e) => setNote(e.target.value)}
          />
        </label>
        <button disabled={busy}>Add</button>
      </form>
      <section className="dd__card">
        <h3>Her requests</h3>
        {data && data.requests.length === 0 && <p>None yet.</p>}
        <ol className="dd__requests">
          {data?.requests.map((r) => (
            <li key={r.id} data-status={r.message?.status ?? 'unknown'}>
              <strong>{r.beverage}</strong>
              <span>
                {when(r.createdAt)} Jamaica ·{' '}
                {r.kind === 'airport' ? 'Airport' : 'Bring Me a Drink'}
              </span>
              <span>
                SMS:{' '}
                {r.message
                  ? (SMS[r.message.status] ?? r.message.status)
                  : 'not recorded'}
                {r.message?.lastError ? ` — ${r.message.lastError}` : ''}
              </span>
            </li>
          ))}
        </ol>
      </section>
      {data && data.grants.length > 0 && (
        <details className="dd__card">
          <summary>History of vouchers granted</summary>
          <ul>
            {data.grants.map((g) => (
              <li key={g.id}>
                {when(g.createdAt)} · {g.quantity} {g.kind} · {g.source}
                {g.note ? ` · ${g.note}` : ''}
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}
