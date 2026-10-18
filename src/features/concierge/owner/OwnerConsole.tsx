import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { instantInZone } from '../../club/domain/schedule';
import {
  activeSession,
  endRehearsal,
  saveSession,
} from '../client/sessionStore';
import {
  choiceLabel,
  findPrivilege,
  type PrivilegeId,
} from '../domain/catalogue';
import type { MessageId } from '../domain/messages';
import type { Realm, Scope } from '../domain/session';
import { JAMAICA_ZONE, UK_ZONE } from '../domain/time';
import { OWNER_KEY_STORAGE, ownerApi, type OwnerOverview } from './ownerApi';
import './owner.css';

function readKey(): string {
  try {
    return window.localStorage.getItem(OWNER_KEY_STORAGE) ?? '';
  } catch {
    return '';
  }
}

function when(instant: number | string | null | undefined): string {
  if (instant === null || instant === undefined) return '—';
  const date = new Date(instant);
  const format = (zone: string) =>
    new Intl.DateTimeFormat('en-GB', {
      timeZone: zone,
      weekday: 'short',
      day: 'numeric',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    }).format(date);
  return `${format(UK_ZONE)} UK · ${format(JAMAICA_ZONE)} JM`;
}

/** "2026-10-22T18:30" as wall-clock UK time, for a datetime-local input. */
function ukInputValue(instant: number): string {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: UK_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(new Date(instant));
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '';
  return `${get('year')}-${get('month')}-${get('day')}T${get('hour')}:${get('minute')}`;
}

function fromUkInput(value: string): string | null {
  const [date, time] = value.split('T');
  if (!date || !time) return null;
  return new Date(instantInZone({ date, time }, UK_ZONE)).toISOString();
}

const REHEARSAL_MOMENTS: { label: string; at: () => number; go: string }[] = [
  {
    label: 'Before Thursday (letter on the step)',
    at: () => Date.parse('2026-10-21T11:00:00Z'),
    go: '/',
  },
  {
    label: 'Thursday 14:01 UK — Departure Lounge opens',
    at: () => Date.parse('2026-10-22T13:01:00Z'),
    go: '/departure',
  },
  {
    label: 'In flight (default release + 1 min)',
    at: () => Date.parse('2026-10-22T17:31:00Z'),
    go: '/departure',
  },
  {
    label: 'Friday 09:05 Jamaica — arrival correspondence',
    at: () => Date.parse('2026-10-23T14:05:00Z'),
    go: '/departure',
  },
  {
    label: 'Birthday, 30 s before midnight in Jamaica',
    at: () => Date.parse('2026-10-24T04:59:30Z'),
    go: '/',
  },
  {
    label: 'Birthday morning, 08:00 Jamaica — card awaited',
    at: () => Date.parse('2026-10-24T13:00:00Z'),
    go: '/',
  },
];

async function copy(text: string) {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    window.prompt('Copy this text', text);
  }
}

function Check({
  ok,
  label,
  detail,
}: {
  ok: boolean;
  label: string;
  detail?: string;
}) {
  return (
    <li className="owner-check" data-ok={ok}>
      <span aria-hidden="true">{ok ? '✓' : '✗'}</span>
      <span>
        {label}
        {detail && <small> {detail}</small>}
      </span>
      <span className="sr-only">{ok ? 'configured' : 'not configured'}</span>
    </li>
  );
}

/**
 * `/concierge/owner`. Arron's console: is everything configured, what has
 * Alise done, did the notifications arrive, and the controls to send,
 * resend, move release times and rehearse. Every action calls the service;
 * nothing here pretends.
 */
