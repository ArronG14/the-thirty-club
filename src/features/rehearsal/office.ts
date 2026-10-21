/**
 * REHEARSAL ONLY. The owner's hand on the simulated office from any
 * rehearsal document: the Dev Menu and the TEST Control Centre use these to
 * seed and trigger things exactly as the real Owner Console would, through
 * the same `/api/v1` handlers, as the simulated owner.
 */
import type { OwnerVault } from '../../shared/concierge/types';
import type { OwnerJourney } from '../../shared/journey/contract';
import {
  isAdmissionRoom,
  type AdmissionRoomId,
} from '../../shared/journey/contract';
import { OWNER_PREFIX } from '../owner/session';
import { simulationActive } from './mode';

export class SimulationUnavailable extends Error {}

/** One request to the simulated office, as its owner. */
export async function simOwner<T>(
  path: string,
  body?: unknown,
  method: 'GET' | 'POST' | 'PATCH' = body === undefined ? 'GET' : 'POST',
): Promise<T> {
  if (!simulationActive)
    throw new SimulationUnavailable('Rehearsal controls work only in TEST.');
  const { simOffice } = await import('./sim/v1');
  const office = await simOffice();
  const response = await office.handle(
    new Request(`${window.location.origin}/api/v1${path}`, {
      method,
      headers: {
        'content-type': 'application/json',
        'x-concierge-request': '1',
      },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    }),
    'owner',
  );
  const data = (await response.json()) as T & { message?: string };
  if (!response.ok)
    throw new SimulationUnavailable(
      data.message ?? 'The simulated office refused.',
    );
  return data;
}

/** One request to the simulated office, as Alise (always signed in). */
async function simMember<T>(path: string, body?: unknown): Promise<T> {
  if (!simulationActive)
    throw new SimulationUnavailable('Rehearsal controls work only in TEST.');
  const { simOffice } = await import('./sim/v1');
  const office = await simOffice();
  const response = await office.handle(
    new Request(`${window.location.origin}/api/v1${path}`, {
      method: body === undefined ? 'GET' : 'POST',
      headers: {
        'content-type': 'application/json',
        'x-concierge-request': '1',
      },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    }),
    'member',
  );
  const data = (await response.json()) as T & { message?: string };
  if (!response.ok)
    throw new SimulationUnavailable(
      data.message ?? 'The simulated office refused.',
    );
  return data;
}

/**
 * Admissions in the simulated office (ADR-020), through the real owner and
 * member actions: `admitted` rooms are invited and accepted, `ceremony`
 * rooms are invited fresh so their Letter of Admission can be rehearsed
 * (a rehearsal may start a ceremony again; the real office never can).
 * `withdrawn` rooms are returned to locked for a moment before them.
 */
export async function rehearseAdmissions(
  admitted: readonly AdmissionRoomId[],
  ceremony: readonly AdmissionRoomId[] = [],
  withdrawn: readonly AdmissionRoomId[] = [],
) {
  const { simOffice } = await import('./sim/v1');
  const office = await simOffice();
  for (const room of [...ceremony, ...withdrawn])
    await office.pg.query(
      'delete from public.ttc_room_admissions where room_id = $1',
      [room],
    );
  for (const room of [...admitted, ...ceremony])
    await simOwner(`/owner/journey/rooms/${room}/invite`, {});
  for (const room of admitted)
    await simMember(`/journey/admissions/${room}/accept`, {});
}

/** Where a launch leaves the admissions its destination page applies. */
export const PENDING_ADMISSIONS_KEY = `${OWNER_PREFIX}journey-admissions`;

/**
 * Applies the admissions a launch asked for (once), on the page the launch
 * opened. Called by the journey provider before its first read.
 */
