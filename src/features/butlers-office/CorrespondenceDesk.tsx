/**
 * The Correspondence Desk in the Butler's Office. Arron gives a letter a
 * title, writes it and chooses when it arrives; the Butler chooses his
 * invitation and handles every SMS. Statuses come only from the server, and
 * SMS state is reported exactly: queued is never shown as sent.
 */
import {
  useCallback,
  useEffect,
  useId,
  useState,
  type FormEvent,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';
import type {
  LetterInput,
  LetterSms,
  MemberLetter,
  OwnerCorrespondence,
  OwnerLetter,
} from '../../shared/concierge/types';
import { instantToWall, wallTimeToInstant } from '../../shared/concierge/time';
import {
  INVITATION_TEMPLATES,
  LETTER_BODY_MAX_LENGTH,
  LETTER_TIMEZONES,
  TIMEZONE_LABELS,
  invitationSlot,
  type LetterTimezone,
} from '../../shared/correspondence/templates';
import {
  commandLetter,
  failureText,
  ownerCorrespondence,
  retrySms,
  saveLetter,
  type DeskResult,
  type LetterCommand,
} from '../correspondence/client/correspondenceApi';
import { LetterPresentation } from '../correspondence/ui/LetterPresentation';
import { deliveryText, smsText, when } from './deskText';
import './desk.css';
import { appClock } from '../rehearsal/clock';

const DEFAULT_SALUTATION = 'Dearest Alise,';

const STATUS_LABEL: Record<OwnerLetter['status'], string> = {
  draft: 'Draft',
  scheduled: 'Scheduled',
  published: 'Delivered · unread',
  opened: 'Opened',
  thanked: 'Opened · thanked',
};

/** What Alise will see, for the owner's preview. */
function asMemberLetter(letter: LetterInput & { id?: string }): MemberLetter {
  return {
    id: letter.id ?? 'preview',
    title: letter.title || 'Untitled letter',
    salutation: letter.salutation || DEFAULT_SALUTATION,
    body: letter.body,
    timezone: letter.timezone,
    deliveredAt: letter.deliverAt ?? new Date().toISOString(),
    openedAt: null,
    thankedAt: null,
    status: 'published',
    replies: [],
  };
}

type Editing = { letter: OwnerLetter | null } | null;

/** The time, refreshed every 20 seconds, for "is this still in the future?". */
function useNow(): number {
  const [now, setNow] = useState(() => appClock.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(appClock.now()), 20_000);
    return () => clearInterval(timer);
  }, []);
  return now;
}

