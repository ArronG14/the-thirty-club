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
import { browserEntranceStorage } from '../entrance/domain/entranceRecord';
import { browserConciergeStorage } from '../concierge/client/localRecord';
import { endRehearsal } from '../concierge/client/sessionStore';
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
import { rehearsalNow, resetRehearsalClock, setRehearsalTime } from './clock';
import { clearRehearsalLocal } from './storage';

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;

const jamaica = (date: string, time: string) =>
  instantInZone({ date, time }, CLUB_TIME_ZONE);
const uk = (date: string, time: string) =>
  instantInZone({ date, time }, UK_ZONE);

export const BIRTHDAY = openingInstant();
export const CASINO_OPENS = jamaica('2026-10-24', '14:00');
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
      '00:00 in Jamaica. The time-lock withdraws; with the card presented the doors swing open and the membership card is presented in the lounge. The Screening Room and Gift Vault open with the membership.',
  },
  {
    id: 'privileges-opens',
    label: 'Privileges Collection hour (not built)',
    at: PRIVILEGES_OPENS,
    watch: '/',
    detail:
      'The registry opens the Privileges Collection at 10:00 Jamaica, but the room itself is not built: it reads “Being prepared”.',
  },
  {
    id: 'casino-opens',
    label: 'Grand Casino opens',
    at: CASINO_OPENS,
    watch: '/',
    detail:
      '14:00 in Jamaica. The Butler announces the casino in the lounge; it becomes enterable.',
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
    id: 'birthday-eve',
    label: 'Birthday eve',
    detail: 'Friday 23 Oct, 20:00 Jamaica. Four hours to midnight.',
    at: BIRTHDAY - 4 * HOUR,
    go: '/',
    apply: (at) => locked(at),
  },
  {
    id: 'final-minute',
    label: 'One minute before midnight',
    detail:
      '23:59:00 Jamaica, card already presented: the final-minute glow, then the doors open by themselves.',
    at: BIRTHDAY - MINUTE,
    go: '/',
    apply: (at) => locked(at, true),
  },
  {
    id: 'midnight',
    label: 'Birthday midnight',
    detail:
      'Five seconds before 00:00 Jamaica, card presented: the full door ceremony and the membership card.',
    at: BIRTHDAY - 5000,
    go: '/',
    apply: (at) => locked(at, true),
  },
  {
    id: 'awaiting-card',
    label: 'Midnight, card not yet found',
    detail:
      '00:01 Jamaica without the card: the riddle. Present it by hand with the rehearsal number TC-3010-2410.',
    at: BIRTHDAY + MINUTE,
    go: '/',
    apply: (at) => locked(at, false),
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
    id: 'casino-opening',
    label: 'Casino opening',
    detail:
      '13:59:30 Jamaica, in the lounge: the Butler announces the Grand Casino at 14:00.',
    at: CASINO_OPENS - 30_000,
    go: '/',
    apply: (at) => {
      writeEntrance('unlocked', at);
      writeMembership(
        inducted(at - 13 * HOUR, ['screening-room', 'gift-vault']),
      );
      writeCard(true, at);
      writeCasino('fresh');
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
  },
];

export async function applyScenario(id: string, go = true) {
  const scenario = SCENARIOS.find((s) => s.id === id);
  if (!scenario) return;
  setRehearsalTime(scenario.at);
  await scenario.apply(scenario.at);
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
    id: 'screening-room',
    label: 'The Private Screening Room',
    detail: 'Opens with the membership at midnight.',
    launch: async () => {
      memberAt(atLeast(BIRTHDAY + 5 * MINUTE));
      return '/rooms/screening-room';
    },
  },
  {
    id: 'casino',
    label: 'The Grand Casino',
    detail: 'Opens at 14:00 Jamaica; fresh chips, test controls inside.',
    launch: async () => {
      memberAt(atLeast(CASINO_OPENS + MINUTE));
      return '/rooms/casino';
    },
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
  },
  {
    id: 'correspondence',
    label: 'My Correspondence',
    detail:
      'The correspondence page; deliver rehearsal letters from TEST first.',
    launch: async () => '/correspondence',
  },
];

export async function launchRoom(id: string) {
  const target = LAUNCH_TARGETS.find((t) => t.id === id);
  if (!target) return;
  const path = await target.launch();
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