export async function applyPendingAdmissions() {
  let pending: {
    admitted?: unknown;
    ceremony?: unknown;
    withdraw?: unknown;
    fire?: unknown;
    resume?: unknown;
    spins?: unknown;
    card?: unknown;
  } | null;
  try {
    pending = JSON.parse(
      sessionStorage.getItem(PENDING_ADMISSIONS_KEY) ?? 'null',
    ) as typeof pending;
    sessionStorage.removeItem(PENDING_ADMISSIONS_KEY);
  } catch {
    return;
  }
  if (!pending) return;
  const rooms = (value: unknown) =>
    Array.isArray(value) ? value.filter(isAdmissionRoom) : [];
  await rehearseAdmissions(
    rooms(pending.admitted),
    rooms(pending.ceremony),
    rooms(pending.withdraw),
  );
  if (Array.isArray(pending.resume))
    for (const key of pending.resume)
      if (typeof key === 'string') {
        await fillRehearsalWording(key);
        // Already armed or fired in an earlier rehearsal: nothing to do.
        await simOwner(`/owner/journey/milestones/${key}/resume`, {}).catch(
          () => undefined,
        );
      }
  if (Array.isArray(pending.fire))
    for (const key of pending.fire)
      if (typeof key === 'string') await fireRehearsalMilestone(key);
  if (typeof pending.spins === 'number' && pending.spins > 0)
    await issueRehearsalSpins(pending.spins);
  // The card last: a failure here never leaves the moment half-prepared.
  try {
    if (pending.card === true) await rehearseCardPresented();
    if (pending.card === false) await rehearseCardHidden();
  } catch (error) {
    console.error('[rehearsal] the TEST card could not be prepared', error);
  }
}

const REHEARSAL_VOUCHER = 'Rehearsal voucher · two cocktails';

/** Rehearsal wording for a letter whose LIVE wording is still to be written. */
const REHEARSAL_CLUE =
  'beneath the second cushion (a rehearsal clue: write the real one in the LIVE Control Centre)';

/**
 * A milestone launched in TEST whose letter still holds a [[placeholder]]
 * would fail by design (ADR-023). The TEST office gets rehearsal wording;
 * LIVE is never touched.
 */
async function fillRehearsalWording(key: string) {
  try {
    const journey = await simOwner<OwnerJourney>('/owner/journey');
    const milestone = journey.milestones.find((m) => m.key === key);
    if (!milestone || milestone.state === 'fired') return;
    const effects = milestone.effects.map((e) =>
      e.type === 'letter'
        ? {
            ...e,
            title: e.title.replace(/\[\[[^\]]*\]\]/g, 'A letter'),
            body: e.body.replace(/\[\[[^\]]*\]\]/g, REHEARSAL_CLUE),
          }
        : e,
    );
    if (JSON.stringify(effects) !== JSON.stringify(milestone.effects))
      await simOwner(`/owner/journey/milestones/${key}`, { effects }, 'PATCH');
  } catch {
    // The launch continues; the TEST timeline shows the milestone's state.
  }
}

/**
 * The TEST membership card presented through the real handlers: the
 * simulated concierge examines its link token, then the TEST office records
 * it. Called while the launch is being applied, so it speaks to both
 * directly (a page fetch would wait for this very launch).
 */
async function rehearseCardPresented() {
  const [{ simConcierge }, { simOffice }, sessions, engine] = await Promise.all(
    [
      import('./sim/legacy'),
      import('./sim/v1'),
      import('../concierge/client/sessionStore'),
      import('./engine'),
    ],
  );
  const bearer = (token: string | undefined): Record<string, string> =>
    token ? { authorization: `Bearer ${token}` } : {};
  const activated = await simConcierge()(
    new Request(`${window.location.origin}/api/concierge/activate`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...bearer(sessions.activeSession()?.token),
      },
      body: JSON.stringify({ token: engine.REHEARSAL_CARD_TOKEN }),
    }),
    'rehearsal',
  );
  if (!activated.ok) throw new Error('The simulated concierge refused.');
  const { session } = (await activated.json()) as { session: string };
  const saved = sessions.saveSession(session);
  const office = await simOffice();
  const recorded = await office.handle(
    new Request(`${window.location.origin}/api/v1/auth/member/card`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-concierge-request': '1',
        ...bearer(saved?.token),
      },
      body: '{}',
    }),
    'member',
  );
  if (!recorded.ok) throw new Error('The TEST office did not record the card.');
}

/**
 * The card is still hidden: the TEST office forgets an earlier
 * presentation (the launching page has already cleared this tab's card).
 */
