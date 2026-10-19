/**
 * Member Requests: every word Alise has had with the Butler, from the
 * service bell or at the foot of a letter. Arron replies with a short
 * Butler SMS or a letter (written here, delivered through the Correspondence
 * Desk), sees each response beside her original words, and marks a request
 * resolved himself. Nothing is resolved automatically.
 */
import { useCallback, useEffect, useState, type FormEvent } from 'react';
import type {
  OwnerRequests,
  OwnerServiceRequest,
  RequestResponse,
} from '../../shared/concierge/types';
import { BUTLER_SMS_MAX_LENGTH } from '../../shared/correspondence/templates';
import { newIdempotencyKey } from '../concierge/client/api';
import {
  commandLetter,
  failureText,
  retrySms,
  saveLetter,
  type DeskResult,
} from '../correspondence/client/correspondenceApi';
import { smsText, when } from './deskText';
import {
  linkLetter,
  ownerRequests,
  replyBySms,
  resolveRequest,
} from './serviceApi';
import './desk.css';

type Composing = { id: string; kind: 'sms' | 'letter' } | null;

const LETTER_STATUS: Record<string, string> = {
  draft: 'Draft on the Desk',
  scheduled: 'Scheduled',
  published: 'Delivered · unread',
  opened: 'Delivered · opened',
  thanked: 'Delivered · thanked',
};

