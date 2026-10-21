/**
 * The universal rehearsal engine (ADR-018): the birthday timeline, the
 * scenario presets and the room launcher. It changes only rehearsal state
 * — the rehearsal clock, this tab's session-scoped records and the
 * simulated office — then reloads into the result, so every room starts
 * from the same coherent simulated session Alise's device would have.
 *
 * Rooms are never opened by bypassing their gates. A launch moves the
 * rehearsal clock to when the room genuinely opens (if it is earlier) and
 * creates the prerequisites the room really checks: the birthday, the
 * membership card, the induction, a prize entitlement or a compartment.
 */
import { CLUB_TIME_ZONE, instantInZone } from '../club/domain/schedule';
import { ROOMS, type RoomId } from '../club/domain/rooms';
import {
  browserMembershipStorage,
  emptyMembership,
  stampRoom,
  type MembershipRecord,
} from '../club/domain/membershipRecord';
import { openingInstant } from '../entrance/domain/countdown';
import { JOURNEY_CACHE_KEY } from '../journey/domain/access';
import { browserEntranceStorage } from '../entrance/domain/entranceRecord';
import { browserConciergeStorage } from '../concierge/client/localRecord';
import {
  activeSession,
  clearSession,
  endRehearsal,
} from '../concierge/client/sessionStore';
import {
  DEPARTURE_LOUNGE_OPENS,
  PRIVILEGES,
} from '../concierge/domain/catalogue';
import { instantOf, JAMAICA_ZONE, UK_ZONE } from '../concierge/domain/time';
import { browserCasinoStorage } from '../casino/domain/casinoRecord';
import { browserPrizeStorage } from '../prizes/ledgerStorage';
import { CLUB_REWARDS } from '../prizes/clubRewards';
import {
  completedState,
  freshState,
  jackpotNextState,
} from '../casino/dev/devState';
import { clearOwnerProgress } from '../owner/session';
import { OWNER_PREFIX } from '../owner/session';
import {
  isAdmissionRoom,
  type AdmissionRoomId,
} from '../../shared/journey/contract';
import { rehearsalNow, resetRehearsalClock, setRehearsalTime } from './clock';
import { PENDING_ADMISSIONS_KEY } from './office';
import { clearRehearsalLocal, deviceStorage } from './storage';

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;

const jamaica = (date: string, time: string) =>
  instantInZone({ date, time }, CLUB_TIME_ZONE);
const uk = (date: string, time: string) =>
  instantInZone({ date, time }, UK_ZONE);

export const BIRTHDAY = openingInstant();
export const CASINO_OPENS = jamaica('2026-10-24', '14:00');
/** The journey's default Casino milestone (ADR-020). */
export const CASINO_MILESTONE = jamaica('2026-10-23', '09:00');
/**
 * Early admission (ADR-022): the doors open at 19:00 UK on 21 October
 * (13:00 Jamaica) once the owner arms the `early-membership` milestone.
 */
export const EARLY_MEMBERSHIP = uk('2026-10-21', '19:00');
/**
 * The TEST membership card's link token (netlify/concierge/testing.ts,
 * rehearsal only). A spare NFC card for physical rehearsal carries
 * `/rehearse?scenario=early-admission-card-scan`, which arrives here.
 */
export const REHEARSAL_CARD_TOKEN = 'membership-test-token-0001';
export const PRIVILEGES_OPENS = jamaica('2026-10-24', '10:00');
export const DEPARTURE_OPENS = instantOf(DEPARTURE_LOUNGE_OPENS);

/* ---------- Timeline ---------- */

export interface TimelineEvent {
  id: string;
  label: string;
  at: number;
  /** Where to watch it happen. */
  watch: string;
  detail: string;
}

