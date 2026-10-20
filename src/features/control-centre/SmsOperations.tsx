/**
 * SMS operations (ADR-022): the server's SMS mode, the communication hold
 * shown independently, every outbox message with its true status, owner
 * rehearsal copies to the verified test number, and deliberate approval of
 * queued messages once LIVE. Every control is a server action; no phone
 * number or credential is ever shown or sent to the browser.
 */
import { useCallback, useEffect, useId, useRef, useState } from 'react';
import {
  JOURNEY_TIME_ZONE,
  type HoldState,
  type OwnerJourney,
} from '../../shared/journey/contract';
import {
  deskRequest,
  failureText,
  type DeskResult,
} from '../correspondence/client/correspondenceApi';
import {
  ownerCommunications,
  ownerJourney,
} from '../journey/client/journeyApi';
import { simulatedOwnerDocument } from '../rehearsal/mode';
import './smsOperations.css';

type Mode = 'off' | 'rehearsal' | 'live';

interface SmsMessage {
  id: string;
  label: string;
  body: string;
  audience: 'alise' | 'arron';
  category: string;
  state: string;
  status: string;
  sendAt: string | null;
  approvedAt: string | null;
  attempts: number;
  lastError: string | null;
}
interface SmsRehearsal {
  id: string;
  sourceKind: 'message' | 'milestone';
  sourceId: string;
  body: string;
  state: 'requested' | 'accepted' | 'failed';
  error: string | null;
  createdAt: string;
}
interface SmsOverview {
  mode: Mode;
  liveSince: string | null;
  changedAt: string | null;
  holdActive: boolean;
  now: string;
  messages: SmsMessage[];
  rehearsals: SmsRehearsal[];
  transport: {
    enabled: boolean;
    configured: boolean;
    rehearsalConfigured: boolean;
  };
}

const when = (at: string | null) =>
  at
    ? `${new Intl.DateTimeFormat('en-GB', {
        weekday: 'short',
        day: 'numeric',
        month: 'short',
        hour: '2-digit',
        minute: '2-digit',
        timeZone: 'Europe/London',
      }).format(new Date(at))} UK · ${new Intl.DateTimeFormat('en-GB', {
        hour: '2-digit',
        minute: '2-digit',
        timeZone: JOURNEY_TIME_ZONE,
      }).format(new Date(at))} Jamaica`
    : '—';

const STATUS: Record<string, string> = {
  draft: 'Draft — not approved',
  queued: 'Queued — will send when due',
  'awaiting-approval': 'Awaiting your approval (approved before LIVE)',
  paused: 'Paused — SMS mode is not LIVE',
  held: 'Held — communications to Alise are on hold',
  sending: 'Sending',
  sent: 'Sent (accepted by Twilio)',
  delivered: 'Delivered',
  failed: 'Failed',
  uncertain: 'Uncertain — reconcile with Twilio before resending',
  cancelled: 'Cancelled',
};
const MODE_TEXT: Record<Mode, string> = {
  off: 'OFF — nothing is sent. Queued messages wait.',
  rehearsal:
    'REHEARSAL — nothing real is sent. You may send rehearsal copies to your own verified number.',
  live: 'LIVE — the outbox sends. Messages to Alise also need the hold released and an approval given after LIVE began.',
};

const newKey = () =>
  `r-${Array.from(crypto.getRandomValues(new Uint8Array(12)), (b) => b.toString(16).padStart(2, '0')).join('')}`;