export function CorrespondenceDesk() {
  const [data, setData] = useState<OwnerCorrespondence | null>(null);
  const [problem, setProblem] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState<Editing>(null);
  const [preview, setPreview] = useState<MemberLetter | null>(null);
  const [confirm, setConfirm] = useState<{
    id: string;
    command: LetterCommand;
  } | null>(null);

  const now = useNow();
  const refresh = useCallback(async () => {
    const result = await ownerCorrespondence();
    if (result.ok) setData(result.data);
    else setProblem(failureText(result));
  }, []);
  useEffect(() => {
    // Loading from the network is the effect's purpose.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void refresh();
  }, [refresh]);

  async function run<T>(
    request: () => Promise<DeskResult<T>>,
    done?: string,
  ): Promise<T | null> {
    setBusy(true);
    setProblem('');
    setNotice('');
    const result = await request();
    if (result.ok) {
      await refresh();
      if (done) setNotice(done);
    } else setProblem(failureText(result));
    setBusy(false);
    return result.ok ? result.data : null;
  }

  async function command(letter: OwnerLetter, verb: LetterCommand) {
    setConfirm(null);
    const words: Record<LetterCommand, string> = {
      schedule: `“${letter.title}” is scheduled. The Butler will deliver it at the time shown.`,
      'send-now': `“${letter.title}” has been delivered to Alise’s correspondence.`,
      cancel: `Delivery of “${letter.title}” is cancelled; it is a draft again.`,
      delete: `The draft “${letter.title}” has been deleted.`,
    };
    await run(() => commandLetter(letter.id, verb), words[verb]);
  }

  if (!data)
    return (
      <section className="desk" aria-label="The Correspondence Desk">
        <h2>The Correspondence Desk</h2>
        {problem ? (
          <>
            <p role="alert" className="office-error">
              {problem}
            </p>
            <button onClick={() => void refresh()}>Try again</button>
          </>
        ) : (
          <p role="status">Opening the Correspondence Desk…</p>
        )}
      </section>
    );

  const drafts = data.letters.filter((l) => l.state === 'draft');
  const scheduled = data.letters
    .filter((l) => l.state === 'scheduled')
    .sort((a, b) => Date.parse(a.deliverAt!) - Date.parse(b.deliverAt!));
  const delivered = data.letters.filter((l) => l.state === 'published');
  const inbox = data.letters
    .flatMap((l) => l.replies.map((reply) => ({ reply, letter: l })))
    .sort(
      (a, b) => Date.parse(b.reply.createdAt) - Date.parse(a.reply.createdAt),
    );

  const card = (letter: OwnerLetter) => (
    <LetterCard
      key={letter.id}
      letter={letter}
      now={now}
      smsEnabled={data.smsEnabled}
      busy={busy}
      confirming={confirm?.id === letter.id ? confirm.command : null}
      onEdit={() => {
        setEditing({ letter });
        setNotice('');
      }}
      onPreview={() => setPreview(asMemberLetter(letter))}
      onAsk={(verb) => setConfirm({ id: letter.id, command: verb })}
      onCancelAsk={() => setConfirm(null)}
      onCommand={(verb) => void command(letter, verb)}
      onRetry={(sms) =>
        void run(() => retrySms(sms.id), 'The SMS is queued again.')
      }
    />
  );

  return (
    <section className="desk" aria-label="The Correspondence Desk">
      <header className="desk__head">
        <h2>The Correspondence Desk</h2>
        <p>You write the letter. The Butler takes care of the rest.</p>
        <p className="desk__sms" data-enabled={data.smsEnabled}>
          {data.smsEnabled
            ? 'SMS sending is on. Invitations, thanks and Alise’s messages to you go by SMS automatically.'
            : 'SMS sending is off. Letters still arrive on schedule, and every SMS waits as “queued”; an unsent invitation is marked failed after six hours and can be resent here.'}
        </p>
      </header>

      <div aria-live="polite">
        {notice && <p className="desk__notice">{notice}</p>}
        {problem && (
          <p role="alert" className="office-error">
            {problem}
          </p>
        )}
      </div>

      {editing ? (
        <LetterEditor
          key={editing.letter?.id ?? 'new'}
          value={editing.letter}
          busy={busy}
          onPreview={setPreview}
          onCancel={() => setEditing(null)}
          onSave={async (input, schedule) => {
            const saved = await run(
              () => saveLetter(input, editing.letter?.id),
              schedule ? undefined : `“${input.title}” is saved as a draft.`,
            );
            if (!saved) return;
            if (schedule && saved.letter.state === 'draft') {
              const ok = await run(
                () => commandLetter(saved.letter.id, 'schedule'),
                `“${input.title}” is scheduled for ${deliveryText(saved.letter.deliverAt!, saved.letter.timezone)}.`,
              );
              if (!ok) {
                setEditing({ letter: saved.letter });
                return;
              }
            } else if (schedule)
              setNotice(
                `“${input.title}” stays scheduled for ${deliveryText(saved.letter.deliverAt!, saved.letter.timezone)}.`,
              );
            setEditing(null);
          }}
        />
      ) : (
        <button
          className="desk__compose"
          disabled={busy}
          onClick={() => {
            setEditing({ letter: null });
            setNotice('');
          }}
        >
          Compose a new letter
        </button>
      )}

      <DeskSection title="Scheduled" empty="Nothing is scheduled.">
        {scheduled.map(card)}
      </DeskSection>
      <DeskSection title="Drafts" empty="No drafts.">
        {drafts.map(card)}
      </DeskSection>
      <DeskSection title="Delivered" empty="No letter has been delivered yet.">
        {delivered.map(card)}
      </DeskSection>

      <section className="desk__inbox" aria-labelledby="desk-inbox">
        <h3 id="desk-inbox">Messages from Alise</h3>
        {inbox.length === 0 ? (
          <p>
            No messages yet. When Alise has a word with the Butler, it appears
            here even if no SMS reaches you.
          </p>
        ) : (
          <ol>
            {inbox.map(({ reply, letter }) => (
              <li key={reply.id} className="desk-card">
                <p className="office-eyebrow">
                  {when(reply.createdAt, 'Europe/London')} UK · {letter.title}
                </p>
                <p className="desk__reply">{reply.body}</p>
                <p className="desk__meta">
                  SMS to you: {smsText(reply.notificationSms, data.smsEnabled)}
                </p>
                {reply.notificationSms &&
                  ['failed', 'cancelled'].includes(
                    reply.notificationSms.state,
                  ) && (
                    <button
                      disabled={busy}
                      onClick={() =>
                        void run(
                          () => retrySms(reply.notificationSms!.id),
                          'The SMS is queued again.',
                        )
                      }
                    >
                      Resend the SMS to me
                    </button>
                  )}
              </li>
            ))}
          </ol>
        )}
      </section>

      <button disabled={busy} onClick={() => void refresh()}>
        Refresh the Desk
      </button>

      {preview &&
        createPortal(
          <div
            className="desk__preview"
            role="dialog"
            aria-modal="true"
            aria-label="Letter preview"
          >
            <div className="desk__preview-bar">
              <span>Preview · as Alise will see it</span>
              <button onClick={() => setPreview(null)}>Close preview</button>
            </div>
            <div className="cd-preview">
              <LetterPresentation letter={preview} preview />
            </div>
          </div>,
          document.body,
        )}
    </section>
  );
}