export const TIMELINE: readonly TimelineEvent[] = [
  {
    id: 'phase-one-letter',
    label: 'Pre-birthday letter on the step',
    at: uk('2026-10-21', '12:00'),
    watch: '/',
    detail:
      'The concierge’s sealed letter waits at the locked doors with its countdown to Thursday.',
  },
  {
    id: 'departure-opens',
    label: 'Departure Lounge opens',
    at: DEPARTURE_OPENS,
    watch: '/',
    detail:
      'The step letter turns to “Your Departure Lounge is ready”; the Duty-Free privilege is released.',
  },
  ...PRIVILEGES.filter((p) => p.id !== 'duty-free').map((p) => ({
    id: `privilege-${p.id}`,
    label: `${p.title} released`,
    at: instantOf(p.opensAt),
    watch: '/departure',
    detail: `${p.subtitle} Appears in the Departure Lounge.`,
  })),
  {
    id: 'birthday-midnight',
    label: 'Birthday midnight · countdown completes',
    at: BIRTHDAY,
    watch: '/',
    detail:
      '00:00 in Jamaica. No door ceremony: her one entrance was on 21 October at 19:00 UK with the card (ADR-023). The Screening Room and Gift Vault are introduced by their journey milestones (Letters of Admission in the Lounge).',
  },
].sort((a, b) => a.at - b.at);

export function nextEvent(after = rehearsalNow()): TimelineEvent | null {
  return TIMELINE.find((e) => e.at > after + 1000) ?? null;
}

/* ---------- Records ---------- */

function writeEntrance(state: 'locked' | 'unlocked', at: number) {
  const iso = new Date(at).toISOString();
  browserEntranceStorage().save(
    state === 'locked'
      ? { unlockedAt: null, ceremonySeenAt: null }
      : { unlockedAt: iso, ceremonySeenAt: iso },
  );
}

function writeMembership(record: MembershipRecord) {
  browserMembershipStorage().save(record);
}

/** The rehearsal card: presented (as if scanned) or still hidden. */
function writeCard(presented: boolean, at: number) {
  const storage = browserConciergeStorage();
  storage.save({
    ...storage.load(),
    membershipAt: presented ? new Date(at).toISOString() : null,
  });
  // Hidden: a card scanned in an earlier rehearsal no longer counts here.
  if (!presented) {
    const session = activeSession();
    if (session?.claims.scopes.includes('membership'))
      clearSession(session.claims.realm);
  }
}

function inducted(at: number, rooms: readonly RoomId[] = []): MembershipRecord {
  const iso = new Date(at).toISOString();
  let record: MembershipRecord = { ...emptyMembership, inductedAt: iso };
  // The Butler has already introduced what is open; nothing replays.
  for (const room of ROOMS)
    if (room.sequence !== null && rooms.includes(room.id)) {
      record = stampRoom(record, room.id, 'unlockedAt', iso);
      record = stampRoom(record, room.id, 'announcedAt', iso);
    }
  return record;
}

function writeCasino(kind: 'fresh' | 'jackpot' | 'completed') {
  const state =
    kind === 'jackpot'
      ? jackpotNextState()
      : kind === 'completed'
        ? completedState()
        : freshState();
  browserPrizeStorage(new Set(CLUB_REWARDS.map((r) => r.id))).save(
    state.ledger,
  );
  browserCasinoStorage().save(state.casino);
}

/* ---------- Scenarios ---------- */

export interface Scenario {
  id: string;
  /** Admissions the scenario's moment already includes (ADR-020). */
  admitted?: readonly AdmissionRoomId[];
  /** Milestones the owner triggers at this moment (in the simulation). */
  fire?: readonly string[];
  /** Milestones the owner arms (resumes) at this moment. */
  resume?: readonly string[];
  /** A rehearsal batch of server-issued Casino spins (with one voucher). */
  spins?: number;
  /**
   * The membership card (ADR-023): true = presented through the real
   * credential path (the TEST office records it); false = still hidden
   * (the TEST office forgets any earlier presentation).
   */
  card?: boolean;
  label: string;
  detail: string;
  at: number;
  go: string;
  apply(at: number): void | Promise<void>;
}

const locked = (at: number, card = false) => {
  writeEntrance('locked', at);
  writeMembership(emptyMembership);
  writeCard(card, at);
};

