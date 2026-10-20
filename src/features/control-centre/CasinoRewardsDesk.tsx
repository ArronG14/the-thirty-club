import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { officeRequest } from '../butlers-office/client';
import { instantToWall, wallTimeToInstant } from '../../shared/concierge/time';
import {
  JOURNEY_TIME_ZONE,
  type MilestoneInput,
} from '../../shared/journey/contract';
import { failureText } from '../correspondence/client/correspondenceApi';
import {
  commandMilestone,
  createMilestone,
} from '../journey/client/journeyApi';
import './casinoRewardsDesk.css';

interface Prize {
  id: string;
  title: string;
  description: string;
  presentation: string;
  kind: 'VOUCHER' | 'VAULT_GIFT';
  imageUrl: string | null;
  instructions: string;
  validUntil: string | null;
  active: boolean;
  ownerNotes: string;
  vaultId: string | null;
}
interface Batch {
  id: string;
  quantity: number;
  remaining: number;
  status: string;
  createdAt: string;
  allocations: { position: number; prize: Prize }[];
  spins: { position: number; prize: Prize | null }[];
}
interface Entitlement {
  id: string;
  state: string;
  kind: string;
  prize: Prize;
  vaultId: string | null;
  createdAt: string;
}
interface Request {
  id: string;
  entitlementId: string;
  state: string;
  requestedAt: string;
}
const empty: Omit<Prize, 'id'> = {
  title: '',
  description: '',
  presentation: '',
  kind: 'VOUCHER',
  imageUrl: null,
  instructions: '',
  validUntil: null,
  active: true,
  ownerNotes: '',
  vaultId: null,
};

