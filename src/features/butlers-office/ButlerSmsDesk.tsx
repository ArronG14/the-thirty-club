/**
 * Messages · Write to Alise. A Butler SMS straight to her phone, without a
 * letter: now, or at a time in London or Jamaica. It is an ordinary approved
 * message in the existing outbox, so the global SMS switch, the dispatcher's
 * claim/backoff/uncertain handling and Twilio's callbacks all apply. The
 * history shows exactly what the outbox knows; queued is never "sent".
 */
import { useCallback, useEffect, useId, useState, type FormEvent } from 'react';
import type { DirectSms, OwnerDirectSms } from '../../shared/concierge/types';
import { wallTimeToInstant } from '../../shared/concierge/time';
import {
  BUTLER_SMS_MAX_LENGTH,
  LETTER_TIMEZONES,
  TIMEZONE_LABELS,
  type LetterTimezone,
} from '../../shared/correspondence/templates';
import { newIdempotencyKey } from '../concierge/client/api';
import {
  failureText,
  retrySms,
  type DeskResult,
} from '../correspondence/client/correspondenceApi';
import { deliveryText, smsText, when } from './deskText';
import {
  cancelDirectSms,
  cancellable,
  ownerDirectSms,
  retryable,
  sendDirectSms,
  smsStage,
  STAGE_LABEL,
} from './serviceApi';
import './desk.css';
import { appClock } from '../rehearsal/clock';

/** Plain GSM text is 160 characters a part; anything else is 70. */
function parts(text: string): number {
  const gsm =
    // eslint-disable-next-line no-control-regex
    /^[\u0000-\u007F£¥èéùìòÇØøÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ¤¡ÄÖÑÜ§¿äöñüà€]*$/.test(text);
  const single = gsm ? 160 : 70;
  const multi = gsm ? 153 : 67;
  if (text.length <= single) return 1;
  return Math.ceil(text.length / multi);
}

function useNow(): number {
  const [now, setNow] = useState(() => appClock.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(appClock.now()), 15_000);
    return () => clearInterval(timer);
  }, []);
  return now;
}