export default function SmsOperations() {
  const [data, setData] = useState<SmsOverview | null>(null);
  const [hold, setHold] = useState<HoldState | null>(null);
  const [milestones, setMilestones] = useState<OwnerJourney['milestones']>([]);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [confirmLive, setConfirmLive] = useState(false);
  const [typed, setTyped] = useState('');
  const field = useId();
  // One idempotency key per rehearsal button until it succeeds or fails.
  const keys = useRef(new Map<string, string>());

  const load = useCallback(async () => {
    const [sms, communications, journey] = await Promise.all([
      deskRequest<SmsOverview>('/owner/sms'),
      ownerCommunications(),
      ownerJourney(),
    ]);
    if (sms.ok) setData(sms.data);
    else setError(failureText(sms));
    if (communications.ok) setHold(communications.data);
    if (journey.ok) setMilestones(journey.data.milestones);
  }, []);

  useEffect(() => {
    let alive = true;
    const refresh = () =>
      void Promise.all([
        deskRequest<SmsOverview>('/owner/sms'),
        ownerCommunications(),
        ownerJourney(),
      ]).then(([sms, communications, journey]) => {
        if (!alive) return;
        if (sms.ok) setData(sms.data);
        else setError(failureText(sms));
        if (communications.ok) setHold(communications.data);
        if (journey.ok) setMilestones(journey.data.milestones);
      });
    refresh();
    const timer = setInterval(refresh, 20_000);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, []);

  async function run<T>(action: () => Promise<DeskResult<T>>, done: string) {
    if (busy) return;
    setBusy(true);
    setNotice('');
    setError('');
    const result = await action();
    setBusy(false);
    if (!result.ok) setError(failureText(result));
    else setNotice(done);
    await load();
    return result;
  }

  const setMode = (mode: Mode) =>
    void run(
      () =>
        deskRequest<SmsOverview>('/owner/sms/mode', {
          body: mode === 'live' ? { mode, confirm: typed } : { mode },
        }),
      `SMS operations are now ${mode.toUpperCase()}.`,
    ).then(() => {
      setConfirmLive(false);
      setTyped('');
    });

  async function rehearse(kind: 'message' | 'milestone', id: string) {
    const slot = `${kind}:${id}`;
    const key = keys.current.get(slot) ?? newKey();
    keys.current.set(slot, key);
    const result = await run(
      () =>
        deskRequest<{ rehearsal: { state: string; error: string | null } }>(
          '/owner/sms/rehearsals',
          { body: { kind, id, idempotencyKey: key } },
        ),
      'Rehearsal requested.',
    );
    keys.current.delete(slot);
    if (result?.ok) {
      const r = result.data.rehearsal;
      if (r.state === 'accepted')
        setNotice(
          'Sent to your verified test number. Tap its link on that phone to open the rehearsal in TEST.',
        );
      else setError(`Not sent: ${r.error ?? 'refused by the SMS policy.'}`);
    }
  }

  if (!data)
    return (
      <section className="sms-ops">
        <h2>SMS operations</h2>
        {error ? (
          <p className="sms-ops__error" role="alert">
            {error}
          </p>
        ) : (
          <p>Loading…</p>
        )}
      </section>
    );

  const transportReady = data.transport.enabled && data.transport.configured;
  const alise = data.messages.filter((m) => m.audience === 'alise');
  const arron = data.messages.filter((m) => m.audience === 'arron');
  const letterMilestones = milestones.filter(
    (m) =>
      m.state !== 'fired' &&
      m.effects.some((e) => e.type === 'invite-room' || e.type === 'letter'),
  );

  return (
    <section className="sms-ops" aria-labelledby="sms-ops-title">
      <h2 id="sms-ops-title">SMS operations</h2>
      {simulatedOwnerDocument && (
        <p className="sms-ops__note">
          TEST: the simulated office and a fake provider. Real rehearsal SMS are
          sent from LIVE in REHEARSAL mode.
        </p>
      )}

      <div className="sms-ops__status">
        <article>
          <h3>Transport</h3>
          <p>
            {transportReady
              ? 'Available (SMS_SENDING_ENABLED and Twilio configured).'
              : !data.transport.enabled
                ? 'Off (SMS_SENDING_ENABLED is not true). Nothing can be sent.'
                : 'Not configured (Twilio credentials missing).'}
          </p>
          <p>
            Owner test number:{' '}
            {data.transport.rehearsalConfigured
              ? 'configured'
              : 'not configured (set SMS_REHEARSAL_TO in Netlify)'}
          </p>
        </article>
        <article>
          <h3>Communication hold</h3>
          <p data-held={hold?.active ? 'true' : 'false'}>
            {hold
              ? hold.active
                ? 'ON HOLD — nothing reaches Alise, whatever the mode.'
                : 'Released.'
              : '—'}
          </p>
        </article>
        <article>
          <h3>Mode</h3>
          <p className="sms-ops__mode" data-mode={data.mode}>
            {MODE_TEXT[data.mode]}
          </p>
          {data.changedAt && <p>Changed {when(data.changedAt)}</p>}
          <div className="sms-ops__actions">
            <button
              type="button"
              disabled={busy || data.mode === 'off'}
              onClick={() => setMode('off')}
            >
              OFF
            </button>
            <button
              type="button"
              disabled={busy || data.mode === 'rehearsal'}
              onClick={() => setMode('rehearsal')}
            >
              REHEARSAL
            </button>
            <button
              type="button"
              disabled={busy || data.mode === 'live'}
              onClick={() => setConfirmLive(true)}
            >
              LIVE…
            </button>
          </div>
          {confirmLive && (
            <div className="sms-ops__confirm">
              <label htmlFor={field}>
                Type LIVE to allow real messages. Queued messages to Alise still
                need your approval; nothing is flushed.
              </label>
              <input
                id={field}
                value={typed}
                autoComplete="off"
                autoCapitalize="characters"
                onChange={(e) => setTyped(e.target.value)}
              />
              <div className="sms-ops__actions">
                <button
                  type="button"
                  disabled={busy || typed !== 'LIVE'}
                  onClick={() => setMode('live')}
                >
                  Switch to LIVE
                </button>
                <button type="button" onClick={() => setConfirmLive(false)}>
                  Cancel
                </button>
              </div>
            </div>
          )}
        </article>
      </div>

      {notice && (
        <p className="sms-ops__notice" role="status">
          {notice}
        </p>
      )}
      {error && (
        <p className="sms-ops__error" role="alert">
          {error}
        </p>
      )}

      <h3>Messages to Alise</h3>
      {alise.length === 0 && <p>None.</p>}
      <ul className="sms-ops__list">
        {alise.map((m) => (
          <li key={m.id} data-status={m.status}>
            <p className="sms-ops__label">
              <strong>{m.label}</strong> · {STATUS[m.status] ?? m.status}
            </p>
            <p>Send: {when(m.sendAt)}</p>
            <pre className="sms-ops__body">{m.body}</pre>
            {m.lastError && <p className="sms-ops__error">{m.lastError}</p>}
            <div className="sms-ops__actions">
              <button
                type="button"
                disabled={busy || data.mode !== 'rehearsal'}
                onClick={() => void rehearse('message', m.id)}
                title={
                  data.mode !== 'rehearsal'
                    ? 'Switch to REHEARSAL to send a copy to your phone.'
                    : undefined
                }
              >
                Rehearse to my phone
              </button>
              {m.status === 'awaiting-approval' && (
                <button
                  type="button"
                  disabled={busy || data.mode !== 'live' || hold?.active}
                  onClick={() =>
                    window.confirm(
                      `Approve “${m.label}” to be sent to Alise now?`,
                    ) &&
                    void run(
                      () =>
                        deskRequest(`/owner/sms/messages/${m.id}/approve`, {
                          body: {},
                        }),
                      'Approved for sending.',
                    )
                  }
                >
                  Approve for sending
                </button>
              )}
            </div>
            {m.status === 'draft' && (
              <p className="sms-ops__hint">
                Approve drafts in Butler’s Office → messages, after releasing
                the hold and switching to LIVE. A scheduled message must be
                approved before its time.
              </p>
            )}
          </li>
        ))}
      </ul>

      <h3>Journey letters’ SMS (rehearse before they are due)</h3>
      <ul className="sms-ops__list">
        {letterMilestones.map((m) => (
          <li key={m.key}>
            <p className="sms-ops__label">
              <strong>{m.title}</strong> · {when(m.fireAt)}
            </p>
            <button
              type="button"
              disabled={busy || data.mode !== 'rehearsal'}
              onClick={() => void rehearse('milestone', m.key)}
            >
              Rehearse its SMS to my phone
            </button>
          </li>
        ))}
      </ul>

      <h3>Notifications to you</h3>
      {arron.length === 0 && <p>None.</p>}
      <ul className="sms-ops__list">
        {arron.slice(0, 20).map((m) => (
          <li key={m.id} data-status={m.status}>
            <p className="sms-ops__label">
              <strong>{m.label}</strong> · {STATUS[m.status] ?? m.status}
            </p>
          </li>
        ))}
      </ul>

      <h3>Rehearsals sent</h3>
      {data.rehearsals.length === 0 && <p>None yet.</p>}
      <ul className="sms-ops__list">
        {data.rehearsals.map((r) => (
          <li key={r.id} data-state={r.state}>
            <p className="sms-ops__label">
              {when(r.createdAt)} · {r.state}
              {r.error ? ` — ${r.error}` : ''}
            </p>
            <pre className="sms-ops__body">{r.body}</pre>
          </li>
        ))}
      </ul>
    </section>
  );
}
