/**
 * TEST · Rehearsal: the universal rehearsal engine's controls (ADR-018).
 * The clock, the birthday timeline (fixed events and whatever the simulated
 * office has scheduled), scenarios, room launches, manual triggers, the
 * simulated notification log and reset. Every control is real: it changes
 * the rehearsal, never production.
 */
import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { TEST_ENV } from '../../../netlify/concierge/testing';
import { instantInZone } from '../club/domain/schedule';
import { JAMAICA_ZONE, UK_ZONE } from '../concierge/domain/time';
import { useRehearsalTime } from '../rehearsal/useRehearsalTime';
import {
  advanceRehearsal,
  followsRealTime,
  rehearsalNow,
  resetRehearsalClock,
  setRehearsalTime,
} from '../rehearsal/clock';
import {
  applyScenario,
  formatRehearsalTime,
  LAUNCH_TARGETS,
  launchRoom,
  nextEvent,
  presentCard,
  rehearsalLabel,
  resetEverything,
  SCENARIOS,
  simulateJackpot,
  TIMELINE,
} from '../rehearsal/engine';
import {
  deliverRehearsalLetter,
  deliverScheduledLettersNow,
  ensureRehearsalVaults,
  runSimRound,
  scheduledInOffice,
  sendScheduledSmsNow,
  simulateMemberRequest,
  simOwner,
  type UpcomingItem,
} from '../rehearsal/office';
import {
  NOTIFICATIONS_EVENT,
  simulatedNotifications,
  type SimNotification,
} from '../rehearsal/sim/legacy';
import type { OwnerVault } from '../../shared/concierge/types';

const MINUTE = 60_000;

function useOffice() {
  const [state, setState] = useState<
    | { kind: 'starting' }
    | { kind: 'ready' }
    | { kind: 'failed'; message: string }
  >({ kind: 'starting' });
  useEffect(() => {
    let active = true;
    runSimRound()
      .then(() => active && setState({ kind: 'ready' }))
      .catch((error: unknown) => {
        if (active)
          setState({
            kind: 'failed',
            message:
              error instanceof Error
                ? error.message
                : 'The simulated office could not start.',
          });
      });
    return () => {
      active = false;
    };
  }, []);
  return state;
}