export function ButlerSmsDesk() {
  const [data, setData] = useState<OwnerDirectSms | null>(null);
  const [problem, setProblem] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const now = useNow();

  const refresh = useCallback(async () => {
    const result = await ownerDirectSms();
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
    done: (data: T) => string,
  ): Promise<boolean> {
    setBusy(true);
    setProblem('');
    setNotice('');
    const result = await request();
    if (result.ok) {
      await refresh();
      setNotice(done(result.data));
    } else setProblem(failureText(result));
    setBusy(false);
    return result.ok;
  }

  return (
    <section className="desk" aria-labelledby="butler-sms-title">
      <header className="desk__head">
        <h2 id="butler-sms-title">Write to Alise</h2>
        <p>A Butler SMS to her phone, without a letter.</p>
        {data && (
          <p className="desk__sms" data-enabled={data.smsEnabled}>
            {data.smsEnabled
              ? 'SMS sending is on. A message sent now leaves within a minute or two.'
              : 'SMS sending is off. Messages are recorded and wait as “queued”; nothing reaches Alise until sending is switched on. A message still unsent six hours after its time is marked failed.'}
          </p>
        )}
      </header>
      <div aria-live="polite">
        {notice && <p className="desk__notice">{notice}</p>}
        {problem && (
          <p role="alert" className="office-error">
            {problem}
          </p>
        )}
      </div>

      <Composer
        now={now}
        busy={busy}
        smsEnabled={data?.smsEnabled ?? false}
        onSend={(input) =>
          run(
            () => sendDirectSms(input),
            ({ message, duplicate }) =>
              duplicate
                ? 'That message was already recorded; nothing new was queued.'
                : input.sendAt
                  ? `Scheduled for ${deliveryText(message.sendAt!, message.timezone)}.`
                  : data?.smsEnabled
                    ? 'Queued to send now.'
                    : 'Queued, not sent — SMS sending is switched off.',
          )
        }
      />

      <section className="desk__section" aria-labelledby="butler-sms-history">
        <h3 id="butler-sms-history">Message history</h3>
        {!data ? (
          <p role="status">Opening the message book…</p>
        ) : data.messages.length === 0 ? (
          <p className="desk__empty">No Butler SMS have been written yet.</p>
        ) : (
          <div className="desk__list">
            {data.messages.map((message) => (
              <MessageCard
                key={message.id}
                message={message}
                now={now}
                busy={busy}
                smsEnabled={data.smsEnabled}
                onCancel={() =>
                  void run(
                    () => cancelDirectSms(message.id),
                    () => 'Cancelled. It will not be sent.',
                  )
                }
                onRetry={() =>
                  void run(
                    () => retrySms(message.id),
                    () =>
                      data.smsEnabled
                        ? 'Queued again to send now.'
                        : 'Queued again, not sent — SMS sending is switched off.',
                  )
                }
              />
            ))}
          </div>
        )}
      </section>
      <button disabled={busy} onClick={() => void refresh()}>
        Refresh messages
      </button>
    </section>
  );
}

function Composer({
  now,
  busy,
  smsEnabled,
  onSend,
}: {
  now: number;
  busy: boolean;
  smsEnabled: boolean;
  onSend(input: {
    body: string;
    timezone: LetterTimezone;
    sendAt: string | null;
    idempotencyKey: string;
  }): Promise<boolean>;
}) {
  const [body, setBody] = useState('');
  const [mode, setMode] = useState<'now' | 'later'>('now');
  const [zone, setZone] = useState<LetterTimezone>('America/Jamaica');
  const [local, setLocal] = useState('');
  const [confirming, setConfirming] = useState(false);
  const [key, setKey] = useState(newIdempotencyKey);
  const [error, setError] = useState('');
  const bodyId = useId();
  const previewId = useId();

  let instant: string | null = null;
  let timing = smsEnabled
    ? 'Sends now (within a minute or two).'
    : 'Will be queued now, but SMS sending is off: it will not leave until it is switched on.';
  if (mode === 'later') {
    timing = 'Choose a date and time.';
    if (local) {
      try {
        instant = wallTimeToInstant(local, zone);
        timing =
          Date.parse(instant) <= now
            ? 'That time has already passed.'
            : `Sends ${deliveryText(instant, zone)}.`;
      } catch (e) {
        timing = e instanceof Error ? e.message : 'That time is not valid.';
      }
    }
  }
  const text = body.trim();
  const ready =
    text.length > 0 &&
    (mode === 'now' || (instant !== null && Date.parse(instant) > now));

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError('');
    if (!ready) {
      setError(
        text.length === 0
          ? 'Write the message first.'
          : 'Choose a time in the future.',
      );
      return;
    }
    if (!confirming) {
      setConfirming(true);
      return;
    }
    const ok = await onSend({
      body: text,
      timezone: zone,
      sendAt: mode === 'later' ? instant : null,
      idempotencyKey: key,
    });
    setConfirming(false);
    if (ok) {
      setBody('');
      setLocal('');
      setMode('now');
      setKey(newIdempotencyKey());
    }
  }

  return (
    <form
      className="desk-card desk-editor"
      onSubmit={(e) => void submit(e)}
      onChange={() => setConfirming(false)}
    >
      <label htmlFor={bodyId}>The Butler’s message</label>
      <textarea
        id={bodyId}
        value={body}
        maxLength={BUTLER_SMS_MAX_LENGTH}
        rows={5}
        onChange={(e) => {
          setBody(e.target.value);
          setKey(newIdempotencyKey());
        }}
        placeholder="Madam, a car will collect you at ten o’clock…"
      />
      <p className="desk__meta">
        {body.length} / {BUTLER_SMS_MAX_LENGTH} characters ·{' '}
        {parts(body || ' ')} SMS {parts(body || ' ') === 1 ? 'part' : 'parts'}
      </p>
      <fieldset className="desk__when">
        <legend>When</legend>
        <label className="office-check">
          <input
            type="radio"
            name="when"
            checked={mode === 'now'}
            onChange={() => setMode('now')}
          />
          Send now
        </label>
        <label className="office-check">
          <input
            type="radio"
            name="when"
            checked={mode === 'later'}
            onChange={() => setMode('later')}
          />
          Schedule for later
        </label>
      </fieldset>
      {mode === 'later' && (
        <div className="office-form-row">
          <label>
            Time zone
            <select
              value={zone}
              onChange={(e) => setZone(e.target.value as LetterTimezone)}
            >
              {LETTER_TIMEZONES.map((z) => (
                <option key={z} value={z}>
                  {TIMEZONE_LABELS[z]}
                </option>
              ))}
            </select>
          </label>
          <label>
            Date and time
            <input
              type="datetime-local"
              value={local}
              onChange={(e) => setLocal(e.target.value)}
            />
          </label>
        </div>
      )}
      <section className="desk__sms-preview" aria-labelledby={previewId}>
        <p id={previewId} className="office-eyebrow">
          Exactly what Alise will receive
        </p>
        <p className="desk__bubble">
          {text || 'Your message will appear here.'}
        </p>
        <p className="desk__meta">{timing}</p>
      </section>
      {error && (
        <p role="alert" className="office-error">
          {error}
        </p>
      )}
      {confirming && (
        <p className="desk__confirm" role="alert">
          {mode === 'now'
            ? 'Send this SMS to Alise now? Press again to confirm.'
            : 'Schedule this SMS to Alise? Press again to confirm.'}
        </p>
      )}
      <div className="office-actions">
        <button disabled={busy}>
          {confirming
            ? mode === 'now'
              ? 'Yes, send it now'
              : 'Yes, schedule it'
            : mode === 'now'
              ? 'Send now'
              : 'Schedule SMS'}
        </button>
        {confirming && (
          <button type="button" onClick={() => setConfirming(false)}>
            Not yet
          </button>
        )}
      </div>
    </form>
  );
}