export default function CasinoRewardsDesk() {
  const [prizes, setPrizes] = useState<Prize[]>([]);
  const [batches, setBatches] = useState<Batch[]>([]);
  const [entitlements, setEntitlements] = useState<Entitlement[]>([]);
  const [requests, setRequests] = useState<Request[]>([]);
  const [form, setForm] = useState<Omit<Prize, 'id'> & { id?: string }>(empty);
  const [quantity, setQuantity] = useState(3);
  const [scheduleAt, setScheduleAt] = useState('');
  const [selected, setSelected] = useState<string[]>([]);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const load = useCallback(async () => {
    const [catalogue, issued, rewards] = await Promise.all([
      officeRequest<{ prizes: Prize[] }>('/owner/casino/prizes'),
      officeRequest<{ batches: Batch[] }>('/owner/casino/batches'),
      officeRequest<{ entitlements: Entitlement[]; requests: Request[] }>(
        '/owner/vouchers',
      ),
    ]);
    setPrizes(catalogue.prizes);
    setBatches(issued.batches);
    setEntitlements(rewards.entitlements);
    setRequests(rewards.requests);
  }, []);
  useEffect(() => {
    const timer = window.setTimeout(() => {
      void load().catch((e) =>
        setMessage(
          e instanceof Error ? e.message : 'The office is unavailable.',
        ),
      );
    }, 0);
    return () => window.clearTimeout(timer);
  }, [load]);
  async function run(action: () => Promise<void>) {
    setBusy(true);
    setMessage('');
    try {
      await action();
      await load();
    } catch (e) {
      setMessage(
        e instanceof Error ? e.message : 'The request could not be completed.',
      );
    } finally {
      setBusy(false);
    }
  }
  function savePrize(event: FormEvent) {
    event.preventDefault();
    void run(async () => {
      const { id, ...payload } = form;
      await officeRequest(
        id ? `/owner/casino/prizes/${id}` : '/owner/casino/prizes',
        payload,
        id ? 'PATCH' : 'POST',
      );
      setForm(empty);
      setMessage('Prize saved. Existing winnings keep their original details.');
    });
  }
  function issue(event: FormEvent) {
    event.preventDefault();
    const fingerprint = JSON.stringify({ quantity, selected });
    const pending = sessionStorage.getItem('thirty-club:owner:pending-batch');
    const parsed = pending
      ? (JSON.parse(pending) as { fingerprint: string; key: string })
      : null;
    const key =
      parsed?.fingerprint === fingerprint ? parsed.key : crypto.randomUUID();
    sessionStorage.setItem(
      'thirty-club:owner:pending-batch',
      JSON.stringify({ fingerprint, key }),
    );
    void run(async () => {
      await officeRequest('/owner/casino/batches', {
        quantity,
        prizeIds: selected,
        idempotencyKey: key,
        announce: true,
      });
      sessionStorage.removeItem('thirty-club:owner:pending-batch');
      setSelected([]);
      setMessage(`${quantity} spins issued.`);
    });
  }
  function schedule(event: FormEvent) {
    event.preventDefault();
    if (!scheduleAt) return;
    const fingerprint = JSON.stringify({ quantity, selected, scheduleAt });
    const pending = sessionStorage.getItem(
      'thirty-club:owner:pending-milestone',
    );
    const parsed = pending
      ? (JSON.parse(pending) as { fingerprint: string; key: string })
      : null;
    const key =
      parsed?.fingerprint === fingerprint
        ? parsed.key
        : `casino-spins-${crypto.randomUUID()}`;
    sessionStorage.setItem(
      'thirty-club:owner:pending-milestone',
      JSON.stringify({ fingerprint, key }),
    );
    void run(async () => {
      // Jamaica wall-clock time, never the owner's browser zone (ADR-020).
      const fireAt = wallTimeToInstant(scheduleAt, JOURNEY_TIME_ZONE);
      const input: MilestoneInput = {
        key,
        title: `${quantity} Casino spins`,
        description: 'Owner-scheduled Casino spins',
        fireAt,
        effects: [
          {
            type: 'hook',
            name: 'casino.spins.issue',
            params: { quantity, prizeIds: selected, announce: true },
          },
        ],
      };
      const created = await createMilestone(input);
      if (!created.ok) throw new Error(failureText(created));
      // New milestones start held; this form's submission arms it. It still
      // waits while communications to Alise are held (ADR-021).
      const armed = await commandMilestone(key, 'resume');
      if (!armed.ok) throw new Error(failureText(armed));
      sessionStorage.removeItem('thirty-club:owner:pending-milestone');
      setMessage(
        `Casino spins scheduled for ${new Intl.DateTimeFormat('en-GB', {
          weekday: 'short',
          day: 'numeric',
          month: 'short',
          hour: '2-digit',
          minute: '2-digit',
          timeZone: JOURNEY_TIME_ZONE,
        }).format(new Date(fireAt))} Jamaica, in the Birthday Journey.`,
      );
      setScheduleAt('');
      setSelected([]);
    });
  }
  const togglePrize = (id: string) =>
    setSelected((all) =>
      all.includes(id) ? all.filter((x) => x !== id) : [...all, id],
    );
  const titleOf = (id: string) =>
    entitlements.find((e) => e.id === id)?.prize.title ?? 'Voucher';
  return (
    <section className="cr-desk" aria-labelledby="cr-title">
      <p className="cc-eyebrow">The Thirty Club · Owner only</p>
      <h2 id="cr-title">Casino & rewards</h2>
      <p>
        Spins and prizes are committed in the club’s private records. Alise sees
        each result only when she spins.
      </p>
      {message && (
        <p role="status" className="cr-message">
          {message}
        </p>
      )}
      <div className="cr-grid">
        <section className="cr-card">
          <h3>Issue Casino spins</h3>
          <form onSubmit={issue}>
            <label>
              Spins{' '}
              <input
                type="number"
                min="1"
                max="50"
                value={quantity}
                onChange={(e) => setQuantity(Number(e.target.value))}
              />
            </label>
            <fieldset>
              <legend>Prizes in this batch · {selected.length} selected</legend>
              {prizes
                .filter((p) => p.active)
                .map((p) => (
                  <label key={p.id} className="cr-choice">
                    <input
                      type="checkbox"
                      checked={selected.includes(p.id)}
                      onChange={() => togglePrize(p.id)}
                    />
                    {p.title}{' '}
                    <small>
                      {p.kind === 'VOUCHER' ? 'Voucher' : 'Gift Vault'}
                    </small>
                  </label>
                ))}
            </fieldset>
            <p>
              The prizes will each land on a different spin. Unselected spins
              are quiet turns.
            </p>
            <button disabled={busy || selected.length > quantity}>
              Issue spins now
            </button>
          </form>
        </section>
        <section className="cr-card">
          <h3>Schedule these spins</h3>
          <p>
            The Birthday Journey will issue the spins at this time using the
            quantity and prizes selected above.
          </p>
          <form onSubmit={schedule}>
            <label>
              Delivery date and time (Jamaica){' '}
              <input
                required
                type="datetime-local"
                value={scheduleAt}
                onChange={(e) => setScheduleAt(e.target.value)}
              />
            </label>
            <button disabled={busy || selected.length > quantity}>
              Schedule through Journey
            </button>
          </form>
        </section>
        <section className="cr-card">
          <h3>{form.id ? 'Edit prize' : 'Add prize'}</h3>
          <form onSubmit={savePrize}>
            <label>
              Name{' '}
              <input
                required
                maxLength={100}
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
              />
            </label>
            <label>
              Type{' '}
              <select
                value={form.kind}
                onChange={(e) =>
                  setForm({
                    ...form,
                    kind: e.target.value as Prize['kind'],
                    vaultId: null,
                  })
                }
              >
                <option value="VOUCHER">Voucher</option>
                <option value="VAULT_GIFT">Gift Vault</option>
              </select>
            </label>
            <label>
              Description{' '}
              <textarea
                maxLength={1000}
                value={form.description}
                onChange={(e) =>
                  setForm({ ...form, description: e.target.value })
                }
              />
            </label>
            <label>
              Member presentation{' '}
              <textarea
                maxLength={1000}
                value={form.presentation}
                onChange={(e) =>
                  setForm({ ...form, presentation: e.target.value })
                }
              />
            </label>
            <label>
              Image URL{' '}
              <input
                value={form.imageUrl ?? ''}
                onChange={(e) =>
                  setForm({ ...form, imageUrl: e.target.value || null })
                }
              />
            </label>
            <label>
              Redemption instructions{' '}
              <textarea
                maxLength={1000}
                value={form.instructions}
                onChange={(e) =>
                  setForm({ ...form, instructions: e.target.value })
                }
              />
            </label>
            <label>
              Valid until (Jamaica){' '}
              <input
                type="datetime-local"
                value={instantToWall(
                  form.validUntil ?? null,
                  JOURNEY_TIME_ZONE,
                )}
                onChange={(e) =>
                  setForm({
                    ...form,
                    validUntil: e.target.value
                      ? wallTimeToInstant(e.target.value, JOURNEY_TIME_ZONE)
                      : null,
                  })
                }
              />
            </label>
            {form.kind === 'VAULT_GIFT' && (
              <label>
                Casino Vault compartment ID{' '}
                <input
                  required
                  value={form.vaultId ?? ''}
                  onChange={(e) =>
                    setForm({ ...form, vaultId: e.target.value || null })
                  }
                />
              </label>
            )}
            <label>
              Owner notes{' '}
              <textarea
                maxLength={2000}
                value={form.ownerNotes}
                onChange={(e) =>
                  setForm({ ...form, ownerNotes: e.target.value })
                }
              />
            </label>
            <label className="cr-choice">
              <input
                type="checkbox"
                checked={form.active}
                onChange={(e) => setForm({ ...form, active: e.target.checked })}
              />{' '}
              Active
            </label>
            <div className="cr-actions">
              <button disabled={busy}>Save prize</button>
              {form.id && (
                <button type="button" onClick={() => setForm(empty)}>
                  Cancel edit
                </button>
              )}
            </div>
          </form>
        </section>
      </div>
      <section className="cr-card">
        <h3>Prize catalogue</h3>
        <ul>
          {prizes.map((p) => (
            <li key={p.id}>
              <strong>{p.title}</strong> · {p.kind} ·{' '}
              {p.active ? 'Active' : 'Inactive'}{' '}
              <button disabled={busy} onClick={() => setForm(p)}>
                Edit
              </button>
            </li>
          ))}
        </ul>
      </section>
      <section className="cr-card">
        <h3>Spin batches</h3>
        <ul>
          {batches.map((b) => (
            <li key={b.id}>
              <strong>{b.quantity} spins</strong> · {b.remaining} remaining ·{' '}
              {b.status} ·{' '}
              {new Date(b.createdAt).toLocaleString('en-GB', {
                timeZone: 'America/Jamaica',
              })}
              <details>
                <summary>Inspect spins and prizes</summary>
                <ol>
                  {Array.from({ length: b.quantity }, (_, i) => (
                    <li key={i}>
                      Spin {i + 1}:{' '}
                      {b.spins.find((s) => s.position === i + 1)?.prize
                        ?.title ??
                        (b.spins.some((s) => s.position === i + 1)
                          ? 'No win'
                          : (b.allocations.find((a) => a.position === i + 1)
                              ?.prize.title ?? 'No win'))}{' '}
                      {b.spins.some((s) => s.position === i + 1)
                        ? '· played'
                        : '· awaiting'}
                    </li>
                  ))}
                </ol>
              </details>
              {b.status === 'active' && b.remaining === b.quantity && (
                <button
                  disabled={busy}
                  onClick={() => {
                    if (
                      !window.confirm(
                        `Cancel this unplayed batch of ${b.quantity} spins? An announcement not yet delivered to Alise is withdrawn; one already delivered stays in her letters.`,
                      )
                    )
                      return;
                    void run(async () => {
                      const result = await officeRequest<{
                        announcementDelivered?: boolean;
                      }>(`/owner/casino/batches/${b.id}/cancel`, {});
                      if (result.announcementDelivered)
                        setMessage(
                          'Batch cancelled. Its announcement had already reached Alise: consider a letter explaining the change.',
                        );
                    });
                  }}
                >
                  Cancel unplayed batch
                </button>
              )}
            </li>
          ))}
        </ul>
      </section>
      <section className="cr-card">
        <h3>Voucher requests</h3>
        <ul>
          {requests.map((r) => (
            <li key={r.id}>
              <strong>{titleOf(r.entitlementId)}</strong> · {r.state} ·{' '}
              {new Date(r.requestedAt).toLocaleString('en-GB', {
                timeZone: 'America/Jamaica',
              })}
              {r.state === 'REQUESTED' && (
                <span className="cr-actions">
                  <button
                    disabled={busy}
                    onClick={() =>
                      void run(async () => {
                        await officeRequest(
                          `/owner/vouchers/${r.id}/fulfil`,
                          {},
                        );
                      })
                    }
                  >
                    Mark fulfilled
                  </button>
                  <button
                    disabled={busy}
                    onClick={() =>
                      void run(async () => {
                        await officeRequest(
                          `/owner/vouchers/${r.id}/cancel`,
                          {},
                        );
                      })
                    }
                  >
                    Return to available
                  </button>
                </span>
              )}
            </li>
          ))}
        </ul>
      </section>
      <section className="cr-card">
        <h3>Gift Vault prizes</h3>
        <ul>
          {entitlements
            .filter((e) => e.kind === 'VAULT_GIFT')
            .map((e) => (
              <li key={e.id}>
                {e.prize.title} · {e.state} · compartment {e.vaultId}
                {e.state === 'REVEALED' && (
                  <button
                    disabled={busy}
                    onClick={() =>
                      void run(async () => {
                        await officeRequest(
                          `/owner/casino/gifts/${e.id}/fulfil`,
                          {},
                        );
                      })
                    }
                  >
                    Mark physically fulfilled
                  </button>
                )}
              </li>
            ))}
        </ul>
      </section>
      <p>
        The Birthday Journey owns delivery and admission. A scheduled batch
        appears here when its milestone fires.
      </p>
    </section>
  );
}