export const SCENARIOS: readonly Scenario[] = [
  {
    id: 'early-admission-teaser',
    label: 'Early admission: after the 16:00 teaser',
    detail:
      'Wednesday 21 Oct, 16:01 UK, early admission armed: the locked doors count down to 19:00 UK and the Butler says the admission has been brought forward.',
    at: uk('2026-10-21', '16:01'),
    go: '/',
    resume: ['early-membership'],
    apply: (at) => locked(at),
  },
  {
    id: 'early-admission-awaiting-card',
    label: 'Early admission: 19:00 UK, waiting for the card',
    detail:
      '19:00:30 UK: the clock holds at 00:00:10, the Butler’s letter (with the clue) waits on the step, and nothing opens until the membership card is presented — scan a TEST card, or present its printed TEST number by hand (TC-3010-2410).',
    at: EARLY_MEMBERSHIP + 30_000,
    go: '/',
    resume: ['early-membership'],
    card: false,
    apply: (at) => locked(at),
  },
  {
    id: 'early-admission-card-scan',
    label: 'Early admission: the card is scanned (NFC)',
    detail:
      '19:01 UK: what a TEST card opens. The card’s link is examined, the club records it, and the final ten seconds, the doors and the welcome follow in this tab — as when her real card opens a new Safari tab.',
    at: EARLY_MEMBERSHIP + 60_000,
    go: `/c/${REHEARSAL_CARD_TOKEN}`,
    resume: ['early-membership'],
    apply: (at) => locked(at),
  },
  {
    id: 'early-admission-doors',
    label: 'Early admission: 19:00 UK, card already presented',
    detail:
      '18:59:40 UK, the card scanned earlier: the clock holds at 00:00:10, the final ten seconds begin at 19:00 and the doors open by themselves into the membership ceremony.',
    at: EARLY_MEMBERSHIP - 20_000,
    go: '/',
    resume: ['early-membership'],
    card: true,
    apply: (at) => locked(at),
  },
  {
    id: 'early-admission-late',
    label: 'Early admission: arriving after 19:00 UK with the card',
    detail:
      '20:15 UK: she opens the app later with the card already presented; the final ten seconds begin then, and the doors open.',
    at: uk('2026-10-21', '20:15'),
    go: '/',
    resume: ['early-membership'],
    card: true,
    apply: (at) => locked(at),
  },
  {
    id: 'before-departure',
    label: 'Before departure',
    detail: 'Wednesday 21 Oct, noon UK. Doors locked; the letter on the step.',
    at: uk('2026-10-21', '12:00'),
    go: '/',
    apply: (at) => locked(at),
  },
  {
    id: 'departure-opening',
    label: 'Departure Lounge opening',
    detail:
      'Thursday 22 Oct, 13:59:30 UK. Watch the step letter change at 14:00.',
    at: DEPARTURE_OPENS - 30_000,
    go: '/',
    apply: (at) => locked(at),
  },
  {
    id: 'casino-opening',
    label: 'Casino opening (admission ceremony)',
    detail:
      'Friday 23 Oct, 08:59:30 Jamaica, in the Lounge as a founding member: at 09:00 the Casino milestone fires and the Butler presents its Letter of Admission. Accept it to be escorted in.',
    at: CASINO_MILESTONE - 30_000,
    go: '/lounge',
    admitted: ['lounge'],
    apply: (at) => {
      writeEntrance('locked', at);
      writeMembership(inducted(at - 40 * HOUR));
      writeCard(false, at);
      writeCasino('fresh');
    },
  },
  {
    id: 'birthday-eve',
    label: 'Birthday eve',
    detail: 'Friday 23 Oct, 20:00 Jamaica. Four hours to midnight.',
    at: BIRTHDAY - 4 * HOUR,
    go: '/',
    apply: (at) => locked(at),
  },
  {
    id: 'just-entered',
    label: 'Immediately after entering the club',
    detail:
      '00:02 Jamaica, doors open, not yet inducted: the Butler presents the membership card in the lounge.',
    at: BIRTHDAY + 2 * MINUTE,
    go: '/',
    apply: (at) => {
      writeEntrance('unlocked', at);
      writeMembership(emptyMembership);
      writeCard(true, at);
    },
  },
  {
    id: 'casino-jackpot',
    label: 'Casino jackpot',
    detail:
      '14:30 Jamaica at the slot machine: the next spin is the jackpot, which wins the Vault Key.',
    at: CASINO_OPENS + 30 * MINUTE,
    go: '/rooms/casino',
    apply: (at) => {
      writeEntrance('unlocked', at);
      writeMembership(
        inducted(at - 14 * HOUR, ['screening-room', 'casino', 'gift-vault']),
      );
      writeCard(true, at);
      writeCasino('jackpot');
    },
    admitted: ['casino'],
    spins: 3,
  },
  {
    id: 'vault-unlock',
    label: 'Gift Vault unlock',
    detail:
      '00:10 Jamaica: the vault is open; compartment No. 1 is ready with its clue.',
    at: BIRTHDAY + 10 * MINUTE,
    go: '/rooms/gift-vault',
    apply: async (at) => {
      writeEntrance('unlocked', at);
      writeMembership(inducted(at, ['screening-room', 'gift-vault']));
      writeCard(true, at);
      const { ensureRehearsalVaults } = await import('./office');
      await ensureRehearsalVaults();
    },
    admitted: ['gift-vault'],
  },
  {
    id: 'all-open',
    label: 'All rooms open',
    detail:
      '20:00 Jamaica on the birthday: every built room open and enterable.',
    at: jamaica('2026-10-24', '20:00'),
    go: '/',
    apply: async (at) => {
      writeEntrance('unlocked', at);
      writeMembership(
        inducted(at - 20 * HOUR, [
          'screening-room',
          'casino',
          'gift-vault',
          'privileges',
        ]),
      );
      writeCard(true, at);
      const { ensureRehearsalVaults } = await import('./office');
      await ensureRehearsalVaults();
    },
    admitted: ['screening-room', 'casino', 'gift-vault', 'privileges'],
    spins: 3,
  },
];