export default function RehearsalDesk() {
  const office = useOffice();
  const now = useRehearsalTime(true);
  const time = formatRehearsalTime(now);
  const [busy, setBusy] = useState('');
  const [notice, setNotice] = useState('');
  const [upcoming, setUpcoming] = useState<UpcomingItem[]>([]);
  const [vaults, setVaults] = useState<OwnerVault[]>([]);
  const [log, setLog] = useState<SimNotification[]>(simulatedNotifications);

  const refresh = useCallback(async () => {
    try {
      setUpcoming(await scheduledInOffice());
      setVaults(
        (await simOwner<{ vaults: OwnerVault[] }>('/owner/vaults')).vaults,
      );
    } catch {
      // The office may still be starting; the next refresh will catch up.
    }
  }, []);

  useEffect(() => {
    if (office.kind !== 'ready') return;
    // Loading the office's schedule once it is ready is the point here.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void refresh();
    // The every-minute round, while TEST is open.
    const timer = setInterval(() => {
      void runSimRound().then(refresh);
    }, 20_000);
    return () => clearInterval(timer);
  }, [office.kind, refresh]);

  useEffect(() => {
    const update = () => setLog(simulatedNotifications());
    window.addEventListener(NOTIFICATIONS_EVENT, update);
    return () => window.removeEventListener(NOTIFICATIONS_EVENT, update);
  }, []);

  async function act(label: string, action: () => Promise<string | void>) {
    setBusy(label);
    setNotice('');
    try {
      const said = await action();
      await runSimRound();
      await refresh();
      setNotice(said ?? `${label}: done.`);
    } catch (error) {
      setNotice(
        `${label}: ${error instanceof Error ? error.message : 'did not finish.'}`,
      );
    } finally {
      setBusy('');
    }
  }

  const clockAct = (label: string, change: () => void) =>
    act(label, async () => {
      change();
      return `${label}. Rehearsal time is now ${formatRehearsalTime(rehearsalNow()).jm} in Jamaica.`;
    });

  const [when, setWhen] = useState('2026-10-24T00:00');
  const [zone, setZone] = useState<typeof UK_ZONE | typeof JAMAICA_ZONE>(
    JAMAICA_ZONE,
  );
  function setCustom(event: FormEvent) {
    event.preventDefault();
    const [date, clock] = when.split('T');
    if (!date || !clock) return;
    void clockAct(
      `Clock set to ${when} ${zone === UK_ZONE ? 'UK' : 'Jamaica'}`,
      () => setRehearsalTime(instantInZone({ date, time: clock }, zone)),
    );
  }

  const [request, setRequest] = useState(
    'Rehearsal request: could the Butler arrange breakfast on the terrace?',
  );

  const next = nextEvent(now);
  const events = [
    ...TIMELINE.map((e) => ({ ...e, source: 'club' as const })),
    ...upcoming.map((u) => ({
      id: u.id,
      label: u.label,
      at: u.at,
      watch: u.kind === 'letter' || u.kind === 'milestone' ? '/' : '',
      detail:
        u.kind === 'milestone'
          ? 'A journey milestone in the simulated office: it fires when the rehearsal clock reaches it (Office → journey to hold, move or trigger it).'
          : u.kind === 'letter'
            ? 'Scheduled in the simulated Correspondence Desk.'
            : u.kind === 'sms'
              ? 'Scheduled in the simulated SMS outbox (no real SMS).'
              : 'Scheduled in the simulated Gift Vault.',
      source: 'office' as const,
    })),
  ].sort((a, b) => a.at - b.at);

  return (
    <div className="rehearsal-desk" aria-busy={busy !== ''}>
      {office.kind === 'starting' && (
        <p className="cc-status" role="status">
          Starting the simulated club office in this browser (about 5 MB the
          first time)…
        </p>
      )}
      {office.kind === 'failed' && (
        <p className="cc-status" role="alert">
          The simulated office could not start on this device: {office.message}{' '}
          Nothing real was contacted. Try reloading; the room launches below
          still work.
        </p>
      )}
      <p className="cc-notice" role="status">
        {notice}
      </p>

      <section className="cc-card" aria-labelledby="cc-clock">
        <h2 id="cc-clock">Simulated clock</h2>
        <p className="cc-clock">
          <span>
            <small>Jamaica</small>
            {time.jm}
          </span>
          <span>
            <small>London</small>
            {time.uk}
          </span>
        </p>
        <p className="cc-small">
          {followsRealTime()
            ? 'Following the real clock.'
            : `Simulated · ${rehearsalLabel() ?? 'custom time'} · time runs on by itself.`}
        </p>
        <div className="cc-row">
          {[
            ['+1 min', MINUTE],
            ['+10 min', 10 * MINUTE],
            ['+1 hour', 60 * MINUTE],
            ['+6 hours', 360 * MINUTE],
            ['+1 day', 1440 * MINUTE],
          ].map(([label, ms]) => (
            <button
              key={label}
              type="button"
              disabled={busy !== ''}
              onClick={() =>
                void clockAct(`Advanced ${label}`, () =>
                  advanceRehearsal(ms as number),
                )
              }
            >
              {label}
            </button>
          ))}
        </div>
        <div className="cc-row">
          {next && (
            <button
              type="button"
              disabled={busy !== ''}
              onClick={() =>
                void clockAct(`Jumped to ${next.label}`, () =>
                  setRehearsalTime(next.at),
                )
              }
            >
              Advance to next event: {next.label}
            </button>
          )}
          <button
            type="button"
            disabled={busy !== ''}
            onClick={() =>
              void clockAct('Back to real time', resetRehearsalClock)
            }
          >
            Reset to real time
          </button>
        </div>
        <form className="cc-form" onSubmit={setCustom}>
          <label>
            Date and time
            <input
              type="datetime-local"
              value={when}
              onChange={(e) => setWhen(e.target.value)}
              required
            />
          </label>
          <label>
            Time zone
            <select
              value={zone}
              onChange={(e) => setZone(e.target.value as typeof zone)}
            >
              <option value={JAMAICA_ZONE}>Jamaica</option>
              <option value={UK_ZONE}>London</option>
            </select>
          </label>
          <button type="submit" disabled={busy !== ''}>
            Set the clock
          </button>
        </form>
      </section>

      <section className="cc-card" aria-labelledby="cc-scenarios">
        <h2 id="cc-scenarios">Scenarios</h2>
        <p className="cc-small">
          Sets the clock and this rehearsal’s records, then opens the page to
          watch.
        </p>
        <div className="cc-grid">
          {SCENARIOS.map((s, i) => (
            <button
              key={s.id}
              type="button"
              disabled={busy !== ''}
              onClick={() =>
                void act(s.label, async () => {
                  await applyScenario(s.id);
                })
              }
            >
              <strong>
                {i + 1}. {s.label}
              </strong>
              <small>{s.detail}</small>
            </button>
          ))}
        </div>
      </section>

      <section className="cc-card" aria-labelledby="cc-rooms">
        <h2 id="cc-rooms">Launch a room in rehearsal</h2>
        <p className="cc-small">
          Opens the room as Alise would find it. The rehearsal stays as it is
          when you move between rooms; the Dev disc brings you back.
        </p>
        <div className="cc-grid">
          {LAUNCH_TARGETS.map((t) => (
            <button
              key={t.id}
              type="button"
              disabled={busy !== ''}
              onClick={() =>
                void act(t.label, async () => {
                  await launchRoom(t.id);
                })
              }
            >
              <strong>{t.label}</strong>
              <small>{t.detail}</small>
            </button>
          ))}
          <button
            type="button"
            disabled={busy !== ''}
            onClick={() =>
              void act('Shopping Privilege', async () => {
                await LAUNCH_TARGETS.find(
                  (t) => t.id === 'departure-lounge',
                )!.launch();
                window.location.assign('/?concierge=shopping');
              })
            }
          >
            <strong>The Shopping Privilege (simulated)</strong>
            <small>
              Request an amount; the rehearsal has no ceiling and sends nothing.
            </small>
          </button>
        </div>
      </section>

      <section className="cc-card" aria-labelledby="cc-trigger">
        <h2 id="cc-trigger">Trigger an event now</h2>
        <div className="cc-grid">
          <button
            type="button"
            disabled={busy !== ''}
            onClick={() =>
              void act('Letter delivered', async () => {
                await deliverRehearsalLetter();
                return 'A rehearsal letter was delivered. It waits at the locked doors and in My Correspondence.';
              })
            }
          >
            <strong>Deliver a rehearsal letter now</strong>
            <small>Through the real Desk flow; its SMS is simulated.</small>
          </button>
          <button
            type="button"
            disabled={busy !== ''}
            onClick={() =>
              void act('Scheduled letters', async () => {
                const r = await deliverScheduledLettersNow();
                return `${r.published} scheduled letter(s) delivered now.`;
              })
            }
          >
            <strong>Deliver every scheduled letter now</strong>
            <small>As if each one’s time had come.</small>
          </button>
          <button
            type="button"
            disabled={busy !== ''}
            onClick={() =>
              void act('Scheduled SMS', async () => {
                const r = await sendScheduledSmsNow();
                return `${r.sent} simulated SMS sent and delivered. None left this tab.`;
              })
            }
          >
            <strong>Send every scheduled Butler SMS now</strong>
            <small>Simulated provider; nothing is sent.</small>
          </button>
          <button
            type="button"
            disabled={busy !== ''}
            onClick={() =>
              void act('Card presented', async () => {
                presentCard();
                return 'The membership card counts as presented in this rehearsal.';
              })
            }
          >
            <strong>Present the membership card</strong>
            <small>As if Alise scanned it.</small>
          </button>
          <button
            type="button"
            disabled={busy !== ''}
            onClick={() =>
              void act('Door ceremony', () =>
                applyScenario('early-admission-doors'),
              )
            }
          >
            <strong>Play the 19:00 door ceremony</strong>
            <small>21 Oct, twenty seconds to 19:00 UK, card presented.</small>
          </button>
          <button
            type="button"
            disabled={busy !== ''}
            onClick={() =>
              void act('Membership card', () => applyScenario('just-entered'))
            }
          >
            <strong>Reveal the membership card</strong>
            <small>The Butler’s induction in the lounge.</small>
          </button>
          <button
            type="button"
            disabled={busy !== ''}
            onClick={() =>
              void act('Casino jackpot', async () => {
                const released = await simulateJackpot();
                return `Jackpot recorded: the Vault Key awaits in the Casino and ${released} compartment(s) were released.`;
              })
            }
          >
            <strong>Simulate a Casino jackpot</strong>
            <small>Prize entitlement plus the casino compartment.</small>
          </button>
          <button
            type="button"
            disabled={busy !== ''}
            onClick={() =>
              void act('Compartments ready', async () => {
                const list = await ensureRehearsalVaults();
                let n = 0;
                for (const v of list)
                  if (v.state === 'locked') {
                    await simOwner(`/owner/vaults/${v.id}/ready`, {});
                    n++;
                  }
                return `${n} compartment(s) made ready.`;
              })
            }
          >
            <strong>Unlock every Gift Vault compartment</strong>
            <small>Each shows its clue; open it with its rehearsal code.</small>
          </button>
        </div>
        <form
          className="cc-form"
          onSubmit={(e) => {
            e.preventDefault();
            void act('Member request', async () => {
              await simulateMemberRequest(request);
              return 'Alise’s request arrived in Butler’s Office → requests (simulated).';
            });
          }}
        >
          <label>
            A word with the Butler, as Alise
            <textarea
              value={request}
              rows={2}
              maxLength={1000}
              onChange={(e) => setRequest(e.target.value)}
            />
          </label>
          <button type="submit" disabled={busy !== '' || !request.trim()}>
            Submit a simulated request
          </button>
        </form>
      </section>

      <section className="cc-card" aria-labelledby="cc-timeline">
        <h2 id="cc-timeline">Timeline</h2>
        <ol className="cc-timeline">
          {events.map((e) => {
            const state =
              e.at <= now ? 'past' : e.id === next?.id ? 'next' : 'future';
            const at = formatRehearsalTime(e.at);
            return (
              <li key={`${e.source}-${e.id}`} data-state={state}>
                <p>
                  <strong>{e.label}</strong>
                  <span>
                    {at.jm} JM · {at.uk} UK
                  </span>
                </p>
                <p className="cc-small">{e.detail}</p>
                <div className="cc-row">
                  <button
                    type="button"
                    disabled={busy !== ''}
                    onClick={() =>
                      void clockAct(`10 s before ${e.label}`, () =>
                        setRehearsalTime(e.at - 10_000),
                      )
                    }
                  >
                    Jump to 10 s before
                  </button>
                  {e.watch && (
                    <button
                      type="button"
                      onClick={() => {
                        setRehearsalTime(e.at - 10_000);
                        window.location.assign(e.watch);
                      }}
                    >
                      Watch it happen
                    </button>
                  )}
                </div>
              </li>
            );
          })}
        </ol>
      </section>

      <section className="cc-card" aria-labelledby="cc-codes">
        <h2 id="cc-codes">Rehearsal codes</h2>
        <p className="cc-small">
          Fake values that work only in this simulation.
        </p>
        <dl className="cc-codes">
          <dt>Membership card number</dt>
          <dd>{TEST_ENV.CREDENTIAL_MEMBERSHIP_CODE}</dd>
          <dt>Travel credential code</dt>
          <dd>{TEST_ENV.CREDENTIAL_DEPARTURE_CODE}</dd>
          <dt>Concierge owner key (TEST only)</dt>
          <dd>{TEST_ENV.CONCIERGE_OWNER_KEY}</dd>
          {vaults.map((v) => (
            <div key={v.id}>
              <dt>
                Vault No. {v.number} · {v.state} · {v.trigger}
              </dt>
              <dd>{v.backupCode}</dd>
            </div>
          ))}
        </dl>
      </section>

      <section className="cc-card" aria-labelledby="cc-log">
        <h2 id="cc-log">Simulated notifications</h2>
        <p className="cc-small">
          What the concierge would have sent to Arron or Alise. Butler SMS
          history is in Butler’s Office → messages.
        </p>
        {log.length === 0 ? (
          <p className="cc-small">Nothing yet.</p>
        ) : (
          <ol className="cc-log">
            {log.slice(0, 30).map((n, i) => (
              <li key={`${n.at}-${i}`}>
                <span>
                  {formatRehearsalTime(n.at).uk} UK ·{' '}
                  {n.channel === 'sms' ? 'SMS' : 'To Arron'} ·{' '}
                  {n.ok ? 'simulated' : 'simulated failure'}
                </span>
                <pre>{n.text}</pre>
              </li>
            ))}
          </ol>
        )}
      </section>

      <section className="cc-card" aria-labelledby="cc-reset">
        <h2 id="cc-reset">Reset</h2>
        <p className="cc-small">
          A clean start: real time, empty rehearsal records and a fresh
          simulated office. Alise’s records are never touched.
        </p>
        <button
          type="button"
          disabled={busy !== ''}
          onClick={() =>
            void act('Reset', async () => {
              await resetEverything();
              window.location.reload();
            })
          }
        >
          Reset the entire rehearsal
        </button>
      </section>
    </div>
  );
}