function DeskSection({
  title,
  empty,
  children,
}: {
  title: string;
  empty: string;
  children: ReactNode[];
}) {
  return (
    <section className="desk__section">
      <h3>{title}</h3>
      {children.length === 0 ? (
        <p className="desk__empty">{empty}</p>
      ) : (
        <div className="desk__list">{children}</div>
      )}
    </section>
  );
}

function LetterCard({
  letter,
  now,
  smsEnabled,
  busy,
  confirming,
  onEdit,
  onPreview,
  onAsk,
  onCancelAsk,
  onCommand,
  onRetry,
}: {
  letter: OwnerLetter;
  now: number;
  smsEnabled: boolean;
  busy: boolean;
  confirming: LetterCommand | null;
  onEdit(): void;
  onPreview(): void;
  onAsk(command: LetterCommand): void;
  onCancelAsk(): void;
  onCommand(command: LetterCommand): void;
  onRetry(sms: LetterSms): void;
}) {
  const retryable = (sms: LetterSms | null) =>
    sms && ['failed', 'cancelled'].includes(sms.state);
  const question: Partial<Record<LetterCommand, string>> = {
    'send-now':
      'Deliver this letter to Alise now? The Butler’s invitation is queued at once.',
    delete: 'Delete this draft permanently?',
  };
  return (
    <article className="desk-card" data-status={letter.status}>
      <p className="office-eyebrow">{STATUS_LABEL[letter.status]}</p>
      <h4>{letter.title}</h4>
      <dl className="desk__facts">
        {letter.state !== 'published' && (
          <>
            <dt>Arrives</dt>
            <dd>
              {letter.deliverAt
                ? deliveryText(letter.deliverAt, letter.timezone)
                : 'Time not chosen'}
            </dd>
          </>
        )}
        {letter.publishedAt && (
          <>
            <dt>Delivered</dt>
            <dd>
              {deliveryText(letter.publishedAt, letter.timezone)}
              {letter.publishedVia === 'send-now' ? ' · sent now' : ''}
            </dd>
            <dt>Invitation SMS</dt>
            <dd>
              {letter.invitationTemplate && (
                <span className="desk__template">
                  {letter.invitationTemplate}
                </span>
              )}{' '}
              {smsText(letter.invitationSms, smsEnabled)}
            </dd>
            <dt>Opened</dt>
            <dd>
              {letter.openedAt
                ? `${when(letter.openedAt, 'Europe/London')} UK`
                : 'Not yet'}
            </dd>
            <dt>Thanked</dt>
            <dd>
              {letter.thankedAt
                ? `${when(letter.thankedAt, 'Europe/London')} UK`
                : 'Not yet'}
            </dd>
            {letter.thanksSms && (
              <>
                <dt>Butler’s reply SMS</dt>
                <dd>{smsText(letter.thanksSms, smsEnabled)}</dd>
              </>
            )}
            <dt>Messages</dt>
            <dd>{letter.replies.length}</dd>
          </>
        )}
      </dl>
      {confirming && question[confirming] ? (
        <div className="desk__confirm" role="group" aria-label="Confirm">
          <p>{question[confirming]}</p>
          <div className="office-actions">
            <button disabled={busy} onClick={() => onCommand(confirming)}>
              {confirming === 'delete' ? 'Yes, delete it' : 'Yes, deliver now'}
            </button>
            <button disabled={busy} onClick={onCancelAsk}>
              Keep it
            </button>
          </div>
        </div>
      ) : (
        <div className="office-actions">
          <button disabled={busy} onClick={onPreview}>
            Preview
          </button>
          {letter.state !== 'published' && (
            <>
              <button disabled={busy} onClick={onEdit}>
                Edit
              </button>
              {letter.state === 'draft' && (
                <button
                  disabled={
                    busy ||
                    !letter.deliverAt ||
                    Date.parse(letter.deliverAt) <= now ||
                    !letter.body.trim()
                  }
                  onClick={() => onCommand('schedule')}
                >
                  Schedule delivery
                </button>
              )}
              <button
                disabled={busy || !letter.body.trim()}
                onClick={() => onAsk('send-now')}
              >
                Send now
              </button>
              {letter.state === 'scheduled' && (
                <button disabled={busy} onClick={() => onCommand('cancel')}>
                  Cancel delivery
                </button>
              )}
              {letter.state === 'draft' && (
                <button disabled={busy} onClick={() => onAsk('delete')}>
                  Delete draft
                </button>
              )}
            </>
          )}
          {retryable(letter.invitationSms) && !letter.openedAt && (
            <button
              disabled={busy}
              onClick={() => onRetry(letter.invitationSms!)}
            >
              Resend invitation SMS
            </button>
          )}
          {retryable(letter.thanksSms) && (
            <button disabled={busy} onClick={() => onRetry(letter.thanksSms!)}>
              Resend Butler’s reply
            </button>
          )}
        </div>
      )}
    </article>
  );
}