export async function applyScenario(id: string, go = true) {
  const scenario = SCENARIOS.find((s) => s.id === id);
  if (!scenario) return;
  setRehearsalTime(scenario.at);
  await scenario.apply(scenario.at);
  await syncAdmissions(scenario.admitted ?? [], [], {
    fire: scenario.fire,
    resume: scenario.resume,
    spins: scenario.spins,
    card: scenario.card,
  });
  remember(scenario.label);
  if (go) window.location.assign(scenario.go);
}

/* ---------- Room launcher ---------- */

/**
 * A rehearsal-realm session from the simulated concierge, so privilege
 * redemptions say "Rehearsal recorded. No notification was sent." exactly
 * as the server's own rehearsal does. `scopes` are the credentials already
 * presented (none: she finds the travel credential herself).
 */
async function simConciergeRehearsal(scopes: string[]) {
  const [{ simConcierge }, { TEST_ENV }, sessions] = await Promise.all([
    import('./sim/legacy'),
    import('../../../netlify/concierge/testing'),
    import('../concierge/client/sessionStore'),
  ]);
  sessions.endRehearsal();
  const response = await simConcierge()(
    new Request(`${window.location.origin}/api/owner/session`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-owner-key': TEST_ENV.CONCIERGE_OWNER_KEY,
      },
      body: JSON.stringify({ kind: 'rehearsal', scopes }),
    }),
    'rehearsal',
  );
  if (!response.ok) throw new Error('The simulated concierge refused.');
  const data = (await response.json()) as { session: string };
  sessions.saveSession(data.session);
}

export interface LaunchTarget {
  id: string;
  label: string;
  detail: string;
  launch(): Promise<string>;
  /** Rooms whose Letter of Admission is presented rather than pre-accepted. */
  ceremony?: readonly AdmissionRoomId[];
  /** Extra admissions this launch includes (beyond the rooms it opens). */
  admitted?: readonly AdmissionRoomId[];
  /** A rehearsal batch of server-issued Casino spins (with one voucher). */
  spins?: number;
  /** Milestones the owner arms (resumes) for this launch. */
  resume?: readonly string[];
}

/**
 * The journey's admissions for this rehearsal (ADR-020): every room the
 * rehearsal's membership already has open is admitted in the simulated
 * office through the real invite and accept actions, so the real gates
 * decide. `ceremony` rooms are invited only.
 */