async function rehearseCardHidden() {
  const { simOffice } = await import('./sim/v1');
  const office = await simOffice();
  await office.pg.query('delete from public.ttc_membership_card');
}

/**
 * A rehearsal batch of Casino spins, issued through the real owner action
 * (the Casino engine decides positions and results), with one rehearsal
 * voucher among them so the wallet, request and fulfilment can be rehearsed.
 */
export async function issueRehearsalSpins(quantity: number) {
  const { prizes } = await simOwner<{
    prizes: { id: string; title: string; slug?: string | null }[];
  }>('/owner/casino/prizes');
  // The story's opening (ADR-024): Bring Me a Drink on the last spin.
  const drinks = prizes.find((p) => p.slug === 'jamaica-drinks')?.id;
  if (drinks) {
    await simOwner('/owner/casino/batches', {
      quantity,
      prizeIds: [drinks],
      prizePositions: [quantity],
      idempotencyKey: `rehearsal-launch-${Date.now()}`,
      announce: false,
    });
    return;
  }
  let voucher = prizes.find((p) => p.title === REHEARSAL_VOUCHER)?.id;
  if (!voucher) {
    const created = await simOwner<{ prize: { id: string } }>(
      '/owner/casino/prizes',
      {
        title: REHEARSAL_VOUCHER,
        description: 'Rehearsal only. Nothing is ordered.',
        presentation: 'A toast, in rehearsal.',
        kind: 'VOUCHER',
        imageUrl: null,
        instructions: '',
        validUntil: null,
        active: true,
        ownerNotes: 'Created by a rehearsal launch',
        vaultId: null,
      },
    );
    voucher = created.prize.id;
  }
  await simOwner('/owner/casino/batches', {
    quantity,
    prizeIds: [voucher],
    idempotencyKey: `rehearsal-launch-${Date.now()}`,
    announce: false,
  });
}

/**
 * The 23 October afternoon (ADR-024) in the TEST office: Nyla's film prize
 * gets the five-second test film and three spins put it on the third.
 */
export async function rehearseFilmSpins() {
  const { prizes } = await simOwner<{
    prizes: {
      id: string;
      slug?: string | null;
      title: string;
      description: string;
      presentation: string;
      instructions: string;
      ownerNotes: string;
    }[];
  }>('/owner/casino/prizes');
  const film = prizes.find((p) => p.slug === 'nyla-film');
  if (!film) return;
  await simOwner(
    `/owner/casino/prizes/${film.id}`,
    {
      title: film.title,
      description: film.description,
      presentation: film.presentation,
      kind: 'VOUCHER',
      imageUrl: null,
      instructions: film.instructions,
      validUntil: null,
      active: true,
      ownerNotes: film.ownerNotes,
      vaultId: null,
      videoUrl: '/media/screening/screening-test-5s.mp4',
    },
    'PATCH',
  );
  await simOwner('/owner/casino/batches', {
    quantity: 3,
    prizeIds: [film.id],
    prizePositions: [3],
    idempotencyKey: `rehearsal-film-${Date.now()}`,
    announce: false,
  });
}

/** A rehearsal message on the TEST office's birthday card (ADR-024). */
export async function rehearseBirthdayCard() {
  await simOwner('/owner/card', {
    message:
      'Rehearsal card.\n\nThe words you write in the Control Centre (Birthday card) appear here, exactly as she will read them.',
    signature: 'Rehearsal',
    opensAt: '2026-10-24T05:00:00.000Z',
  });
}

let launchIntents: Promise<void> | null = null;
/** Applies this page's launch intents once; every simulated request waits. */
export function applyLaunchIntents(): Promise<void> {
  launchIntents ??= applyPendingAdmissions().catch((error: unknown) => {
    console.error('[rehearsal] launch could not be prepared', error);
  });
  return launchIntents;
}

/** Triggers a journey milestone now, as the owner would from TEST. */
export async function fireRehearsalMilestone(key: string) {
  await simOwner(`/owner/journey/milestones/${key}/fire`, {});
}

