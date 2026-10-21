/**
 * The birthday journey in the Owner Control Centre (ADR-020): the
 * milestone timeline (Jamaica time), room admissions, the Butler's journey
 * letters, the event inbox and the history. Every control is an owner-only
 * server action; nothing here can revoke an admission she has accepted or
 * touch a redemption, privilege, spin or prize.
 *
 * In TEST (`/concierge/owner/test`) the same screen drives the simulated
 * office in this tab (ADR-018) and the rehearsal clock decides "now".
 */
import { useCallback, useEffect, useState } from 'react';
import {
  JOURNEY_TIME_ZONE,
  type AdmissionRoomId,
  type MilestoneEffect,
  type OwnerJourney,
  type OwnerMilestone,
} from '../../shared/journey/contract';
import { ADMISSION_ROOM_NAMES } from '../../shared/journey/templates';
import { instantToWall, wallTimeToInstant } from '../../shared/concierge/time';
import {
  failureText,
  retrySms,
  type DeskResult,
} from '../correspondence/client/correspondenceApi';
import {
  commandMilestone,
  commandRoom,
  editMilestoneEffects,
  ownerCommunications,
  ownerJourney,
  rescheduleMilestone,
  retryEvent,
  reviewStory,
  type MilestoneCommand,
} from '../journey/client/journeyApi';
import { ownerVaults } from '../vault/client/vaultApi';
import type { OwnerVault } from '../../shared/concierge/types';
import { simulatedOwnerDocument } from '../rehearsal/mode';

const when = (at: string | null, zone: string) =>
  at
    ? new Intl.DateTimeFormat('en-GB', {
        weekday: 'short',
        day: 'numeric',
        month: 'short',
        hour: '2-digit',
        minute: '2-digit',
        timeZone: zone,
      }).format(new Date(at))
    : '—';
const jamaica = (at: string | null) => when(at, JOURNEY_TIME_ZONE);
const bothZones = (at: string | null) =>
  at ? `${jamaica(at)} Jamaica · ${when(at, 'Europe/London')} UK` : '—';

const PROGRESS: Record<OwnerMilestone['progress'], string> = {
  pending: 'Scheduled',
  held: 'Held',
  failed: 'Failed',
  triggered: 'Triggered',
  delivered: 'Delivered (in-app)',
  opened: 'Opened',
  completed: 'Completed',
};
const ROOM_STATES = {
  locked: 'Locked',
  invited: 'Invited — letter waiting',
  admitted: 'Admitted',
} as const;

/** Wording still to be written: such a letter is never sent (ADR-023). */
const hasPlaceholder = (m: OwnerMilestone) =>
  m.effects.some(
    (e) =>
      e.type === 'letter' && (e.title.includes('[[') || e.body.includes('[[')),
  );

interface Wording {
  key: string;
  index: number;
  title: string;
  body: string;
}

function effectText(effect: MilestoneEffect): string {
  if (effect.type === 'invite-room')
    return `Invite: ${ADMISSION_ROOM_NAMES[effect.room]} (Letter of Admission + Butler letter)`;
  if (effect.type === 'letter')
    return `Butler letter “${effect.title}”${effect.action ? ` with ${effect.action.kind === 'return' ? 'RETURN TO' : 'ENTER'} ${ADMISSION_ROOM_NAMES[effect.action.room]}` : ''}`;
  if (effect.type === 'open-entrance')
    return 'The doors may open (the clock holds at 00:00:10 until she presents her membership card)';
  return `Hook ${effect.name} ${JSON.stringify(effect.params)}`;
}