async function syncAdmissions(
  extra: readonly AdmissionRoomId[],
  ceremony: readonly AdmissionRoomId[] = [],
  also: {
    fire?: readonly string[] | undefined;
    resume?: readonly string[] | undefined;
    spins?: number | undefined;
    card?: boolean | undefined;
  } = {},
) {
  // A new moment: the journey cached from the last rehearsal no longer
  // holds (it could open the doors before the office has been read).
  try {
    deviceStorage().removeItem(JOURNEY_CACHE_KEY);
  } catch {
    // Nothing cached.
  }
  const record = browserMembershipStorage().load();
  const open = Object.entries(record.rooms)
    .filter(([, progress]) => progress?.unlockedAt)
    .map(([room]) => room)
    .filter(isAdmissionRoom);
  // Inducted means she is already a member of the Lounge; past the default
  // Casino milestone she has accepted that letter too, so a later moment
  // starts with only its own ceremonies waiting.
  if (record.inductedAt) open.push('lounge');
  if (record.inductedAt && rehearsalNow() >= CASINO_MILESTONE)
    open.push('casino');
  const admitted = [...new Set([...open, ...extra])].filter(
    (room) => !ceremony.includes(room),
  );
  // A moment before her membership: the simulated office must not remember
  // a Lounge admission from an earlier rehearsal (the doors would open).
  const withdraw: AdmissionRoomId[] =
    !record.inductedAt &&
    !admitted.includes('lounge') &&
    !ceremony.includes('lounge')
      ? ['lounge']
      : [];
  const fire = also.fire ?? [];
  const resume = also.resume ?? [];
  const spins = also.spins ?? 0;
  if (
    withdraw.length === 0 &&
    admitted.length === 0 &&
    ceremony.length === 0 &&
    fire.length === 0 &&
    resume.length === 0 &&
    spins === 0 &&
    also.card === undefined
  )
    return;
  // Applied by the page the launch opens, before its first journey read
  // (office.applyPendingAdmissions), so it never depends on the simulated
  // database flushing to IndexedDB before this page unloads.
  sessionStorage.setItem(
    PENDING_ADMISSIONS_KEY,
    JSON.stringify({
      admitted,
      ceremony,
      withdraw,
      fire,
      resume,
      spins,
      card: also.card,
    }),
  );
}

/** Moves the rehearsal clock forward to `at` if it is earlier. */
function atLeast(at: number): number {
  const now = rehearsalNow();
  if (now >= at) return now;
  setRehearsalTime(at);
  return at;
}

/** Inducted, card presented, doors open, everything open before `at`. */
function memberAt(at: number) {
  const record = browserMembershipStorage().load();
  writeEntrance('unlocked', at);
  writeCard(true, at);
  if (!record.inductedAt) {
    const rooms: RoomId[] = ['screening-room', 'gift-vault'];
    if (at >= CASINO_OPENS) rooms.push('casino');
    if (at >= PRIVILEGES_OPENS) rooms.push('privileges');
    writeMembership(inducted(Math.min(at, BIRTHDAY + 5 * MINUTE), rooms));
  }
}

/**
 * A first visit to the Screening Room: no screening record, and the room
 * not yet completed in the membership, so the Lounge recommends it again
 * and the Butler gives his full introduction.
 */
function freshScreening() {
  try {
    sessionStorage.removeItem(`${OWNER_PREFIX}thirty-club:screening`);
  } catch {
    // Nothing to clear.
  }
  const record = browserMembershipStorage().load();
  const room = record.rooms['screening-room'];
  if (room) {
    const kept = { ...room };
    delete kept.visitedAt;
    delete kept.completedAt;
    writeMembership({
      ...record,
      rooms: { ...record.rooms, 'screening-room': kept },
    });
  }
}

