import { useId, useState, type FormEvent } from 'react';
import { choiceLabel } from '../domain/catalogue';
import type { DeliveryStatus } from '../domain/contract';
import { NOTE_MAX } from '../domain/contract';
import type { PrivilegeView } from '../domain/lounge';
import { stampDate } from '../domain/time';
import type { Connection, RedeemOutcome } from '../useConcierge';
import { Emblem, InkStamp } from './Artwork';

/** What Alise is told about Arron, in the club's voice and strictly true. */
const DELIVERY: Record<DeliveryStatus, string> = {
  delivered: 'Arron has been informed.',
  pending: 'Your request is recorded. Word is on its way to Arron.',
  unconfigured: 'Your request is recorded. Word is on its way to Arron.',
  failed:
    'Your request is recorded, though the concierge has not yet reached Arron. Do mention it to him.',
};

/**
 * The card inside the envelope. A request privilege offers its choices, an
 * optional note and one redeem control; nothing is shown as granted until
 * the service has recorded it. Correspondence is simply read.
 */
export function PrivilegeCard({
  view,
  titleId,
  connection,
  reducedMotion,
  onRedeem,
}: {
  view: PrivilegeView;
  titleId: string;
  connection: Connection;
  reducedMotion: boolean;
  onRedeem(details: { choice?: string; note?: string }): Promise<RedeemOutcome>;
}) {
  const { privilege, status, redemption } = view;
  const [choice, setChoice] = useState<string | undefined>(undefined);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [granted, setGranted] = useState(false);
  const noteId = useId();
  const groupId = useId();

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busy || privilege.kind !== 'request') return;
    if (privilege.choices && !choice) {
      setProblem('Please make your selection first, Madam.');
      return;
    }
    setBusy(true);
    setProblem(null);
    const outcome = await onRedeem({
      ...(choice ? { choice } : {}),
      ...(note.trim() ? { note: note.trim() } : {}),
    });
    setBusy(false);
    if (outcome.kind === 'redeemed') setGranted(true);
    if (outcome.kind === 'refused') setProblem(outcome.message);
  }

  const heading = (
    <header className="card__head">
      <Emblem />
      <p className="card__eyebrow">{privilege.eyebrow}</p>
      <h2 id={titleId} className="card__title">
        {privilege.title}
      </h2>
      <p className="card__subtitle">{privilege.subtitle}</p>
    </header>
  );

  const letter = (
    <div className="card__letter">
      {privilege.letter.map((line, i) => (
        <p key={line} className={i === 0 ? 'card__salutation' : undefined}>
          {line}
        </p>
      ))}
      {privilege.kind === 'correspondence' && (
        <>
          <p className="card__signoff">{privilege.signOff}</p>
          <p className="card__signature">The Concierge</p>
        </>
      )}
    </div>
  );

  if (privilege.kind === 'correspondence') {
    return (
      <article className="card paper" data-kind="correspondence">
        {heading}
        {letter}
      </article>
    );
  }

  if (status === 'redeemed' && redemption) {
    const chosen = choiceLabel(privilege, redemption.choice);
    const selection = [chosen, redemption.note].filter(Boolean).join(' — ');
    return (
      <article
        className="card paper"
        data-kind="request"
        data-status="redeemed"
      >
        {heading}
        {letter}
        <div
          className="card__stamp"
          data-animate={granted && !reducedMotion}
          aria-hidden="true"
        >
          <InkStamp
            word={privilege.stamp}
            date={`${stampDate(Date.parse(redemption.redeemedAt), privilege.displayZone)} MMXXVI`}
          />
        </div>
        <div className="card__outcome" role="status">
          <p className="card__granted">
            {granted
              ? 'Your privilege has been granted.'
              : 'Privilege redeemed.'}
          </p>
          {selection && (
            <p className="card__selection">
              <span>Your selection</span>
              {selection}
            </p>
          )}
          <p className="card__delivery" data-delivery={redemption.delivery}>
            {DELIVERY[redemption.delivery]}
          </p>
        </div>
      </article>
    );
  }

  if (status === 'pending') {
    return (
      <article className="card paper" data-kind="request" data-status="pending">
        {heading}
        {letter}
        <div className="card__outcome" role="status">
          <p className="card__granted">Your request is safely kept.</p>
          <p className="card__delivery">
            It will reach Arron the moment you are back online. In the meantime,
            this card serves as your voucher.
          </p>
        </div>
      </article>
    );
  }

  const offline = connection === 'offline';
  return (
    <article className="card paper" data-kind="request">
      {heading}
      {letter}
      <form className="card__form" onSubmit={submit} noValidate>
        {privilege.choices && (
          <fieldset className="choices" aria-describedby={groupId}>
            <legend id={groupId} className="card__label">
              {privilege.choicePrompt}
            </legend>
            {privilege.choices.map((option) => (
              <label key={option.id} className="choice">
                <input
                  type="radio"
                  name={`${privilege.id}-choice`}
                  value={option.id}
                  checked={choice === option.id}
                  onChange={() => setChoice(option.id)}
                />
                <span>{option.label}</span>
              </label>
            ))}
          </fieldset>
        )}
        {privilege.note && (
          <div className="card__field">
            <label htmlFor={noteId} className="card__label">
              {privilege.note.label}
            </label>
            <input
              id={noteId}
              className="card__input"
              value={note}
              placeholder={privilege.note.placeholder}
              maxLength={NOTE_MAX}
              autoComplete="off"
              enterKeyHint="send"
              onChange={(event) => setNote(event.target.value)}
            />
          </div>
        )}
        <button type="submit" className="brass-button" disabled={busy}>
          {busy
            ? 'Your concierge is making the arrangements…'
            : privilege.redeemLabel}
        </button>
        <p className="card__small">
          {offline
            ? 'You are offline. Your request will be kept and sent to Arron once you are connected.'
            : 'Arron will be notified at once.'}
        </p>
        <p className="card__problem" role="alert">
          {problem}
        </p>
      </form>
    </article>
  );
}
