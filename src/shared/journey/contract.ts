/**
 * The birthday journey's shared contract (docs/BIRTHDAY_JOURNEY_INTEGRATION_CONTRACT.md).
 *
 * OWNER ACTION / SCHEDULE → JOURNEY ENGINE → DURABLE EVENT → BUTLER DELIVERY
 * → MEMBER ACTION → DESTINATION EXPERIENCE
 *
 * The server (`ttc_journey_action`, migration 20261022090000) is the only
 * authority. These types are the wire shapes of `/api/v1/journey` and
 * `/api/v1/owner/journey`, and the event payloads other systems (the Casino,
 * vouchers, the Gift Vault) publish into the journey's event inbox.
 */
import type { ISODateTime } from '../concierge/types.ts';

/* ------------------------------------------------------------------ */
/* Rooms and admissions                                                */
/* ------------------------------------------------------------------ */

/**
 * Rooms that need a formal admission. Registry ids from
 * `src/features/club/domain/rooms.ts`. The Grand Entrance and the Departure
 * Lounge keep their own gates; the Members' Lounge is admitted from a letter
 * (it is where every other admission letter is presented).
 */
export const ADMISSION_ROOMS = [
  'lounge',
  'screening-room',
  'casino',
  'gift-vault',
  'privileges',
] as const;
export type AdmissionRoomId = (typeof ADMISSION_ROOMS)[number];

export const isAdmissionRoom = (value: unknown): value is AdmissionRoomId =>
  typeof value === 'string' &&
  (ADMISSION_ROOMS as readonly string[]).includes(value);

/** LOCKED has no row; INVITED and ADMITTED are persisted. */
export type AdmissionState = 'locked' | 'invited' | 'admitted';

/** What Alise's device is told. Locked rooms are never listed. */
export interface MemberAdmission {
  roomId: AdmissionRoomId;
  state: Exclude<AdmissionState, 'locked'>;
  invitedAt: ISODateTime;
  admittedAt: ISODateTime | null;
  /** The Letter of Admission, present while the room is invited. */
  letter: { title: string; body: string } | null;
}

export interface MemberJourney {
  admissions: MemberAdmission[];
  /** Server time, so the device never trusts its own clock for this. */
  now: ISODateTime;
}

export interface AcceptAdmissionResult {
  admission: MemberAdmission;
  /** True when this was already accepted (a retry, a refresh, a second tap). */
  duplicate: boolean;
}

/* ------------------------------------------------------------------ */
/* Butler letters (Correspondence Desk letters with a call to action)  */
/* ------------------------------------------------------------------ */

/**
 * The button at the foot of a journey letter.
 * - `admission`: "ENTER THE …" — for the Lounge it accepts the admission in
 *   place; for any other room it leads to the Members' Lounge, where the
 *   Letter of Admission is presented.
 * - `return`: "RETURN TO THE …" — straight to an admitted room.
 */
export interface LetterAction {
  kind: 'admission' | 'return';
  roomId: AdmissionRoomId;
  label: string;
}

/* ------------------------------------------------------------------ */
/* Milestones                                                          */
/* ------------------------------------------------------------------ */

export type MilestoneState = 'pending' | 'held' | 'fired' | 'failed';

/** What firing a milestone does. Processed in order, in one transaction. */
export type MilestoneEffect =
  /** Invite a room: Letter of Admission + a Butler letter summoning her. */
  | { type: 'invite-room'; room: AdmissionRoomId }
  /** A Butler letter, optionally with a call to action. */
  | {
      type: 'letter';
      title: string;
      body: string;
      action?: { kind: 'admission' | 'return'; room: AdmissionRoomId } | null;
    }
  /**
   * A call into another system's SQL hook, `public.ttc_journey_hook(name,
   * params, idempotency_key)` — e.g. the Casino issuing complimentary spins.
   * If the hook is not installed the milestone fails and can be retried.
   */
  | { type: 'hook'; name: string; params: Record<string, unknown> };

/** Derived for the owner from the milestone and what it produced. */
export type MilestoneProgress =
  | 'pending'
  | 'held'
  | 'failed'
  | 'triggered'
  | 'delivered'
  | 'opened'
  | 'completed';

export interface OwnerMilestone {
  key: string;
  title: string;
  description: string;
  fireAt: ISODateTime;
  state: MilestoneState;
  progress: MilestoneProgress;
  effects: MilestoneEffect[];
  firedAt: ISODateTime | null;
  firedVia: 'schedule' | 'owner' | null;
  attempts: number;
  lastError: string | null;
  /** Letters it published, and rooms it invited, with their states. */
  letters: {
    id: string;
    title: string;
    publishedAt: ISODateTime | null;
    openedAt: ISODateTime | null;
  }[];
  rooms: { roomId: AdmissionRoomId; state: AdmissionState }[];
  updatedAt: ISODateTime;
}

/* ------------------------------------------------------------------ */
/* The event inbox                                                     */
/* ------------------------------------------------------------------ */

/**
 * Cross-system events. Publishing an event never grants anything: the
 * publisher has already committed its own state (spins, prizes, vouchers);
 * the journey only reacts (Butler correspondence) and records.
 */