/** Runs the simulated every-minute round now (letters due, SMS "sent"). */
export async function runSimRound() {
  const { simOffice } = await import('./sim/v1');
  return (await simOffice()).round();
}

/* ---------- Gift Vault seed ---------- */

const REHEARSAL_COMPARTMENTS = [
  {
    displayNumber: 1,
    clue: 'Rehearsal clue: where the morning coffee is made, look beneath the saucer.',
    giftLocation:
      'Rehearsal location: the top drawer of the bedside table (simulated).',
    trigger: 'manual',
    availableAt: null,
    casinoRewardId: null,
    ready: true,
  },
  {
    displayNumber: 2,
    clue: 'Rehearsal clue: the compartment that opens at noon in Jamaica.',
    giftLocation: 'Rehearsal location: behind the second cushion (simulated).',
    trigger: 'scheduled',
    availableAt: '2026-10-24T17:00:00.000Z',
    casinoRewardId: null,
    ready: false,
  },
  {
    displayNumber: 3,
    clue: 'Rehearsal clue: won at the Grand Casino’s slot machine.',
    giftLocation:
      'Rehearsal location: inside the wardrobe, left shelf (simulated).',
    trigger: 'casino',
    availableAt: null,
    casinoRewardId: 'casino.vault-key-one',
    ready: false,
  },
] as const;

/** Three rehearsal compartments, created once per simulation. */
export async function ensureRehearsalVaults(): Promise<OwnerVault[]> {
  const listed = await simOwner<{ vaults: OwnerVault[] }>('/owner/vaults');
  if (listed.vaults.length > 0) return listed.vaults;
  if (seeding) return seeding;
  seeding = seedVaults().finally(() => (seeding = null));
  return seeding;
}

let seeding: Promise<OwnerVault[]> | null = null;

async function seedVaults(): Promise<OwnerVault[]> {
  for (const { ready, ...input } of REHEARSAL_COMPARTMENTS) {
    const { vault } = await simOwner<{ vault: OwnerVault }>(
      '/owner/vaults',
      input,
    );
    if (ready) await simOwner(`/owner/vaults/${vault.id}/ready`, {});
  }
  return (await simOwner<{ vaults: OwnerVault[] }>('/owner/vaults')).vaults;
}

/** Releases every compartment a Casino jackpot would release. */
export async function releaseCasinoCompartments(): Promise<number> {
  const vaults = await ensureRehearsalVaults();
  let released = 0;
  for (const vault of vaults)
    if (vault.trigger === 'casino' && vault.state === 'locked') {
      await simOwner(`/owner/vaults/${vault.id}/ready`, {});
      released++;
    }
  return released;
}

/** The rehearsal NFC token of a compartment, standing in for the tag. */
export async function rehearsalKeyFor(vaultId: string): Promise<string | null> {
  const vaults = await ensureRehearsalVaults();
  return (
    vaults.find((v) => v.id === vaultId || v.slug === vaultId)?.nfcToken ?? null
  );
}

export function forgetVaultSeed() {
  seeding = null;
}

/* ---------- Correspondence ---------- */

const LETTERS = [
  {
    title: 'Rehearsal · A word before Thursday',
    body: 'This is a rehearsal letter, written in the TEST Control Centre. Nothing here was sent to Alise, and no message has left the club.\n\nThe real letters arrive in exactly this way: a sealed envelope at the doors, the Butler at your side.',
  },
  {
    title: 'Rehearsal · An evening at the tables',
    body: 'A rehearsal letter that mentions a room. When you have a moment this afternoon, do look in at the Grand Casino. The croupier has been told to expect you.',
  },
  {
    title: 'Rehearsal · Packing, and other mysteries',
    body: 'A third rehearsal letter, to show several unread letters together and the newest rising to the top.\n\nWith love, and with no SMS whatsoever.',
  },
];

let letterCount = 0;

