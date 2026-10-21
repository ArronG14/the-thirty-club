import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { officeRequest } from '../butlers-office/client';
import { instantToWall, wallTimeToInstant } from '../../shared/concierge/time';
import './drinksDesk.css';

interface OwnerCard {
  message: string;
  signature: string;
  opensAt: string;
  firstOpenedAt: string | null;
  updatedAt: string;
}
const ZONE = 'America/Jamaica';
export const CARD_URL = 'https://30.ag14.co/birthdaycard';

/**
 * The private birthday card (ADR-024): the owner writes it; she reads it at
 * /birthdaycard (its NFC tag) with her membership session, from its time.
 */
export default function CardDesk() {
  const [card, setCard] = useState<OwnerCard | null>(null);
  const [message, setMessage] = useState('');
  const [signature, setSignature] = useState('');
  const [opensAt, setOpensAt] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);

  const fill = (data: OwnerCard) => {
    setCard(data);
    setMessage(data.message);
    setSignature(data.signature);
    setOpensAt(instantToWall(data.opensAt, ZONE));
  };
  const load = useCallback(async () => {
    fill(await officeRequest<OwnerCard>('/owner/card'));
  }, []);
  useEffect(() => {
    const timer = window.setTimeout(() => {
      void load().catch((e: unknown) =>
        setNote(e instanceof Error ? e.message : 'The office is unavailable.'),
      );
    }, 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  function save(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setNote('');
    let instant: string;
    try {
      instant = wallTimeToInstant(opensAt, ZONE);
    } catch (e) {
      setNote(e instanceof Error ? e.message : 'Choose a date and time.');
      setBusy(false);
      return;
    }
    officeRequest<OwnerCard>('/owner/card', {
      message,
      signature,
      opensAt: instant,
    })
      .then((data) => {
        fill(data);
        setNote('Saved. She reads the latest words whenever she opens it.');
      })
      .catch((e: unknown) =>
        setNote(
          e instanceof Error ? e.message : 'The card could not be saved.',
        ),
      )
      .finally(() => setBusy(false));
  }

  return (
    <div className="dd">
      <header className="dd__head">
        <h2>Birthday card</h2>
        <p>
          Your private card, at <code>{CARD_URL}</code>. Write that address on
          its NFC tag (NFC Tools → Write → URL). Only her membership session can
          read it, and only from the time below.
        </p>
      </header>
      {note && (
        <p className="dd__message" role="status">
          {note}
        </p>
      )}
      <form className="dd__card dd__form" onSubmit={save}>
        <label>
          Your message (line breaks are kept){' '}
          <textarea
            rows={10}
            maxLength={6000}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            style={{ minHeight: '12rem', font: 'inherit', padding: '0.6rem' }}
          />
        </label>
        <label>
          Signed{' '}
          <input
            value={signature}
            maxLength={200}
            onChange={(e) => setSignature(e.target.value)}
          />
        </label>
        <label>
          May be opened from (Jamaica){' '}
          <input
            type="datetime-local"
            required
            value={opensAt}
            onChange={(e) => setOpensAt(e.target.value)}
          />
        </label>
        <button disabled={busy || !card}>Save the card</button>
      </form>
      {card && (
        <p className="dd__note">
          {card.firstOpenedAt
            ? `She first opened it ${new Intl.DateTimeFormat('en-GB', {
                weekday: 'short',
                hour: '2-digit',
                minute: '2-digit',
                timeZone: ZONE,
              }).format(new Date(card.firstOpenedAt))} Jamaica.`
            : message.trim()
              ? 'Not opened yet.'
              : 'No message yet: she would see “the ink is still drying”.'}
        </p>
      )}
    </div>
  );
}