function MessageCard({
  message,
  now,
  busy,
  smsEnabled,
  onCancel,
  onRetry,
}: {
  message: DirectSms;
  now: number;
  busy: boolean;
  smsEnabled: boolean;
  onCancel(): void;
  onRetry(): void;
}) {
  const [asking, setAsking] = useState<'cancel' | 'retry' | null>(null);
  const stage = smsStage(message, now);
  return (
    <article className="desk-card" data-stage={stage}>
      <p className="office-eyebrow">{STAGE_LABEL[stage]}</p>
      <p className="desk__bubble">{message.body}</p>
      <dl className="desk__facts">
        <dt>{stage === 'scheduled' ? 'Sends' : 'Due'}</dt>
        <dd>
          {message.sendAt
            ? deliveryText(message.sendAt, message.timezone)
            : 'Now'}
        </dd>
        <dt>Status</dt>
        <dd>
          {stage === 'scheduled'
            ? smsEnabled
              ? 'Waiting for its time'
              : 'Waiting for its time · SMS sending is off'
            : smsText(
                {
                  id: message.id,
                  state: message.state,
                  attempts: message.attempts,
                  sendAt: message.sendAt,
                  providerSid: message.providerSid,
                  lastError: message.lastError,
                },
                smsEnabled,
              )}
        </dd>
        <dt>Written</dt>
        <dd>{when(message.createdAt, 'Europe/London')} UK</dd>
        {message.attempts > 0 && (
          <>
            <dt>Attempts</dt>
            <dd>
              {message.attempts}
              {message.providerSid ? ` · ${message.providerSid}` : ''}
            </dd>
          </>
        )}
      </dl>
      {stage === 'uncertain' && (
        <p className="desk__meta">
          It may already be on her phone. Check Twilio’s log; automatic resend
          is held.
        </p>
      )}
      {asking ? (
        <div className="office-actions">
          <p className="desk__confirm">
            {asking === 'cancel'
              ? 'Cancel this message? It will not be sent.'
              : 'Send this message again now?'}
          </p>
          <button
            disabled={busy}
            onClick={() => {
              setAsking(null);
              if (asking === 'cancel') onCancel();
              else onRetry();
            }}
          >
            {asking === 'cancel' ? 'Yes, cancel it' : 'Yes, send again'}
          </button>
          <button onClick={() => setAsking(null)}>Keep it as it is</button>
        </div>
      ) : (
        <div className="office-actions">
          {cancellable(message) && (
            <button disabled={busy} onClick={() => setAsking('cancel')}>
              Cancel message
            </button>
          )}
          {retryable(message) && (
            <button disabled={busy} onClick={() => setAsking('retry')}>
              Send again
            </button>
          )}
        </div>
      )}
    </article>
  );
}