function LetterEditor({
  value,
  busy,
  onSave,
  onPreview,
  onCancel,
}: {
  value: OwnerLetter | null;
  busy: boolean;
  onSave(input: LetterInput, schedule: boolean): Promise<void>;
  onPreview(letter: MemberLetter): void;
  onCancel(): void;
}) {
  const [title, setTitle] = useState(value?.title ?? '');
  const [salutation, setSalutation] = useState(
    value?.salutation ?? DEFAULT_SALUTATION,
  );
  const [body, setBody] = useState(value?.body ?? '');
  const [zone, setZone] = useState<LetterTimezone>(
    value?.timezone ?? 'Europe/London',
  );
  const [wall, setWall] = useState(
    instantToWall(value?.deliverAt ?? null, value?.timezone ?? 'Europe/London'),
  );
  const [error, setError] = useState('');
  const now = useNow();
  const countId = useId();

  let instant: string | null = null;
  let timeProblem = '';
  if (wall) {
    try {
      instant = wallTimeToInstant(wall, zone);
    } catch (e) {
      timeProblem = e instanceof Error ? e.message : 'Choose another time.';
    }
  }
  const past = instant !== null && Date.parse(instant) <= now;

  function input(): LetterInput | null {
    if (!title.trim()) {
      setError('Give the letter a title.');
      return null;
    }
    if (timeProblem) {
      setError(timeProblem);
      return null;
    }
    return {
      title: title.trim(),
      salutation: salutation.trim() || DEFAULT_SALUTATION,
      body,
      timezone: zone,
      deliverAt: instant,
    };
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const schedule =
      (event.nativeEvent as SubmitEvent).submitter?.getAttribute('value') ===
      'schedule';
    setError('');
    const letter = input();
    if (!letter) return;
    if (schedule) {
      if (!letter.body.trim()) return setError('Write the letter first.');
      if (!instant) return setError('Choose when the letter should arrive.');
      if (past) return setError('Choose a time in the future.');
    }
    void onSave(letter, schedule);
  }

  return (
    <form className="desk-editor" onSubmit={submit} aria-label="Letter editor">
      <h3>{value ? 'Edit letter' : 'A new letter'}</h3>
      {value?.state === 'scheduled' && (
        <p className="desk__notice">
          This letter is scheduled. Saving keeps it scheduled at the time below.
        </p>
      )}
      <label>
        Title
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          maxLength={120}
          required
          autoComplete="off"
        />
      </label>
      <label>
        Salutation
        <input
          value={salutation}
          onChange={(e) => setSalutation(e.target.value)}
          maxLength={80}
          autoComplete="off"
        />
      </label>
      <label>
        Letter
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          maxLength={LETTER_BODY_MAX_LENGTH}
          rows={12}
          aria-describedby={countId}
        />
      </label>
      <p id={countId} className="desk__count">
        {LETTER_BODY_MAX_LENGTH - body.length} characters remaining · leave a
        blank line between paragraphs
      </p>
      <fieldset className="desk__zone">
        <legend>Time zone for delivery</legend>
        {LETTER_TIMEZONES.map((tz) => (
          <label key={tz} className="desk__zone-option">
            <input
              type="radio"
              name="timezone"
              value={tz}
              checked={zone === tz}
              onChange={() => setZone(tz)}
            />
            {TIMEZONE_LABELS[tz]}
          </label>
        ))}
      </fieldset>
      <label>
        Arrives at ({zone === 'Europe/London' ? 'UK time' : 'Jamaica time'})
        <input
          type="datetime-local"
          value={wall}
          onChange={(e) => setWall(e.target.value)}
        />
      </label>
      <p className="desk__arrival" aria-live="polite">
        {timeProblem
          ? timeProblem
          : instant
            ? `${past ? 'That time has passed: ' : 'Arrives '}${deliveryText(instant, zone)}. The Butler will send his ${invitationSlot(instant, zone)} invitation.`
            : 'No time chosen yet. You can save a draft, or use Send now from the letter’s card.'}
      </p>
      {instant && !timeProblem && (
        <details className="desk__template-text">
          <summary>The Butler’s invitation</summary>
          <p>{INVITATION_TEMPLATES[invitationSlot(instant, zone)]}</p>
        </details>
      )}
      {error && (
        <p role="alert" className="office-error">
          {error}
        </p>
      )}
      <div className="office-actions">
        <button type="submit" value="schedule" disabled={busy}>
          {value?.state === 'scheduled'
            ? 'Save and keep scheduled'
            : 'Schedule delivery'}
        </button>
        <button
          type="submit"
          value="draft"
          disabled={busy || value?.state === 'scheduled'}
        >
          Save draft
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => {
            const letter = input();
            if (letter) onPreview(asMemberLetter(letter));
          }}
        >
          Preview
        </button>
        <button type="button" disabled={busy} onClick={onCancel}>
          Close editor
        </button>
      </div>
    </form>
  );
}