export const LAUNCH_TARGETS: readonly LaunchTarget[] = [
  {
    id: 'entrance',
    label: 'The Grand Entrance (locked)',
    detail: 'The day before the birthday, with the step letter and the bell.',
    launch: async () => {
      const at = BIRTHDAY - 24 * HOUR;
      setRehearsalTime(at);
      locked(at);
      return '/';
    },
  },
  {
    id: 'departure-lounge',
    label: 'The Departure Lounge',
    detail:
      'Opens at its real time (Thu 14:00 UK) with the travel credential already presented.',
    launch: async () => {
      const at = atLeast(DEPARTURE_OPENS + MINUTE);
      if (at < BIRTHDAY) locked(at);
      await simConciergeRehearsal(['departure']);
      return '/departure';
    },
  },
  {
    id: 'departure-credential',
    label: 'The Departure Lounge (find the credential)',
    detail:
      'Opens at its real time; present the travel credential yourself (code BRASS-2210).',
    launch: async () => {
      const at = atLeast(DEPARTURE_OPENS + MINUTE);
      if (at < BIRTHDAY) locked(at);
      await simConciergeRehearsal([]);
      return '/departure';
    },
  },
  {
    id: 'lounge',
    label: 'The Members’ Lounge',
    detail: 'After midnight, inducted, with the card.',
    launch: async () => {
      memberAt(atLeast(BIRTHDAY + 5 * MINUTE));
      return '/';
    },
  },
  {
    id: 'screening-journey',
    label: 'The Screening Room journey (first visit)',
    detail:
      'From the Members’ Lounge: the Letter of Admission, the Butler’s escort, the five-second test film, return to your seat. Clears screening progress first.',
    ceremony: ['screening-room'],
    launch: async () => {
      memberAt(atLeast(BIRTHDAY + 5 * MINUTE));
      freshScreening();
      return '/';
    },
  },
  {
    id: 'screening-room',
    label: 'The Private Screening Room',
    detail:
      'Seated in the room, keeping earlier screening progress (returning visitor). Opens with the membership at midnight.',
    launch: async () => {
      memberAt(atLeast(BIRTHDAY + 5 * MINUTE));
      return '/rooms/screening-room';
    },
    admitted: ['screening-room'],
  },
  {
    id: 'casino',
    label: 'The Grand Casino',
    detail: 'Opens at 14:00 Jamaica; fresh chips, test controls inside.',
    launch: async () => {
      memberAt(atLeast(CASINO_OPENS + MINUTE));
      return '/rooms/casino';
    },
    admitted: ['casino'],
    spins: 3,
  },
  {
    id: 'gift-vault',
    label: 'The Gift Vault',
    detail:
      'Opens with the membership; three rehearsal compartments (one ready).',
    launch: async () => {
      memberAt(atLeast(BIRTHDAY + 5 * MINUTE));
      const { ensureRehearsalVaults } = await import('./office');
      await ensureRehearsalVaults();
      return '/rooms/gift-vault';
    },
    admitted: ['gift-vault'],
  },
  {
    id: 'correspondence',
    label: 'My Correspondence',
    detail:
      'The correspondence page; deliver rehearsal letters from TEST first.',
    launch: async () => '/correspondence',
  },
  {
    id: 'early-lounge',
    label: 'Founding membership: the doors open at 19:00 UK',
    detail:
      'Wednesday 21 Oct just after 19:00 UK, early admission armed: the final ten seconds, the doors, the membership ceremony and the Lounge (no birthday rooms).',
    launch: async () => {
      const at = atLeast(EARLY_MEMBERSHIP + MINUTE);
      locked(at);
      return '/';
    },
    resume: ['early-membership'],
  },
  {
    id: 'casino-admission',
    label: 'Admission ceremony: the Grand Casino',
    detail:
      'Friday 23 Oct after 09:00 Jamaica, as a founding member (admitted on 21 Oct): the doors open into the Lounge, the Letter of Admission, and the escort into the Casino.',
    launch: async () => {
      const at = atLeast(CASINO_MILESTONE + MINUTE);
      writeEntrance('locked', at);
      writeMembership(inducted(EARLY_MEMBERSHIP + HOUR));
      writeCard(false, at);
      writeCasino('fresh');
      return '/';
    },
    admitted: ['lounge'],
    ceremony: ['casino'],
    spins: 3,
  },
];

