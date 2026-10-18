import { useId, useState, type FormEvent } from 'react';
import { ACTIVE_RIDDLES } from '../domain/catalogue';
import { UK_ZONE, greetingIn } from '../domain/time';
import type { PresentOutcome } from '../useConcierge';
import { ConciergeLetter } from './Paper';

const REFUSALS: Record<
  Exclude<PresentOutcome, { ok: true }>['reason'],
  string
> = {
  unrecognised:
    'The concierge does not recognise that credential, Madam. Do check it and try once more.',
  offline:
    'Your concierge needs a connection to examine credentials. Please try again once you are online.',
  limited:
    'Rather a lot of attempts, Madam. The concierge suggests a pause of a few minutes.',
  unavailable:
    'The concierge cannot be reached at present. Please try again shortly.',
};

/**
 * The Departure Lounge is open but this device has not presented the travel
 * credential: the concierge's letter, the riddle on a luggage tag, and a
 * discreet way to present the credential by hand.
 */
export function CredentialRequest({
  now,
  onPresent,
}: {
  now: number;
  onPresent(input: { code: string }): Promise<PresentOutcome>;
}) {
  const [byHand, setByHand] = useState(false);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const fieldId = useId();

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busy || code.trim() === '') return;
    setBusy(true);
    setMessage(null);
    const outcome = await onPresent({ code });
    setBusy(false);
    if (!outcome.ok) {
      setMessage(REFUSALS[outcome.reason]);
    } else if (outcome.credential === 'membership') {
      setMessage(
        'That is your membership card, Madam. Rather premature, but quite safe: the club will ask for it on your birthday. Your travel credential is still to be found.',
      );
      setCode('');
    }
  }

  return (
    <div className="credential">
      <ConciergeLetter
        greeting={`${greetingIn(now, UK_ZONE)}, Madam.`}
        paragraphs={[
          'Your Departure Lounge is now ready.',
          'Unfortunately, your travel credentials appear to have been misplaced. We believe they may be rather closer than you think.',
        ]}
        signOff="Your concierge awaits."
      />

      <figure className="tag" aria-labelledby={`${fieldId}-clue`}>
        <span className="tag__string" aria-hidden="true" />
        <div className="tag__card">
          <span className="tag__eyelet" aria-hidden="true" />
          <p id={`${fieldId}-clue`} className="tag__label">
            A word from the concierge
          </p>
          <blockquote className="tag__riddle">
            {ACTIVE_RIDDLES.departure.map((line) => (
              <p key={line}>{line}</p>
            ))}
          </blockquote>
        </div>
      </figure>

      <p className="credential__how">
        When you find it, hold the top of your iPhone close to it.
      </p>

      {byHand ? (
        <form className="by-hand" onSubmit={submit} noValidate>
          <label htmlFor={fieldId} className="by-hand__label">
            The code printed on your credential
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
            required
          />
          <button type="submit" className="brass-button" disabled={busy}>
            {busy ? 'Examining…' : 'Present credential'}
          </button>
        </form>
      ) : (
        <button
          type="button"
          className="quiet-button"
          onClick={() => setByHand(true)}
        >
          Present it by hand
        </button>
      )}
      <p className="credential__message" role="status">
        {message}
      </p>
    </div>
  );
}