/** Writes and delivers a rehearsal letter now, through the real Desk flow. */
export async function deliverRehearsalLetter(input?: {
  title: string;
  body: string;
  salutation?: string;
}) {
  const sample = input ?? LETTERS[letterCount++ % LETTERS.length]!;
  const { letter } = await simOwner<{ letter: { id: string } }>(
    '/owner/correspondence',
    {
      title: sample.title,
      salutation: input?.salutation ?? 'Dearest Alise,',
      body: sample.body,
      timezone: 'Europe/London',
      deliverAt: null,
    },
  );
  await simOwner(`/owner/correspondence/${letter.id}/send-now`, {});
  window.dispatchEvent(new Event('thirty-club:butler-rehearsal'));
  return letter.id;
}

/* ---------- Forcing scheduled things ---------- */

/**
 * Brings every scheduled letter's moment to now and runs the round, as the
 * every-minute dispatch would once its time came.
 */
export async function deliverScheduledLettersNow() {
  const { simOffice } = await import('./sim/v1');
  const office = await simOffice();
  await office.pg.exec(
    "update public.ttc_letters set deliver_at = public.ttc_sim_now() - interval '1 minute' where state = 'scheduled'",
  );
  const result = await office.round();
  window.dispatchEvent(new Event('thirty-club:butler-rehearsal'));
  return result;
}

/** Brings every approved, scheduled SMS forward to now and "sends" it. */
export async function sendScheduledSmsNow() {
  const { simOffice } = await import('./sim/v1');
  const office = await simOffice();
  await office.pg.exec(
    "update public.ttc_messages set send_at = public.ttc_sim_now() - interval '1 second' where state = 'approved' and send_at > public.ttc_sim_now()",
  );
  return office.round();
}

/** A word with the Butler, as Alise, through the member's own route. */
export async function simulateMemberRequest(body: string) {
  const { simOffice } = await import('./sim/v1');
  const office = await simOffice();
  const response = await office.handle(
    new Request(`${window.location.origin}/api/v1/service/requests`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-concierge-request': '1',
      },
      body: JSON.stringify({ body, idempotencyKey: crypto.randomUUID() }),
    }),
    'member',
  );
  if (!response.ok) {
    const data = (await response.json()) as { message?: string };
    throw new SimulationUnavailable(data.message ?? 'Request refused.');
  }
  await office.round();
}

export interface UpcomingItem {
  id: string;
  label: string;
  at: number;
  kind: 'letter' | 'sms' | 'compartment' | 'milestone';
}

/** Everything the simulated office has scheduled, for the timeline. */
export async function scheduledInOffice(): Promise<UpcomingItem[]> {
  const { simOffice } = await import('./sim/v1');
  const office = await simOffice();
  const letters = await office.pg.query<{
    id: string;
    title: string;
    at: string;
  }>(
    "select id, title, deliver_at as at from public.ttc_letters where state = 'scheduled' and deliver_at is not null",
  );
  const sms = await office.pg.query<{ id: string; body: string; at: string }>(
    "select id, body, send_at as at from public.ttc_messages where state = 'approved' and send_at is not null",
  );
  const vaults = await office.pg.query<{
    id: string;
    n: number;
    at: string;
  }>(
    "select slug as id, display_number as n, available_at as at from public.ttc_vaults where state = 'locked' and available_at is not null",
  );
  const milestones = await office.pg.query<{
    key: string;
    title: string;
    at: string;
  }>(
    "select key, title, fire_at as at from public.ttc_journey_milestones where state = 'pending'",
  );
  return [
    ...milestones.rows.map((r) => ({
      id: `milestone-${r.key}`,
      label: `Journey: ${r.title}`,
      at: Date.parse(r.at),
      kind: 'milestone' as const,
    })),
    ...letters.rows.map((r) => ({
      id: r.id,
      label: `Letter: ${r.title}`,
      at: Date.parse(r.at),
      kind: 'letter' as const,
    })),
    ...sms.rows.map((r) => ({
      id: r.id,
      label: `Butler SMS: ${r.body.slice(0, 60)}${r.body.length > 60 ? '…' : ''}`,
      at: Date.parse(r.at),
      kind: 'sms' as const,
    })),
    ...vaults.rows.map((r) => ({
      id: r.id,
      label: `Vault compartment No. ${r.n} becomes ready`,
      at: Date.parse(r.at),
      kind: 'compartment' as const,
    })),
  ].sort((a, b) => a.at - b.at);
}