export function RequestsDesk() {
  const [data, setData] = useState<OwnerRequests | null>(null);
  const [problem, setProblem] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [composing, setComposing] = useState<Composing>(null);

  const refresh = useCallback(async () => {
    const result = await ownerRequests();
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

  if (!data)
    return (
      <section className="desk" aria-label="Member requests">
        <h2>Member Requests</h2>
        {problem ? (
          <>
            <p role="alert" className="office-error">
              {problem}
            </p>
            <button onClick={() => void refresh()}>Try again</button>
          </>
        ) : (
          <p role="status">Opening the club’s book…</p>
        )}
      </section>
    );

  const open = data.requests.filter((r) => !r.resolvedAt);
  const resolved = data.requests.filter((r) => r.resolvedAt);

  const card = (request: OwnerServiceRequest) => (
    <RequestCard
      key={request.id}
      request={request}
      smsEnabled={data.smsEnabled}
      busy={busy}
      composing={composing?.id === request.id ? composing.kind : null}
      onCompose={(kind) => {
        setComposing(kind ? { id: request.id, kind } : null);
        setNotice('');
      }}
      onSms={async (body, key) => {
        const done = await run(
          () => replyBySms(request.id, body, key),
          data.smsEnabled
            ? 'Your Butler SMS is queued to Alise.'
            : 'Your Butler SMS is recorded and queued, not sent — SMS sending is switched off.',
        );
        if (done) setComposing(null);
        return Boolean(done);
      }}
      onLetter={async (letter, deliverNow, key) => {
        // The letter is an ordinary Desk letter: drafted, linked, then
        // (if asked) delivered with the Desk's own Send now.
        const saved = await run(() =>
          saveLetter({
            title: letter.title,
            salutation: letter.salutation,
            body: letter.body,
            timezone: 'Europe/London',
            deliverAt: null,
          }),
        );
        if (!saved) return false;
        const linked = await run(() =>
          linkLetter(request.id, saved.letter.id, key),
        );
        if (!linked) return false;
        if (deliverNow) {
          const sent = await run(
            () => commandLetter(saved.letter.id, 'send-now'),
            `“${letter.title}” has been delivered to Alise’s correspondence. The Butler’s invitation SMS is queued${data.smsEnabled ? '' : ' (SMS sending is off, so it will not leave yet)'}.`,
          );
          if (!sent) return false;
        } else
          setNotice(
            `“${letter.title}” is saved as a draft on the Correspondence Desk, linked to this request. Schedule it there.`,
          );
        setComposing(null);
        return true;
      }}
      onResolve={(value) =>
        void run(
          () => resolveRequest(request.id, value),
          value ? 'Marked resolved.' : 'Reopened.',
        )
      }
      onRetryNotification={(id) =>
        void run(() => retrySms(id), 'The SMS to you is queued again.')
      }
    />
  );

  return (
    <section className="desk" aria-labelledby="requests-title">
      <header className="desk__head">
        <h2 id="requests-title">Member Requests</h2>
        <p>
          Every word Alise has with the Butler, from the service bell or a
          letter. She is told only that her request was received.
        </p>
        <p className="desk__sms" data-enabled={data.smsEnabled}>
          {data.smsEnabled
            ? 'SMS sending is on. You are notified of each request by SMS, and your replies go to Alise by SMS.'
            : 'SMS sending is off. Requests still arrive here; SMS to you and to Alise wait as “queued”.'}
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
      <section className="desk__section">
        <h3>Awaiting your attention</h3>
        {open.length === 0 ? (
          <p className="desk__empty">Nothing waiting. Splendid.</p>
        ) : (
          <div className="desk__list">{open.map(card)}</div>
        )}
      </section>
      <section className="desk__section">
        <h3>Resolved</h3>
        {resolved.length === 0 ? (
          <p className="desk__empty">Nothing resolved yet.</p>
        ) : (
          <div className="desk__list">{resolved.map(card)}</div>
        )}
      </section>
      <button disabled={busy} onClick={() => void refresh()}>
        Refresh requests
      </button>
    </section>
  );
}

function ResponseLine({
  response,
  smsEnabled,
}: {
  response: RequestResponse;
  smsEnabled: boolean;
}) {
  if (response.kind === 'sms' && response.sms)
    return (
      <li>
        <p className="office-eyebrow">
          Butler SMS · {when(response.createdAt, 'Europe/London')} UK
        </p>
        <p className="desk__bubble">{response.sms.body}</p>
        <p className="desk__meta">{smsText(response.sms, smsEnabled)}</p>
      </li>
    );
  return (
    <li>
      <p className="office-eyebrow">
        Letter · {when(response.createdAt, 'Europe/London')} UK
      </p>
      {response.letter ? (
        <p>
          “{response.letter.title}” ·{' '}
          {LETTER_STATUS[response.letter.status] ?? response.letter.status}
        </p>
      ) : (
        <p className="desk__meta">The draft letter was later deleted.</p>
      )}
    </li>
  );
}

function RequestCard({
  request,
  smsEnabled,
  busy,
  composing,
  onCompose,
  onSms,
  onLetter,
  onResolve,
  onRetryNotification,
}: {
  request: OwnerServiceRequest;
  smsEnabled: boolean;
  busy: boolean;
  composing: 'sms' | 'letter' | null;
  onCompose(kind: 'sms' | 'letter' | null): void;
  onSms(body: string, key: string): Promise<boolean>;
  onLetter(
    letter: { title: string; salutation: string; body: string },
    deliverNow: boolean,
    key: string,
  ): Promise<boolean>;
  onResolve(resolved: boolean): void;
  onRetryNotification(id: string): void;
}) {
  const note = request.notificationSms;
  return (
    <article
      className="desk-card desk-request"
      data-resolved={Boolean(request.resolvedAt)}
    >
      <p className="office-eyebrow">
        {when(request.createdAt, 'Europe/London')} UK ·{' '}
        {request.source === 'service'
          ? 'Rang for the Butler'
          : `On the letter “${request.letter?.title ?? ''}”`}
      </p>
      <blockquote className="desk__reply">{request.body}</blockquote>
      <p className="desk__meta">SMS to you: {smsText(note, smsEnabled)}</p>
      {note && ['failed', 'cancelled'].includes(note.state) && (
        <button disabled={busy} onClick={() => onRetryNotification(note.id)}>
          Resend the SMS to me
        </button>
      )}
      {request.responses.length > 0 && (
        <section aria-label="Your responses">
          <h4 className="desk-request__title">Your responses</h4>
          <ol className="desk-request__responses">
            {request.responses.map((response) => (
              <ResponseLine
                key={response.id}
                response={response}
                smsEnabled={smsEnabled}
              />
            ))}
          </ol>
        </section>
      )}
      {request.resolvedAt && (
        <p className="desk__meta">
          Resolved {when(request.resolvedAt, 'Europe/London')} UK
        </p>
      )}
      {composing === 'sms' ? (
        <SmsReply busy={busy} onCancel={() => onCompose(null)} onSend={onSms} />
      ) : composing === 'letter' ? (
        <LetterReply
          busy={busy}
          onCancel={() => onCompose(null)}
          onSave={onLetter}
        />
      ) : (
        <div className="office-actions">
          <button disabled={busy} onClick={() => onCompose('sms')}>
            Reply with a Butler SMS
          </button>
          <button disabled={busy} onClick={() => onCompose('letter')}>
            Write a letter in response
          </button>
          <button
            disabled={busy}
            onClick={() => onResolve(!request.resolvedAt)}
          >
            {request.resolvedAt ? 'Reopen' : 'Mark resolved'}
          </button>
        </div>
      )}
    </article>
  );
}

function SmsReply({
  busy,
  onSend,
  onCancel,
}: {
  busy: boolean;
  onSend(body: string, key: string): Promise<boolean>;
  onCancel(): void;
}) {
  const [body, setBody] = useState('Certainly, Madam. ');
  const [key, setKey] = useState(newIdempotencyKey);
  function submit(event: FormEvent) {
    event.preventDefault();
    if (!body.trim()) return;
    void onSend(body.trim(), key);
  }
  return (
    <form className="desk-editor" onSubmit={submit}>
      <label>
        The Butler’s SMS to Alise
        <textarea
          value={body}
          rows={4}
          maxLength={BUTLER_SMS_MAX_LENGTH}
          onChange={(e) => {
            setBody(e.target.value);
            setKey(newIdempotencyKey());
          }}
        />
      </label>
      <p className="desk__meta">
        Exactly this text is sent. {body.trim().length} characters.
      </p>
      <div className="office-actions">
        <button disabled={busy || !body.trim()}>Send the Butler’s SMS</button>
        <button type="button" onClick={onCancel}>
          Never mind
        </button>
      </div>
    </form>
  );
}

function LetterReply({
  busy,
  onSave,
  onCancel,
}: {
  busy: boolean;
  onSave(
    letter: { title: string; salutation: string; body: string },
    deliverNow: boolean,
    key: string,
  ): Promise<boolean>;
  onCancel(): void;
}) {
  const [title, setTitle] = useState('In answer to your request');
  const [salutation, setSalutation] = useState('Dearest Alise,');
  const [body, setBody] = useState('');
  const [key] = useState(newIdempotencyKey);
  const [deliverNow, setDeliverNow] = useState(true);
  function submit(event: FormEvent) {
    event.preventDefault();
    if (!title.trim() || !body.trim()) return;
    void onSave(
      { title: title.trim(), salutation: salutation.trim(), body },
      deliverNow,
      key,
    );
  }
  return (
    <form className="desk-editor" onSubmit={submit}>
      <label>
        Title
        <input
          value={title}
          maxLength={120}
          onChange={(e) => setTitle(e.target.value)}
        />
      </label>
      <label>
        Salutation
        <input
          value={salutation}
          maxLength={80}
          onChange={(e) => setSalutation(e.target.value)}
        />
      </label>
      <label>
        Letter
        <textarea
          value={body}
          rows={6}
          maxLength={8000}
          onChange={(e) => setBody(e.target.value)}
        />
      </label>
      <label className="office-check">
        <input
          type="checkbox"
          checked={deliverNow}
          onChange={(e) => setDeliverNow(e.target.checked)}
        />
        Deliver it now (otherwise it waits as a draft on the Correspondence
        Desk)
      </label>
      <div className="office-actions">
        <button disabled={busy || !title.trim() || !body.trim()}>
          {deliverNow ? 'Deliver the letter now' : 'Save as a draft'}
        </button>
        <button type="button" onClick={onCancel}>
          Never mind
        </button>
      </div>
    </form>
  );
}
