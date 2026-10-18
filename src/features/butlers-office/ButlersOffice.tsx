import { useCallback, useEffect, useState, type FormEvent } from 'react';
import type {
  OwnerOverview,
  Privilege,
  PrivilegeInput,
  ScheduledMessage,
  ScheduledMessageInput,
  Session,
} from '../../shared/concierge/types';
import { instantToWall, wallTimeToInstant } from '../../shared/concierge/time';
import { OfficeError, officeRequest } from './client';
import { VaultOffice } from './VaultOffice';
import { CorrespondenceDesk } from './CorrespondenceDesk';
import './office.css';
const fmtMoney = (pence: number) =>
  new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP' }).format(
    pence / 100,
  );
const date = (at: string | null, zone = 'Europe/London') =>
  at
    ? new Intl.DateTimeFormat('en-GB', {
        dateStyle: 'medium',
        timeStyle: 'short',
        timeZone: zone,
      }).format(new Date(at))
    : 'Time undecided';
const errorText = (error: unknown) =>
  error instanceof Error
    ? error.message
    : 'The Butler is unavailable. Please try again.';
export default function ButlersOffice() {
  const [session, setSession] = useState<Session | null | undefined>(undefined);
  const [data, setData] = useState<OwnerOverview | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [tab, setTab] = useState('overview');
  const [editingPrivilege, setEditingPrivilege] = useState<Privilege | null>(
    null,
  );
  const [editingMessage, setEditingMessage] = useState<ScheduledMessage | null>(
    null,
  );
  const [invitation, setInvitation] = useState<{
    token: string;
    expiresAt: string;
  } | null>(null);
  const refresh = useCallback(
    async () => setData(await officeRequest<OwnerOverview>('/owner/overview')),
    [],
  );
  useEffect(() => {
    let active = true;
    officeRequest<{ session: Session }>('/auth/session')
      .then(async ({ session: found }) => {
        if (!active) return;
        if (found.role !== 'owner') {
          setSession(null);
          return;
        }
        setSession(found);
        const overview = await officeRequest<OwnerOverview>('/owner/overview');
        if (active) setData(overview);
      })
      .catch((e) => {
        if (active) {
          setSession(null);
          if (!(e instanceof OfficeError && e.status === 401))
            setError(errorText(e));
        }
      });
    return () => {
      active = false;
    };
  }, []);
  async function run(action: () => Promise<void>) {
    setBusy(true);
    setError('');
    try {
      await action();
    } catch (e) {
      setError(errorText(e));
      if (e instanceof OfficeError && e.status === 401) {
        setSession(null);
        setData(null);
      }
    } finally {
      setBusy(false);
    }
  }
  async function mutate(
    path: string,
    body: unknown = {},
    method?: 'POST' | 'PATCH',
  ) {
    await officeRequest(path, body, method);
    await refresh();
  }
  function login(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const password = String(new FormData(form).get('password'));
    void run(async () => {
      const result = await officeRequest<{ session: Session }>('/auth/owner', {
        password,
      });
      form.reset();
      setSession(result.session);
      await refresh();
    });
  }
  const privileges = data?.privileges ?? [];
  const pending = data?.redemptions.filter((r) => r.state === 'pending') ?? [];
  return (
    <section className="butlers-office" aria-label="Butler’s Office">
      <header className="office-header">
        <a href="/" className="office-eyebrow">
          The Thirty Club
        </a>
        <h1>The Butler’s Office</h1>
        <p>Every detail, attended to.</p>
      </header>
      {error && (
        <p role="alert" className="office-error">
          {error}
        </p>
      )}
      {session === undefined ? (
        <p role="status">Opening the office…</p>
      ) : session === null ? (
        <section className="office-login">
          <h2>Owner access</h2>
          <p>Sign in with your private office password.</p>
          <form onSubmit={login}>
            <label>
              Password
              <input
                name="password"
                type="password"
                autoComplete="current-password"
                required
                minLength={1}
                maxLength={512}
              />
            </label>
            <button disabled={busy}>
              {busy ? 'Signing in…' : 'Enter the office'}
            </button>
          </form>
          <a href="/">Return to the club</a>
        </section>
      ) : (
        <>
          <div className="office-session">
            <span>
              Secure owner session · expires {date(session.expiresAt)}
            </span>
            <button
              disabled={busy}
              onClick={() =>
                void run(async () => {
                  await officeRequest('/auth/logout', {});
                  setSession(null);
                  setData(null);
                  setInvitation(null);
                })
              }
            >
              Sign out
            </button>
          </div>
          <nav className="office-tabs" aria-label="Office sections">
            {[
              'overview',
              'correspondence',
              'privileges',
              'redemptions',
              'messages',
              'vault',
              'history',
              'membership',
            ].map((t) => (
              <button
                key={t}
                aria-pressed={tab === t}
                onClick={() => setTab(t)}
              >
                {t}
              </button>
            ))}
          </nav>
          {!data ? (
            <p role="status">Loading the club records…</p>
          ) : (
            <>
              <div className="office-refresh">
                <p>
                  {data.smsEnabled
                    ? 'SMS enabled · individual approval still required'
                    : 'SMS paused · all new messages require approval'}
                </p>
                <button disabled={busy} onClick={() => void run(refresh)}>
                  Refresh records
                </button>
              </div>
              {tab === 'overview' && (
                <>
                  <section className="office-metrics">
                    <article>
                      <span>Awaiting fulfilment</span>
                      <strong>{pending.length}</strong>
                    </article>
                    <article>
                      <span>Drink vouchers</span>
                      <strong>{data.balances[0]?.quantity ?? '0'}</strong>
                    </article>
                    <article>
                      <span>Messages awaiting approval</span>
                      <strong>
                        {
                          data.messages.filter((m) => m.state === 'draft')
                            .length
                        }
                      </strong>
                    </article>
                  </section>
                  <h2>Recent activity</h2>
                  <ActivityList events={data.activity.slice(0, 20)} />
                </>
              )}
              {tab === 'privileges' && (
                <>
                  <h2>Privileges</h2>
                  <div className="office-grid">
                    {privileges.map((p) => (
                      <article key={p.id} className="office-card">
                        <p className="office-eyebrow">
                          {p.kind} · {p.enabled ? 'Enabled' : 'Disabled'}
                        </p>
                        <h3>{p.title}</h3>
                        <p>{p.description}</p>
                        <p>
                          Opens {date(p.opensAt)}
                          <br />
                          Closes {p.closesAt ? date(p.closesAt) : 'No expiry'}
                        </p>
                        {p.kind === 'beauty' && (
                          <p>
                            {fmtMoney(p.minAmountPence!)}–
                            {fmtMoney(p.maxAmountPence!)}
                          </p>
                        )}
                        <p>
                          {p.redemption
                            ? `Claim ${p.redemption.state}`
                            : p.available
                              ? 'Available'
                              : p.unavailableReason}
                        </p>
                        <button
                          disabled={busy}
                          onClick={() => setEditingPrivilege(p)}
                        >
                          Edit privilege
                        </button>
                      </article>
                    ))}
                  </div>
                  <PrivilegeForm
                    key={editingPrivilege?.id ?? 'new'}
                    value={editingPrivilege}
                    busy={busy}
                    cancel={() => setEditingPrivilege(null)}
                    save={(value) =>
                      void run(async () => {
                        await mutate(
                          editingPrivilege
                            ? `/owner/privileges/${editingPrivilege.id}`
                            : '/owner/privileges',
                          value,
                          editingPrivilege ? 'PATCH' : 'POST',
                        );
                        setEditingPrivilege(null);
                      })
                    }
                  />
                </>
              )}
              {tab === 'redemptions' && (
                <>
                  <h2>Redemptions</h2>
                  {data.redemptions.length === 0 ? (
                    <p>No claims have been made.</p>
                  ) : (
                    data.redemptions.map((r) => (
                      <article className="office-card" key={r.id}>
                        <p className="office-eyebrow">{r.state}</p>
                        <h3>
                          {privileges.find((p) => p.id === r.privilegeId)
                            ?.title ?? 'Privilege'}
                        </h3>
                        <strong>
                          {r.amountPence !== null
                            ? fmtMoney(r.amountPence)
                            : `${r.quantity} drink vouchers`}
                        </strong>
                        <p>
                          Claimed {date(r.createdAt)}
                          <br />
                          Owner SMS: {r.notificationState}
                        </p>
                        {r.fulfilledAt && (
                          <p>Fulfilled {date(r.fulfilledAt)}</p>
                        )}
                        {r.state === 'pending' && (
                          <button
                            disabled={busy}
                            onClick={() =>
                              void run(() =>
                                mutate(`/owner/redemptions/${r.id}/fulfil`),
                              )
                            }
                          >
                            Mark as fulfilled
                          </button>
                        )}
                      </article>
                    ))
                  )}
                  <RewardForm
                    busy={busy}
                    save={(value) =>
                      void run(() => mutate('/owner/rewards/adjust', value))
                    }
                  />
                </>
              )}
              {tab === 'messages' && (
                <>
                  <h2>Scheduled correspondence</h2>
                  <section className="office-card">
                    <h3>Claim notifications to Arron</h3>
                    <p>
                      {data.transactionalSmsApproved
                        ? 'Future claims automatically queue an approved SMS to Arron. The global SMS switch must also be enabled.'
                        : 'Future claim notifications remain drafts until individually approved.'}
                    </p>
                    <button
                      disabled={busy}
                      onClick={() =>
                        void run(() =>
                          mutate('/owner/notification-policy', {
                            transactionalSmsApproved:
                              !data.transactionalSmsApproved,
                          }),
                        )
                      }
                    >
                      {data.transactionalSmsApproved
                        ? 'Pause automatic claim SMS'
                        : 'Approve SMS to Arron for future claims'}
                    </button>
                  </section>
                  <p>
                    Alise receives only approved scheduled messages. Claim
                    notifications go to Arron. Review the exact text and time
                    before approving.
                  </p>
                  <div className="office-grid">
                    {data.messages.map((m) => (
                      <article className="office-card" key={m.id}>
                        <p className="office-eyebrow">
                          {m.category === 'correspondence-alise'
                            ? 'Correspondence · To Alise'
                            : m.category === 'correspondence-arron'
                              ? 'Correspondence · To Arron'
                              : m.category === 'scheduled-alise'
                                ? 'To Alise'
                                : 'To Arron'}{' '}
                          · {m.state}
                        </p>
                        <h3>{m.label}</h3>
                        <p className="office-message">{m.body}</p>
                        <p>
                          {date(m.sendAt, m.timezone)} · {m.timezone}
                        </p>
                        <p>
                          {m.attempts} attempts
                          {m.providerSid ? ` · ${m.providerSid}` : ''}
                        </p>
                        {m.lastError && (
                          <p className="office-error">{m.lastError}</p>
                        )}
                        <div className="office-actions">
                          {[
                            'draft',
                            'approved',
                            'failed',
                            'cancelled',
                          ].includes(m.state) &&
                            m.category === 'scheduled-alise' && (
                              <button
                                disabled={busy}
                                onClick={() => setEditingMessage(m)}
                              >
                                Edit
                              </button>
                            )}
                          {m.state === 'draft' && (
                            <button
                              disabled={busy || !m.sendAt}
                              onClick={() =>
                                void run(() =>
                                  mutate(`/owner/messages/${m.id}/approve`),
                                )
                              }
                            >
                              Approve this SMS
                            </button>
                          )}
                          {['draft', 'approved', 'failed'].includes(
                            m.state,
                          ) && (
                            <button
                              disabled={busy}
                              onClick={() =>
                                void run(() =>
                                  mutate(`/owner/messages/${m.id}/cancel`),
                                )
                              }
                            >
                              Cancel
                            </button>
                          )}
                          {m.state === 'failed' && m.attempts < 5 && (
                            <button
                              disabled={busy}
                              onClick={() =>
                                void run(() =>
                                  mutate(`/owner/messages/${m.id}/retry`),
                                )
                              }
                            >
                              Approve retry
                            </button>
                          )}
                        </div>
                        {m.state === 'uncertain' && (
                          <p>
                            Check Twilio’s message log before taking further
                            action. Automatic resend is held.
                          </p>
                        )}
                      </article>
                    ))}
                  </div>
                  <MessageForm
                    key={editingMessage?.id ?? 'new'}
                    value={editingMessage}
                    busy={busy}
                    cancel={() => setEditingMessage(null)}
                    save={(value) =>
                      void run(async () => {
                        await mutate(
                          editingMessage
                            ? `/owner/messages/${editingMessage.id}`
                            : '/owner/messages',
                          value,
                          editingMessage ? 'PATCH' : 'POST',
                        );
                        setEditingMessage(null);
                      })
                    }
                  />
                </>
              )}
              {tab === 'history' && (
                <>
                  <h2>Message delivery history</h2>
                  {data.deliveries.length === 0 ? (
                    <p>No send attempts recorded.</p>
                  ) : (
                    <ol className="office-history">
                      {data.deliveries.map((log) => (
                        <li key={log.id}>
                          <strong>{log.state}</strong> · {date(log.createdAt)}
                          <p>
                            {data.messages.find((m) => m.id === log.messageId)
                              ?.label ?? log.messageId}
                          </p>
                          {log.error && <p>{log.error}</p>}
                          {log.providerSid && <code>{log.providerSid}</code>}
                        </li>
                      ))}
                    </ol>
                  )}
                  <h2>Meaningful activity</h2>
                  <ActivityList events={data.activity} />
                </>
              )}
              {tab === 'vault' && <VaultOffice />}
              {tab === 'correspondence' && <CorrespondenceDesk />}
              {tab === 'membership' && (
                <section className="office-card">
                  <h2>Alise’s membership</h2>
                  <p>
                    Create a secure single-use invitation for the Concierge
                    Desk. It expires after seven days; the member session lasts
                    thirty days.
                  </p>
                  <button
                    disabled={busy}
                    onClick={() =>
                      void run(async () => {
                        setInvitation(
                          await officeRequest('/owner/invitations', {}),
                        );
                        await refresh();
                      })
                    }
                  >
                    Create invitation
                  </button>
                  {invitation && (
                    <div className="office-invitation">
                      <p>Shown in this office session only. Keep it private.</p>
                      <label>
                        Invitation token
                        <textarea readOnly value={invitation.token} rows={3} />
                      </label>
                      <p>Expires {date(invitation.expiresAt)}</p>
                      <p>
                        Or send Alise this one-time link: it signs her in to her
                        correspondence on the device that opens it.
                      </p>
                      <button
                        onClick={() =>
                          void run(async () => {
                            await navigator.clipboard.writeText(
                              `${window.location.origin}/correspondence#invitation=${invitation.token}`,
                            );
                          })
                        }
                      >
                        Copy correspondence link
                      </button>
                      <button
                        onClick={() =>
                          void run(async () => {
                            await navigator.clipboard.writeText(
                              invitation.token,
                            );
                          })
                        }
                      >
                        Copy invitation
                      </button>
                      <button onClick={() => setInvitation(null)}>Hide</button>
                    </div>
                  )}
                  <hr />
                  <p>
                    Use recovery if the member’s device or invitation has been
                    lost. This signs Alise out and revokes unused invitations.
                  </p>
                  <button
                    disabled={busy}
                    onClick={() =>
                      void run(async () => {
                        await mutate('/owner/revoke-member-sessions');
                        setInvitation(null);
                      })
                    }
                  >
                    Revoke member sessions and invitations
                  </button>
                </section>
              )}
            </>
          )}
        </>
      )}
    </section>
  );
}
function ActivityList({ events }: { events: OwnerOverview['activity'] }) {
  return events.length ? (
    <ol className="office-history">
      {events.map((e) => (
        <li key={e.id}>
          <strong>{e.type.replaceAll('.', ' · ')}</strong>
          <span>{date(e.createdAt)}</span>
        </li>
      ))}
    </ol>
  ) : (
    <p>No activity recorded yet.</p>
  );
}
function PrivilegeForm({
  value,
  busy,
  save,
  cancel,
}: {
  value: Privilege | null;
  busy: boolean;
  save: (value: PrivilegeInput) => void;
  cancel: () => void;
}) {
  const [kind, setKind] = useState(value?.kind ?? 'beauty');
  const [error, setError] = useState('');
  function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    setError('');
    try {
      save({
        slug: String(form.get('slug')),
        title: String(form.get('title')),
        description: String(form.get('description')),
        kind,
        enabled: form.get('enabled') === 'on',
        opensAt: wallTimeToInstant(
          String(form.get('opensAt')),
          'Europe/London',
        ),
        closesAt: form.get('closesAt')
          ? wallTimeToInstant(String(form.get('closesAt')), 'Europe/London')
          : null,
        minAmountPence:
          kind === 'beauty' ? Number(form.get('minAmountPence')) : null,
        maxAmountPence:
          kind === 'beauty' ? Number(form.get('maxAmountPence')) : null,
      });
    } catch (error) {
      setError(errorText(error));
    }
  }
  return (
    <section className="office-card">
      <h2>{value ? 'Edit privilege' : 'Create privilege'}</h2>
      <form onSubmit={submit}>
        {error && <p role="alert">{error}</p>}
        <label>
          Identifier
          <input
            name="slug"
            defaultValue={value?.slug}
            required
            pattern="[a-z0-9-]{3,60}"
            readOnly={!!value}
          />
        </label>
        <label>
          Title
          <input
            name="title"
            required
            maxLength={100}
            defaultValue={value?.title}
          />
        </label>
        <label>
          Description
          <textarea
            name="description"
            maxLength={1000}
            defaultValue={value?.description}
          />
        </label>
        <label>
          Kind
          <select
            value={kind}
            disabled={!!value}
            onChange={(e) => setKind(e.target.value as 'beauty' | 'drink')}
          >
            <option value="beauty">Single-use beauty appointment</option>
            <option value="drink">Quantity-based drink vouchers</option>
          </select>
        </label>
        <label className="office-check">
          <input
            name="enabled"
            type="checkbox"
            defaultChecked={value?.enabled ?? true}
          />
          Enabled
        </label>
        <p>Privilege dates use Europe/London.</p>
        <label>
          Opens
          <input
            name="opensAt"
            type="datetime-local"
            required
            defaultValue={instantToWall(
              value?.opensAt ?? new Date().toISOString(),
              'Europe/London',
            )}
          />
        </label>
        <label>
          Closes (optional)
          <input
            name="closesAt"
            type="datetime-local"
            defaultValue={instantToWall(
              value?.closesAt ?? null,
              'Europe/London',
            )}
          />
        </label>
        {kind === 'beauty' && (
          <div className="office-form-row">
            <label>
              Minimum amount (pence)
              <input
                name="minAmountPence"
                type="number"
                min={1}
                max={2147483647}
                step={1}
                required
                defaultValue={value?.minAmountPence ?? 1}
              />
            </label>
            <label>
              Maximum amount (pence)
              <input
                name="maxAmountPence"
                type="number"
                min={1}
                max={2147483647}
                step={1}
                required
                defaultValue={value?.maxAmountPence ?? 100000}
              />
            </label>
          </div>
        )}
        <div className="office-actions">
          <button disabled={busy}>Save privilege</button>
          {value && (
            <button type="button" onClick={cancel}>
              Cancel editing
            </button>
          )}
        </div>
      </form>
    </section>
  );
}
function MessageForm({
  value,
  busy,
  save,
  cancel,
}: {
  value: ScheduledMessage | null;
  busy: boolean;
  save: (value: ScheduledMessageInput) => void;
  cancel: () => void;
}) {
  const [zone, setZone] = useState(value?.timezone ?? 'Europe/London');
  const [local, setLocal] = useState(
    instantToWall(value?.sendAt ?? null, value?.timezone ?? 'Europe/London'),
  );
  const [error, setError] = useState('');
  function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError('');
    const form = new FormData(e.currentTarget);
    try {
      save({
        label: String(form.get('label')),
        body: String(form.get('body')),
        timezone: zone,
        sendAt: local ? wallTimeToInstant(local, zone) : null,
      });
    } catch (error) {
      setError(errorText(error));
    }
  }
  let preview = 'Time undecided';
  try {
    if (local)
      preview = `${date(wallTimeToInstant(local, zone), zone)} (${wallTimeToInstant(local, zone)} UTC instant)`;
  } catch (error) {
    preview = errorText(error);
  }
  return (
    <section className="office-card">
      <h2>{value ? 'Edit scheduled SMS' : 'Draft a scheduled SMS'}</h2>
      <p>Saving a draft does not approve it for sending.</p>
      <form onSubmit={submit}>
        {error && <p role="alert">{error}</p>}
        <label>
          Label
          <input
            name="label"
            required
            maxLength={100}
            defaultValue={value?.label}
          />
        </label>
        <label>
          Message to Alise
          <textarea
            name="body"
            required
            maxLength={1600}
            rows={5}
            defaultValue={value?.body}
          />
        </label>
        <label>
          Timezone
          <select value={zone} onChange={(e) => setZone(e.target.value)}>
            <option>Europe/London</option>
            <option>America/Jamaica</option>
            <option>UTC</option>
          </select>
        </label>
        <label>
          Local date and time (leave blank if undecided)
          <input
            type="datetime-local"
            value={local}
            onChange={(e) => setLocal(e.target.value)}
          />
        </label>
        <p>{preview}</p>
        <div className="office-actions">
          <button disabled={busy}>Save draft</button>
          {value && (
            <button type="button" onClick={cancel}>
              Cancel editing
            </button>
          )}
        </div>
      </form>
    </section>
  );
}
function RewardForm({
  busy,
  save,
}: {
  busy: boolean;
  save: (value: {
    delta: string;
    reason: string;
    idempotencyKey: string;
  }) => void;
}) {
  const [retryKey, setRetryKey] = useState(() => crypto.randomUUID());
  return (
    <section className="office-card">
      <h2>Adjust drink vouchers</h2>
      <p>
        Positive quantities credit vouchers; negative quantities debit. Every
        adjustment is recorded.
      </p>
      <form
        onChange={() => setRetryKey(crypto.randomUUID())}
        onSubmit={(e) => {
          e.preventDefault();
          const f = new FormData(e.currentTarget);
          save({
            delta: String(f.get('delta')),
            reason: String(f.get('reason')),
            idempotencyKey: retryKey,
          });
        }}
      >
        <label>
          Quantity change
          <input
            name="delta"
            required
            pattern="-?[1-9][0-9]*"
            inputMode="text"
            placeholder="10 or -2"
          />
        </label>
        <label>
          Reason
          <input name="reason" required minLength={3} maxLength={280} />
        </label>
        <button disabled={busy}>Record adjustment</button>
      </form>
    </section>
  );
}