export async function launchRoom(id: string) {
  const target = LAUNCH_TARGETS.find((t) => t.id === id);
  if (!target) return;
  const path = await target.launch();
  await syncAdmissions(target.admitted ?? [], target.ceremony ?? [], {
    spins: target.spins,
    resume: target.resume,
  });
  remember(target.label);
  window.location.assign(path);
}

/* ---------- Resets ---------- */

const ROOM_KEYS: Partial<Record<string, readonly string[]>> = {
  casino: ['thirty-club:casino', 'thirty-club:prizes'],
  'screening-room': ['thirty-club:screening'],
  entrance: ['thirty-club:entrance'],
  lounge: ['thirty-club:membership'],
};

/** Clears one room's rehearsal progress. */
export async function resetRoom(id: string) {
  for (const key of ROOM_KEYS[id] ?? [])
    try {
      sessionStorage.removeItem(OWNER_PREFIX + key);
    } catch {
      // Nothing to clear.
    }
  if (id === 'screening-room') freshScreening();
  if (id === 'gift-vault' || id === 'correspondence') {
    // Server-side rooms reset with the whole simulated office.
    await resetSimulation();
  }
}

/** Deletes the simulated office (database, concierge, sessions). */
export async function resetSimulation() {
  const [{ closeSimOffice, deleteSimDatabase }, { clearSimConcierge }, office] =
    await Promise.all([
      import('./sim/v1'),
      import('./sim/legacy'),
      import('./office'),
    ]);
  await closeSimOffice();
  await deleteSimDatabase();
  clearSimConcierge();
  office.forgetVaultSeed();
  for (const actor of ['owner', 'member'])
    try {
      sessionStorage.removeItem(`${OWNER_PREFIX}sim-session:${actor}`);
    } catch {
      // Nothing to clear.
    }
}

/** A clean start: real time, empty records, a fresh simulated office. */
export async function resetEverything() {
  clearOwnerProgress();
  clearRehearsalLocal();
  endRehearsal();
  resetRehearsalClock();
  await resetSimulation();
  forget();
}

/* ---------- What is being rehearsed ---------- */

const LABEL_KEY = `${OWNER_PREFIX}rehearsal-label`;

function remember(label: string) {
  try {
    sessionStorage.setItem(LABEL_KEY, label);
  } catch {
    // Cosmetic.
  }
}

function forget() {
  try {
    sessionStorage.removeItem(LABEL_KEY);
  } catch {
    // Cosmetic.
  }
}

export function rehearsalLabel(): string | null {
  try {
    return sessionStorage.getItem(LABEL_KEY);
  } catch {
    return null;
  }
}

export function formatRehearsalTime(at: number): { uk: string; jm: string } {
  const f = (zone: string) =>
    new Intl.DateTimeFormat('en-GB', {
      timeZone: zone,
      weekday: 'short',
      day: 'numeric',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hourCycle: 'h23',
    }).format(new Date(at));
  return { uk: f(UK_ZONE), jm: f(JAMAICA_ZONE) };
}

/* ---------- Manual triggers ---------- */

/** The membership card, as if scanned, for this rehearsal. */
export function presentCard() {
  writeCard(true, rehearsalNow());
}

/**
 * A slot-machine jackpot, as the Casino would record it: the jackpot
 * counter and the Vault Key in the prize ledger (unclaimed, so the reveal
 * plays in the Casino), and the casino-bound compartments released in the
 * simulated vault, exactly as the server does for a recorded jackpot.
 */
export async function simulateJackpot(): Promise<number> {
  const { bump, awardDirect } = await import('../prizes/ledger');
  const { CASINO_REWARD_IDS, COUNTERS } =
    await import('../casino/config/casinoRewards');
  const storage = browserPrizeStorage(new Set(CLUB_REWARDS.map((r) => r.id)));
  let ledger = storage.load();
  ledger = bump(ledger, COUNTERS.slotsJackpots, 1);
  ledger = awardDirect(
    ledger,
    CASINO_REWARD_IDS.vaultKeyOne,
    new Date(rehearsalNow()).toISOString(),
  );
  storage.save(ledger);
  const { releaseCasinoCompartments } = await import('./office');
  return releaseCasinoCompartments();
}