export const JOURNEY_EVENT_TYPES = [
  'room.admission.invited',
  'room.admission.accepted',
  'casino.spins.issued',
  'casino.spins.available',
  'casino.prize.awarded',
  'reward.voucher.issued',
  'reward.voucher.redemption_requested',
  'reward.voucher.fulfilled',
  'vault.gift.unlocked',
] as const;
export type JourneyEventType = (typeof JOURNEY_EVENT_TYPES)[number];

/** Optional Butler wording supplied by the publisher (e.g. the owner's note). */
export interface EventLetterOverride {
  title: string;
  body: string;
}

export interface JourneyEventPayloads {
  'room.admission.invited': { roomId: AdmissionRoomId };
  'room.admission.accepted': { roomId: AdmissionRoomId };
  'casino.spins.issued': {
    /** The publisher's stable id for the batch. */
    batchId: string;
    quantity: number;
    /** false: record only, no letter (e.g. spins issued with the opening). */
    announce?: boolean;
    letter?: EventLetterOverride;
  };
  'casino.spins.available': { available: number };
  'casino.prize.awarded': {
    prizeId: string;
    title: string;
    /** Default false: the prize is revealed in the Casino itself. */
    announce?: boolean;
    letter?: EventLetterOverride;
  };
  'reward.voucher.issued': {
    voucherId: string;
    title: string;
    /** Where her button leads; default none (letter only). */
    roomId?: AdmissionRoomId;
    announce?: boolean;
    letter?: EventLetterOverride;
  };
  'reward.voucher.redemption_requested': {
    voucherId: string;
    redemptionId: string;
    title: string;
  };
  'reward.voucher.fulfilled': {
    voucherId: string;
    redemptionId: string;
    title: string;
    announce?: boolean;
    letter?: EventLetterOverride;
  };
  /**
   * Published after the gift entitlement is committed and its compartment
   * is ready. Admitted to the Gift Vault: a letter with RETURN TO THE GIFT
   * VAULT. Not yet: the Vault is introduced (summons → Lounge → Letter of
   * Admission → Vault), with no second letter.
   */
  'vault.gift.unlocked': {
    vaultId: string;
    title?: string;
    announce?: boolean;
    letter?: EventLetterOverride;
  };
}

export type JourneyEventState =
  /** Waiting for the processor (every-minute round, or straight away). */
  | 'pending'
  /** Waiting for a room admission (e.g. spins before the Casino is admitted). */
  | 'deferred'
  /** Reacted to (a letter was published, or nothing was needed). */
  | 'processed'
  /** Recorded only: a type with no reaction, or announce: false. */
  | 'recorded'
  | 'failed';

export interface OwnerJourneyEvent {
  id: string;
  type: string;
  source: string;
  idempotencyKey: string;
  payload: Record<string, unknown>;
  state: JourneyEventState;
  attempts: number;
  lastError: string | null;
  letterId: string | null;
  createdAt: ISODateTime;
  processedAt: ISODateTime | null;
}

export interface OwnerAdmission {
  roomId: AdmissionRoomId;
  state: AdmissionState;
  invitedAt: ISODateTime | null;
  invitedVia: 'milestone' | 'owner' | null;
  milestoneKey: string | null;
  admittedAt: ISODateTime | null;
  /** The Butler letter that summoned her, and whether she opened it. */
  summons: {
    id: string;
    publishedAt: ISODateTime | null;
    openedAt: ISODateTime | null;
    smsState: string | null;
  } | null;
}

export interface OwnerJourneyLetter {
  id: string;
  title: string;
  journeyRef: string;
  action: LetterAction | null;
  publishedAt: ISODateTime | null;
  openedAt: ISODateTime | null;
  sms: { id: string; state: string; lastError: string | null } | null;
}

export interface OwnerJourneyActivity {
  id: string;
  type: string;
  detail: Record<string, unknown>;
  createdAt: ISODateTime;
}

export interface OwnerJourney {
  now: ISODateTime;
  milestones: OwnerMilestone[];
  admissions: OwnerAdmission[];
  events: OwnerJourneyEvent[];
  letters: OwnerJourneyLetter[];
  activity: OwnerJourneyActivity[];
  smsEnabled: boolean;
}

/** Milestone keys: lowercase letters, digits and hyphens, 3–60 characters. */
export const MILESTONE_KEY_PATTERN = /^[a-z0-9][a-z0-9-]{2,59}$/;
export const isMilestoneKey = (value: unknown): value is string =>
  typeof value === 'string' && MILESTONE_KEY_PATTERN.test(value);

/**
 * `POST /owner/journey/milestones`. The key is chosen by the caller and is
 * the creation's idempotency key: retrying the same input returns the same
 * milestone (`duplicate: true`); the same key with other details is refused
 * (`idempotency-conflict`). New milestones start **held**: resume to arm.
 */
export interface MilestoneInput {
  key: string;
  title: string;
  description: string;
  fireAt: ISODateTime;
  effects: MilestoneEffect[];
}

/** `PATCH /owner/journey/milestones/:key`: any of these, never the key. */
export type MilestoneUpdate = Partial<Omit<MilestoneInput, 'key'>>;

/** The journey's zone: every milestone is displayed in Jamaica time. */
export const JOURNEY_TIME_ZONE = 'America/Jamaica';