export default function OwnerConsole() {
  const [key, setKey] = useState(readKey);
  const [draft, setDraft] = useState('');
  const [remember, setRemember] = useState(true);
  const [realm, setRealm] = useState<Realm>('live');
  const [data, setData] = useState<OwnerOverview | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [withCredential, setWithCredential] = useState(false);
  const [resetPhrase, setResetPhrase] = useState('');
  const rehearsing = activeSession()?.claims.realm === 'rehearsal';

  const load = useCallback(async () => {
    if (!key) return;
    const result = await ownerApi(key).overview(realm);
    if (result.ok) {
      setData(result.data);
    } else {
      setData(null);
      setNotice(result.message);
      if (result.status === 401) setKey('');
    }
  }, [key, realm]);

  useEffect(() => {
    // Loading on mount and on realm change is the point of this effect.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  async function act(
    label: string,
    run: () => Promise<{ ok: boolean; message?: string }>,
  ) {
    setBusy(true);
    setNotice(null);
    const result = await run();
    setBusy(false);
    setNotice(
      result.ok ? `${label}: done.` : `${label}: ${result.message ?? 'failed'}`,
    );
    await load();
  }

  function signIn(event: FormEvent) {
    event.preventDefault();
    const value = draft.trim();
    if (!value) return;
    if (remember) {
      try {
        window.localStorage.setItem(OWNER_KEY_STORAGE, value);
      } catch {
        // Kept for this visit only.
      }
    }
    setKey(value);
    setDraft('');
  }

  function signOut() {
    try {
      window.localStorage.removeItem(OWNER_KEY_STORAGE);
    } catch {
      // Nothing stored.
    }
    setKey('');
    setData(null);
  }

  if (!key) {
    return (
      <div className="owner">
        <h1>Concierge — owner</h1>
        <form className="owner-signin" onSubmit={signIn}>
          <label htmlFor="owner-key">Owner key</label>
          <input
            id="owner-key"
            type="password"
            autoComplete="current-password"
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
          />
          <label className="owner-inline">
            <input
              type="checkbox"
              checked={remember}
              onChange={(event) => setRemember(event.target.checked)}
            />
            Remember on this device
          </label>
          <button type="submit">Open the console</button>
          {notice && <p role="alert">{notice}</p>}
        </form>
      </div>
    );
  }

  const api = ownerApi(key);
  const dispatchFor = (id: MessageId) =>
    data?.dispatches.find((d) => d.messageId === id);

  return (
    <div className="owner" aria-busy={busy}>
      <header className="owner-head">
        <h1>Concierge — owner</h1>
        <div className="owner-realm" role="group" aria-label="Records">
          {(['live', 'rehearsal'] as const).map((r) => (
            <button
              key={r}
              type="button"
              aria-pressed={realm === r}
              onClick={() => setRealm(r)}
            >
              {r === 'live' ? 'Live (Alise)' : 'Rehearsal'}
            </button>
          ))}
        </div>
        <button
          type="button"
          className="owner-link"
          onClick={() => void load()}
        >
          Refresh
        </button>
        <button type="button" className="owner-link" onClick={signOut}>
          Forget key
        </button>
      </header>
      <p className="owner-notice" role="status">
        {notice}
      </p>

      {!data ? (
        <p>Loading…</p>
      ) : (
        <>
          <section>
            <h2>Configuration</h2>
            <ul className="owner-checks">
              <Check ok={data.health.sessions} label="Session secret" />
              <Check ok={data.health.owner} label="Owner key" />
              <Check
                ok={
                  data.health.departureCredential.link &&
                  data.health.departureCredential.code
                }
                label="Travel credential"
                detail={`link ${data.health.departureCredential.link ? '✓' : '✗'} · code ${data.health.departureCredential.code ? '✓' : '✗'}`}
              />
              <Check
                ok={
                  data.health.membershipCredential.link &&
                  data.health.membershipCredential.code
                }
                label="Membership card"
                detail={`link ${data.health.membershipCredential.link ? '✓' : '✗'} · code ${data.health.membershipCredential.code ? '✓' : '✗'}`}
              />
              <Check ok={data.health.telegram} label="Telegram to Arron" />
              <Check
                ok={data.health.sms}
                label="SMS to Alise (optional)"
                detail={`mode: ${data.health.aliseDispatch}`}
              />
            </ul>
            <p className="owner-small">Site: {data.health.siteUrl}</p>
            <button
              type="button"
              disabled={busy}
              onClick={() =>
                void act('Test notification', async () => {
                  const r = await api.test(realm);
                  return r.ok
                    ? { ok: true }
                    : { ok: false, message: r.message };
                })
              }
            >
              Send a test notification to Arron ({realm})
            </button>
          </section>

          <section>
            <h2>Physical credentials</h2>
            {(['departure', 'membership'] as const).map((id) => {
              const credential = data.credentials[id];
              return (
                <div key={id} className="owner-row">
                  <h3>
                    {id === 'departure'
                      ? 'Travel credential (Thursday)'
                      : 'Membership card (Saturday)'}
                  </h3>
                  <p className="owner-mono">
                    {credential.link ?? 'Not configured'}
                  </p>
                  <p className="owner-small">
                    Manual code: {credential.code ?? '—'}
                  </p>
                  {credential.link && (
                    <button
                      type="button"
                      onClick={() => void copy(credential.link ?? '')}
                    >
                      Copy NFC link
                    </button>
                  )}
                </div>
              );
            })}
            <p className="owner-small">
              Write each link to an NTAG213/215 tag as a URL record. Test tags
              from a rehearsal (below), not from Alise’s live journey.
            </p>
          </section>

          <section>
            <h2>Activity</h2>
            <h3>Credentials presented</h3>
            {data.activations.length === 0 ? (
              <p className="owner-small">None yet.</p>
            ) : (
              <ul>
                {data.activations.map((a) => (
                  <li key={a.credential}>
                    {a.credential} — {when(a.at)} ({a.via})
                  </li>
                ))}
              </ul>
            )}
            <h3>Privileges redeemed</h3>
            {data.redemptions.length === 0 ? (
              <p className="owner-small">None yet.</p>
            ) : (
              data.redemptions.map((r) => {
                const privilege = findPrivilege(r.privilegeId);
                const chosen = choiceLabel(privilege, r.choice);
                return (
                  <div
                    key={r.privilegeId}
                    className="owner-row"
                    data-delivery={r.notification.status}
                  >
                    <h4>{privilege.title}</h4>
                    <p>{when(r.redeemedAt)}</p>
                    {(chosen || r.note) && (
                      <p>
                        Selection:{' '}
                        {[chosen, r.note].filter(Boolean).join(' — ')}
                      </p>
                    )}
                    <p>
                      Notification: <strong>{r.notification.status}</strong>{' '}
                      after {r.notification.attempts} attempt(s)
                      {r.notification.lastError
                        ? ` — ${r.notification.lastError}`
                        : ''}
                    </p>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() =>
                        void act('Resend', async () => {
                          const res = await api.resend(
                            realm,
                            r.privilegeId as PrivilegeId,
                          );
                          return res.ok
                            ? { ok: true }
                            : { ok: false, message: res.message };
                        })
                      }
                    >
                      Resend to Arron
                    </button>
                  </div>
                );
              })
            )}
          </section>

          <section>
            <h2>Release times</h2>
            <p className="owner-small">
              Departure Lounge: {when(data.schedule.departureOpensAt)} (fixed).
              Times below are entered in UK time.
            </p>
            {data.privileges.map((p) => {
              const at = data.schedule.privileges[p.id];
              const overridden = Boolean(data.overrides.privileges?.[p.id]);
              return (
                <form
                  key={p.id}
                  className="owner-row"
                  onSubmit={(event) => {
                    event.preventDefault();
                    const value = new FormData(event.currentTarget).get('at');
                    const iso =
                      typeof value === 'string' ? fromUkInput(value) : null;
                    if (!iso) return;
                    void act(`Release ${p.title}`, async () => {
                      const res = await api.schedule(
                        realm,
                        { privilegeId: p.id },
                        { at: iso },
                      );
                      return res.ok
                        ? { ok: true }
                        : { ok: false, message: res.message };
                    });
                  }}
                >
                  <h4>
                    {p.title}
                    {p.provisional && !overridden ? ' (provisional)' : ''}
                  </h4>
                  <p>{when(at)}</p>
                  <label>
                    New time (UK)
                    <input
                      name="at"
                      type="datetime-local"
                      defaultValue={ukInputValue(at)}
                    />
                  </label>
                  <div className="owner-buttons">
                    <button type="submit" disabled={busy}>
                      Save
                    </button>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() =>
                        void act(`Release ${p.title} now`, async () => {
                          const res = await api.schedule(
                            realm,
                            { privilegeId: p.id },
                            { at: new Date(data.now).toISOString() },
                          );
                          return res.ok
                            ? { ok: true }
                            : { ok: false, message: res.message };
                        })
                      }
                    >
                      Release now
                    </button>
                    {overridden && (
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() =>
                          void act('Default restored', async () => {
                            const res = await api.schedule(
                              realm,
                              { privilegeId: p.id },
                              { at: null },
                            );
                            return res.ok
                              ? { ok: true }
                              : { ok: false, message: res.message };
                          })
                        }
                      >
                        Restore default
                      </button>
                    )}
                  </div>
                </form>
              );
            })}
          </section>

          <section>
            <h2>Messages to Alise</h2>
            <p className="owner-small">
              {data.health.aliseDispatch === 'sms' && data.health.sms
                ? 'Scheduled messages go to Alise by SMS; you get a copy in Telegram.'
                : 'Manual mode: at each scheduled time, Telegram hands you the text to forward to Alise.'}{' '}
              Rehearsal messages only ever reach you.
            </p>
            {data.messages.map((m) => {
              const dispatch = dispatchFor(m.id);
              const disabled = Boolean(
                data.overrides.messages?.[m.id]?.disabled,
              );
              return (
                <div key={m.id} className="owner-row">
                  <h4>{m.label}</h4>
                  <p>
                    {m.timing === 'manual'
                      ? 'Sent manually'
                      : disabled
                        ? 'Automatic sending disabled'
                        : `Scheduled: ${when(m.sendAt)}`}
                  </p>
                  <p>
                    Status:{' '}
                    <strong>
                      {dispatch
                        ? `${dispatch.status} (${dispatch.channel}) ${when(dispatch.updatedAt)}`
                        : 'not sent'}
                    </strong>
                    {dispatch?.error ? ` — ${dispatch.error}` : ''}
                  </p>
                  <details>
                    <summary>Text</summary>
                    <pre className="owner-text">{m.text}</pre>
                  </details>
                  <div className="owner-buttons">
                    <button type="button" onClick={() => void copy(m.text)}>
                      Copy
                    </button>
                    <a
                      className="owner-button"
                      href={`https://wa.me/?text=${encodeURIComponent(m.text)}`}
                      target="_blank"
                      rel="noreferrer"
                    >
                      WhatsApp
                    </a>
                    <a
                      className="owner-button"
                      href={`sms:&body=${encodeURIComponent(m.text)}`}
                    >
                      Messages
                    </a>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() =>
                        void act(`Send “${m.label}”`, async () => {
                          const res = await api.message(realm, m.id, 'send');
                          return res.ok
                            ? { ok: true }
                            : { ok: false, message: res.message };
                        })
                      }
                    >
                      Send now via concierge
                    </button>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() =>
                        void act('Marked as sent', async () => {
                          const res = await api.message(
                            realm,
                            m.id,
                            'mark-sent',
                          );
                          return res.ok
                            ? { ok: true }
                            : { ok: false, message: res.message };
                        })
                      }
                    >
                      I sent it myself
                    </button>
                    {m.timing !== 'manual' && (
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() =>
                          void act(
                            disabled
                              ? 'Automatic sending on'
                              : 'Automatic sending off',
                            async () => {
                              const res = await api.schedule(
                                realm,
                                { messageId: m.id },
                                { disabled: !disabled },
                              );
                              return res.ok
                                ? { ok: true }
                                : { ok: false, message: res.message };
                            },
                          )
                        }
                      >
                        {disabled
                          ? 'Enable automatic send'
                          : 'Disable automatic send'}
                      </button>
                    )}
                    {dispatch && (
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() =>
                          void act('Status cleared', async () => {
                            const res = await api.message(realm, m.id, 'reset');
                            return res.ok
                              ? { ok: true }
                              : { ok: false, message: res.message };
                          })
                        }
                      >
                        Clear status
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </section>

          <section>
            <h2>Rehearse on this device</h2>
            <p className="owner-small">
              A rehearsal uses separate records, sends notifications marked
              [REHEARSAL] and never messages Alise. This device’s clock runs at
              the chosen moment until you end it.
            </p>
            {rehearsing && (
              <button
                type="button"
                onClick={() => {
                  endRehearsal();
                  setNotice('Rehearsal ended on this device.');
                }}
              >
                End the rehearsal on this device
              </button>
            )}
            <label className="owner-inline">
              <input
                type="checkbox"
                checked={withCredential}
                onChange={(event) => setWithCredential(event.target.checked)}
              />
              Start with the travel credential already presented
            </label>
            <ul className="owner-moments">
              {REHEARSAL_MOMENTS.map((moment) => (
                <li key={moment.label}>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() =>
                      void (async () => {
                        const scopes: Scope[] = withCredential
                          ? ['departure']
                          : [];
                        const res = await api.rehearsal(moment.at(), scopes);
                        if (!res.ok) {
                          setNotice(res.message);
                          return;
                        }
                        endRehearsal();
                        saveSession(res.data.session);
                        // A full load, so every room picks up the new clock.
                        window.location.assign(moment.go);
                      })()
                    }
                  >
                    {moment.label}
                  </button>
                </li>
              ))}
            </ul>
            <button
              type="button"
              disabled={busy}
              onClick={() =>
                void act('Rehearsal records cleared', async () => {
                  const res = await api.reset('rehearsal');
                  return res.ok
                    ? { ok: true }
                    : { ok: false, message: res.message };
                })
              }
            >
              Clear rehearsal records
            </button>
          </section>

          <section>
            <h2>Concierge display (hotel-room iPad)</h2>
            <p className="owner-small">
              On the iPad, open this console and pair it. On the birthday it
              shows the butler’s riddle, and plays the ceremony as soon as the
              card is scanned on any device.
            </p>
            <button
              type="button"
              disabled={busy}
              onClick={() =>
                void (async () => {
                  const res = await api.display('live');
                  if (!res.ok) {
                    setNotice(res.message);
                    return;
                  }
                  saveSession(res.data.session);
                  setNotice('This device is paired as the concierge display.');
                })()
              }
            >
              Pair this device as the display
            </button>
          </section>

          <section className="owner-danger">
            <h2>Clear live records</h2>
            <p className="owner-small">
              Removes Alise’s live activations, redemptions and message
              statuses. Use only before release. Type RESET LIVE.
            </p>
            <input
              aria-label="Confirmation phrase"
              value={resetPhrase}
              onChange={(event) => setResetPhrase(event.target.value)}
            />
            <button
              type="button"
              disabled={busy || resetPhrase !== 'RESET LIVE'}
              onClick={() =>
                void act('Live records cleared', async () => {
                  const res = await api.reset('live', resetPhrase);
                  setResetPhrase('');
                  return res.ok
                    ? { ok: true }
                    : { ok: false, message: res.message };
                })
              }
            >
              Clear live records
            </button>
          </section>
        </>
      )}
    </div>
  );
}
