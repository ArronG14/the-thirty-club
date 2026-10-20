import { useCallback, useEffect, useState } from 'react';
import { establishStanding, vaultRequest } from '../../vault/client/vaultApi';

interface Entitlement {
  id: string;
  kind: 'VOUCHER' | 'VAULT_GIFT';
  state: 'AVAILABLE' | 'REQUESTED' | 'FULFILLED' | 'UNLOCKED' | 'REVEALED';
  prize: {
    title: string;
    description: string;
    instructions: string;
    validUntil: string | null;
  };
}
interface Wallet {
  entitlements: Entitlement[];
}

/** Reusable Lounge/Butler surface over the same persistent voucher lifecycle. */
export function VoucherWallet() {
  const [items, setItems] = useState<Entitlement[]>([]);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const load = useCallback(async () => {
    const result = await vaultRequest<Wallet>('/vouchers');
    if (result.ok)
      setItems(result.data.entitlements.filter((e) => e.kind === 'VOUCHER'));
    else
      setMessage(
        result.kind === 'http'
          ? result.message
          : 'Your privileges cannot be reached just now.',
      );
  }, []);
  useEffect(() => {
    let active = true;
    establishStanding().then((standing) => {
      if (!active) return;
      if (standing.kind === 'member') void load();
      else
        setMessage('Please present your membership card to see your vouchers.');
    });
    return () => {
      active = false;
    };
  }, [load]);
  async function request(id: string) {
    if (busy) return;
    setBusy(id);
    setMessage('');
    const response = await vaultRequest('/vouchers/request', { body: { id } });
    if (response.ok) {
      await load();
      setMessage(
        'The Butler has received your request. It is awaiting arrangement.',
      );
    } else
      setMessage(
        response.kind === 'http'
          ? response.message
          : 'The request could not be sent.',
      );
    setBusy(null);
  }
  return (
    <div className="voucher-wallet">
      <p>
        Privileges won at the Casino are kept here. Ask the Butler when you
        would like to enjoy one.
      </p>
      {message && <p role="status">{message}</p>}
      {items.length === 0 && (
        <p>There are no Casino vouchers in your collection yet.</p>
      )}
      <ul>
        {items.map((item) => (
          <li key={item.id}>
            <h3>{item.prize.title}</h3>
            <p>{item.prize.description}</p>
            {item.prize.instructions && <p>{item.prize.instructions}</p>}
            {item.prize.validUntil && (
              <p>
                Valid until{' '}
                {new Date(item.prize.validUntil).toLocaleDateString('en-GB', {
                  timeZone: 'America/Jamaica',
                })}
              </p>
            )}
            <p>
              {item.state === 'AVAILABLE'
                ? 'Available'
                : item.state === 'REQUESTED'
                  ? 'Requested · awaiting arrangement'
                  : 'Fulfilled'}
            </p>
            {item.state === 'AVAILABLE' && (
              <button
                type="button"
                disabled={busy !== null}
                onClick={() => void request(item.id)}
              >
                Ask the Butler to redeem this
              </button>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