export function JourneyOffice() {
  const [data, setData] = useState<OwnerJourney | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [wall, setWall] = useState('');
  const [wording, setWording] = useState<Wording | null>(null);
  const [storyEditing, setStoryEditing] = useState<string | null>(null);
  const [storySms, setStorySms] = useState('');
  const [storyVaultId, setStoryVaultId] = useState('');
  const [mappingVaults, setMappingVaults] = useState<OwnerVault[]>([]);
  // The communication hold (ADR-021): actions that reach Alise wait for it.
  const [held, setHeld] = useState(false);

  const load = useCallback(async () => {
    const hold = await ownerCommunications();
    if (hold.ok) setHeld(hold.data.active);
    const result = await ownerJourney();
    if (result.ok) {
      setData(result.data);
      setError('');
    } else setError(failureText(result));
  }, []);

  useEffect(() => {
    let active = true;
    const refresh = () => {
      void ownerCommunications().then((hold) => {
        if (active && hold.ok) setHeld(hold.data.active);
      });
      void ownerJourney().then((result) => {
        if (!active) return;
        if (result.ok) setData(result.data);
        else setError(failureText(result));
      });
    };
    refresh();
    const timer = setInterval(refresh, 20_000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, []);

  async function run<T>(
    action: () => Promise<DeskResult<T>>,
    done: string,
    confirmText?: string,
  ) {
    if (confirmText && !window.confirm(confirmText)) return;
    setBusy(true);
    setNotice('');
    setError('');
    const result = await action();
    setBusy(false);
    if (!result.ok) {
      setError(failureText(result));
      return;
    }
    const outcome = result.data as {
      milestone?: { state?: string; lastError?: string };
    } | null;
    if (outcome?.milestone?.state === 'failed') {
      await load();
      setError(
        outcome.milestone.lastError ?? 'The scene could not be released.',
      );
      return;
    }
    setNotice(done);
    await load();
  }

  const milestoneCommand = (m: OwnerMilestone, command: MilestoneCommand) => {
    const texts: Record<MilestoneCommand, [string, string | undefined]> = {
      fire: [
        `“${m.title}” has been triggered.`,
        `Trigger “${m.title}” now? Alise receives whatever it delivers straight away. It cannot be undone.`,
      ],
      hold: [`“${m.title}” is held and will not fire.`, undefined],
      resume: [
        `“${m.title}” is scheduled again.`,
        Date.parse(m.fireAt) <= Date.parse(data?.now ?? '')
          ? `Its time (${jamaica(m.fireAt)} Jamaica) has passed, so resuming fires it immediately. Continue?`
          : undefined,
      ],
      retry: [
        `“${m.title}” was retried.`,
        `Retry “${m.title}”? Anything it already delivered is not repeated.`,
      ],
    };
    const [done, ask] = texts[command];
    void run(() => commandMilestone(m.key, command), done, ask);
  };

  const roomCommand = (room: AdmissionRoomId, command: 'invite' | 'withdraw') =>
    void run(
      () => commandRoom(room, command),
      command === 'invite'
        ? `${ADMISSION_ROOM_NAMES[room]}: invitation delivered.`
        : `${ADMISSION_ROOM_NAMES[room]}: invitation withdrawn.`,
      command === 'invite'
        ? `Introduce ${ADMISSION_ROOM_NAMES[room]} now? Alise receives a Butler letter at once and her Letter of Admission waits in the Lounge.`
        : `Withdraw the invitation to ${ADMISSION_ROOM_NAMES[room]}? The Butler letter she already has stays in her correspondence, but its button will no longer lead anywhere.`,
    );

  function saveWording(m: OwnerMilestone) {
    if (!wording) return;
    const title = wording.title.trim();
    const body = wording.body.trim();
    if (!title || !body) {
      setError('The letter needs a title and some words.');
      return;
    }
    const effects = m.effects.map((e, i) =>
      i === wording.index && e.type === 'letter' ? { ...e, title, body } : e,
    );
    setWording(null);
    void run(
      () => editMilestoneEffects(m.key, effects),
      `The wording of “${m.title}” is saved. Alise sees it only when it fires.`,
    );
  }

  function saveTime(m: OwnerMilestone) {
    let instant: string;
    try {
      instant = wallTimeToInstant(wall, m.timezone ?? JOURNEY_TIME_ZONE);
    } catch (e) {
      setError((e as Error).message);
      return;
    }
    setEditing(null);
    void run(
      () => rescheduleMilestone(m.key, instant),
      `“${m.title}” moved to ${jamaica(instant)} Jamaica (${when(instant, 'Europe/London')} UK).`,
    );
  }

  if (!data)
    return (
      <section aria-labelledby="journey-title">
        <h2 id="journey-title">Birthday journey</h2>
        {error ? (
          <p className="office-error" role="alert">
            {error}
          </p>
        ) : (
          <p>Loading the journey…</p>
        )}
      </section>
    );

  return (
    <section className="office-journey" aria-labelledby="journey-title">
      <h2 id="journey-title">Birthday journey</h2>
      <p className="office-hint">
        {simulatedOwnerDocument
          ? 'TEST: the simulated office and the rehearsal clock. Nothing here reaches Alise.'
          : 'LIVE: these controls act on Alise’s real journey.'}{' '}
        Server time {bothZones(data.now)}. Milestones fire from the server’s
        every-minute round; no browser needs to be open.
      </p>
      {(() => {
        const opening = data.milestones.find((m) => m.key === 'casino-opening');
        const spins = data.milestones.find(
          (m) => m.key === 'casino-opening-spins',
        );
        return opening &&
          opening.state === 'pending' &&
          spins &&
          spins.state !== 'pending' &&
          spins.state !== 'fired' ? (
          <p className="office-notice" role="note">
            The Grand Casino opens at {jamaica(opening.fireAt)} Jamaica but its
            opening spins are {spins.state}. Her admission letter will not
            promise spins, and the Casino will show none until you issue a batch
            or resume “{spins.title}”.
          </p>
        ) : null;
      })()}
      {held && (
        <p className="office-notice" role="note">
          Communications to Alise are on hold (see the top of the Control
          Centre). Milestones wait; triggering, introducing a room and retries
          that would reach her are disabled until you release.
        </p>
      )}
      {!data.smsEnabled && (
        <p className="office-notice">
          SMS sending is off: the Butler’s letters are delivered in the club
          (envelope, My Correspondence) and their SMS wait unsent.
        </p>
      )}
      {error && (
        <p className="office-error" role="alert">
          {error}
        </p>
      )}
      {notice && (
        <p className="office-notice" role="status">
          {notice}
        </p>
      )}

      <h3>Timeline</h3>
      <ol className="office-journey__timeline">
        {data.milestones.map((m) => (
          <li
            key={m.key}
            className="office-card office-journey__milestone"
            data-state={m.state}
            data-progress={m.progress}
          >
            <div className="office-journey__head">
              <strong>{m.title}</strong>
              <span className="office-journey__badge">
                {PROGRESS[m.progress]}
              </span>
            </div>
            <p>
              <time dateTime={m.fireAt}>{jamaica(m.fireAt)} Jamaica</time> ·{' '}
              {when(m.fireAt, 'Europe/London')} UK
            </p>
            {m.description && <p className="office-hint">{m.description}</p>}
            {m.storyManaged && (
              <div className="office-hint">
                <p>
                  {m.storyDisabled
                    ? 'Disabled: superseded scene.'
                    : m.manualOnly
                      ? 'Manual only: the clock cannot trigger this scene.'
                      : 'Scheduled only after you resume it.'}
                </p>
                <p>
                  Editorial review: {m.storyApproved ? 'approved' : 'required'}.
                </p>
                {!!m.requiresKeys?.length && (
                  <p>Required scenes: {m.requiresKeys.join(', ')}.</p>
                )}
                <p style={{ whiteSpace: 'pre-wrap' }}>
                  SMS:{' '}
                  {m.storySms ||
                    'No outbound text configured. Review before release.'}
                </p>
                {m.storyVaultId && (
                  <p>Physical compartment: {m.storyVaultId}</p>
                )}
                {m.effects
                  .filter((e) => e.type === 'letter')
                  .map(
                    (e, i) =>
                      e.type === 'letter' && (
                        <details key={i}>
                          <summary>Preview “{e.title}”</summary>
                          <p style={{ whiteSpace: 'pre-wrap' }}>{e.body}</p>
                        </details>
                      ),
                  )}
                {m.state !== 'fired' && !m.storyDisabled && (
                  <div className="office-actions">
                    <button
                      disabled={busy}
                      onClick={() => {
                        setStoryEditing(m.key);
                        void ownerVaults().then((result) => {
                          if (result.ok) setMappingVaults(result.data.vaults);
                          else
                            setError(
                              'The physical compartments could not be loaded.',
                            );
                        });
                        setStorySms(m.storySms ?? '');
                        setStoryVaultId(m.storyVaultId ?? '');
                      }}
                    >
                      Edit SMS and physical mapping
                    </button>
                    <button
                      disabled={busy || m.storyApproved}
                      onClick={() =>
                        void run(
                          () => reviewStory(m.key, { storyApproved: true }),
                          'Story reviewed. It remains held until you trigger or resume it.',
                          'Approve the exact copy, SMS and physical arrangements shown for this scene? This does not send it.',
                        )
                      }
                    >
                      Approve reviewed story
                    </button>
                  </div>
                )}
                {storyEditing === m.key && (
                  <div className="office-form-row">
                    <label>
                      Exact outbound SMS
                      <textarea
                        value={storySms}
                        maxLength={1600}
                        rows={8}
                        onChange={(e) => setStorySms(e.target.value)}
                      />
                    </label>
                    <label>
                      Physical gift compartment
                      <select
                        value={storyVaultId}
                        onChange={(e) => setStoryVaultId(e.target.value)}
                      >
                        <option value="">No physical gift mapping</option>
                        {mappingVaults.map((v) => (
                          <option value={v.id} key={v.id}>
                            No. {String(v.number).padStart(3, '0')} — {v.state}
                          </option>
                        ))}
                      </select>
                    </label>
                    <button
                      disabled={busy}
                      onClick={() => {
                        setStoryEditing(null);
                        void run(
                          () =>
                            reviewStory(m.key, {
                              storySms,
                              storyVaultId: storyVaultId || null,
                            }),
                          'Saved for review; approval cleared.',
                        );
                      }}
                    >
                      Save story setup
                    </button>
                    <button onClick={() => setStoryEditing(null)}>
                      Cancel
                    </button>
                  </div>
                )}
              </div>
            )}
            <ul className="office-journey__effects">
              {m.effects.map((effect, i) => (
                <li key={i}>{effectText(effect)}</li>
              ))}
            </ul>
            {m.firedAt && (
              <p>
                Fired {bothZones(m.firedAt)} (
                {m.firedVia === 'owner' ? 'by you' : 'on schedule'})
              </p>
            )}
            {m.letters.map((l) => (
              <p key={l.id} className="office-hint">
                Letter “{l.title}”:{' '}
                {l.openedAt ? `opened ${jamaica(l.openedAt)}` : 'not opened'}
              </p>
            ))}
            {m.rooms.map((r) => (
              <p key={r.roomId} className="office-hint">
                {ADMISSION_ROOM_NAMES[r.roomId]}: {ROOM_STATES[r.state]}
              </p>
            ))}
            {m.state !== 'fired' && hasPlaceholder(m) && (
              <p className="office-error" role="alert">
                Its letter still contains wording to write ([[…]]). It will not
                be sent until you replace it: at its time the milestone fails
                and nothing reaches Alise.
              </p>
            )}
            {m.state !== 'fired' && wording?.key === m.key && (
              <div className="office-form-row office-journey__wording">
                <label>
                  Letter title
                  <input
                    value={wording.title}
                    maxLength={120}
                    onChange={(e) =>
                      setWording({ ...wording, title: e.target.value })
                    }
                  />
                </label>
                <label>
                  Letter (Alise reads this exactly)
                  <textarea
                    value={wording.body}
                    maxLength={4000}
                    rows={8}
                    onChange={(e) =>
                      setWording({ ...wording, body: e.target.value })
                    }
                  />
                </label>
                <div className="office-actions">
                  <button disabled={busy} onClick={() => saveWording(m)}>
                    Save wording
                  </button>
                  <button disabled={busy} onClick={() => setWording(null)}>
                    Cancel
                  </button>
                </div>
              </div>
            )}
            {m.lastError && (
              <p className="office-error">
                Last error ({m.attempts} attempt
                {m.attempts === 1 ? '' : 's'}): {m.lastError}
              </p>
            )}
            {m.state !== 'fired' && editing === m.key && (
              <div className="office-form-row">
                <label>
                  New time ({m.timezone === 'Europe/London' ? 'UK' : 'Jamaica'})
                  <input
                    type="datetime-local"
                    value={wall}
                    onChange={(e) => setWall(e.target.value)}
                  />
                </label>
                <div className="office-actions">
                  <button disabled={busy} onClick={() => saveTime(m)}>
                    Save time
                  </button>
                  <button disabled={busy} onClick={() => setEditing(null)}>
                    Cancel
                  </button>
                </div>
              </div>
            )}
            {m.state !== 'fired' && (
              <div className="office-actions">
                <button
                  disabled={
                    busy ||
                    held ||
                    m.storyDisabled ||
                    (m.storyManaged && !m.storyApproved)
                  }
                  onClick={() => milestoneCommand(m, 'fire')}
                >
                  Trigger now
                </button>
                {m.state === 'held' ? (
                  <button
                    disabled={
                      busy ||
                      m.manualOnly ||
                      m.storyDisabled ||
                      (m.storyManaged && !m.storyApproved)
                    }
                    onClick={() => milestoneCommand(m, 'resume')}
                  >
                    Resume
                  </button>
                ) : (
                  <button
                    disabled={busy}
                    onClick={() => milestoneCommand(m, 'hold')}
                  >
                    Hold
                  </button>
                )}
                {m.state === 'failed' && (
                  <button
                    disabled={busy || held}
                    onClick={() => milestoneCommand(m, 'retry')}
                  >
                    Retry
                  </button>
                )}
                <button
                  disabled={busy}
                  onClick={() => {
                    setEditing(m.key);
                    setWall(
                      instantToWall(m.fireAt, m.timezone ?? JOURNEY_TIME_ZONE),
                    );
                  }}
                >
                  Change time
                </button>
                {m.effects.map((e, i) =>
                  e.type === 'letter' ? (
                    <button
                      key={i}
                      disabled={busy}
                      onClick={() =>
                        setWording({
                          key: m.key,
                          index: i,
                          title: e.title,
                          body: e.body,
                        })
                      }
                    >
                      Edit wording
                    </button>
                  ) : null,
                )}
              </div>
            )}
          </li>
        ))}
      </ol>

      <h3>Room admissions</h3>
      <ul className="office-journey__rooms">
        {data.admissions.map((a) => (
          <li
            key={a.roomId}
            className="office-card"
            data-room={a.roomId}
            data-state={a.state}
          >
            <div className="office-journey__head">
              <strong>{ADMISSION_ROOM_NAMES[a.roomId]}</strong>
              <span className="office-journey__badge">
                {ROOM_STATES[a.state]}
              </span>
            </div>
            {a.invitedAt && (
              <p>
                Invited {bothZones(a.invitedAt)}{' '}
                {a.invitedVia === 'owner'
                  ? '(by you)'
                  : `(milestone ${a.milestoneKey ?? ''})`}
              </p>
            )}
            {a.summons && (
              <p className="office-hint">
                Butler letter{' '}
                {a.summons.openedAt
                  ? `opened ${jamaica(a.summons.openedAt)}`
                  : 'not opened yet'}
                {a.summons.smsState ? ` · SMS ${a.summons.smsState}` : ''}
              </p>
            )}
            {a.admittedAt && <p>Admitted {bothZones(a.admittedAt)}</p>}
            <div className="office-actions">
              {a.state === 'locked' && (
                <button
                  disabled={busy || held}
                  onClick={() => roomCommand(a.roomId, 'invite')}
                >
                  Introduce now
                </button>
              )}
              {a.state === 'invited' && (
                <button
                  disabled={busy}
                  onClick={() => roomCommand(a.roomId, 'withdraw')}
                >
                  Withdraw invitation
                </button>
              )}
              {a.state === 'admitted' && (
                <span className="office-hint">
                  Permanent: an accepted admission cannot be revoked.
                </span>
              )}
            </div>
          </li>
        ))}
      </ul>

      <h3>Butler correspondence</h3>
      {data.letters.length === 0 ? (
        <p className="office-hint">No journey letters yet.</p>
      ) : (
        <ul className="office-history">
          {data.letters.map((l) => (
            <li key={l.id}>
              <p>
                <strong>{l.title}</strong>
                {l.action ? ` · ${l.action.label}` : ''}
              </p>
              <span>
                Delivered in-app {bothZones(l.publishedAt)} ·{' '}
                {l.openedAt ? `opened ${jamaica(l.openedAt)}` : 'unread'}
                {l.sms
                  ? ` · SMS ${l.sms.state}${l.sms.lastError ? ` (${l.sms.lastError})` : ''}`
                  : ''}
              </span>
              {l.sms &&
                (l.sms.state === 'failed' || l.sms.state === 'cancelled') &&
                !l.openedAt && (
                  <button
                    disabled={busy || held}
                    onClick={() =>
                      void run(
                        () => retrySms(l.sms!.id),
                        'The SMS is queued again.',
                        'Queue this letter’s SMS again? It is only sent while SMS sending is on.',
                      )
                    }
                  >
                    Retry SMS
                  </button>
                )}
            </li>
          ))}
        </ul>
      )}

      <h3>Events from the Casino and rewards</h3>
      {data.events.length === 0 ? (
        <p className="office-hint">No events yet.</p>
      ) : (
        <ul className="office-history">
          {data.events.map((e) => (
            <li key={e.id} data-state={e.state}>
              <p>
                <strong>{e.type}</strong> · {e.source} · {e.state}
              </p>
              <span>
                {bothZones(e.createdAt)} · key {e.idempotencyKey}
                {e.lastError ? ` · ${e.lastError}` : ''}
              </span>
              {e.state === 'failed' && (
                <button
                  disabled={busy || held}
                  onClick={() =>
                    void run(() => retryEvent(e.id), 'The event was retried.')
                  }
                >
                  Retry
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      <h3>History</h3>
      <ul className="office-history">
        {data.activity.map((a) => (
          <li key={a.id}>
            <p>{a.type.replace(/^journey\./, '')}</p>
            <span>
              {bothZones(a.createdAt)} · {JSON.stringify(a.detail)}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
