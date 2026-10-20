/** Versioned, authoritative Concierge API. See docs/CONCIERGE_API_CONTRACT.md. */
import type { LetterAction } from '../journey/contract.ts';
export type ISODateTime = string;
export type Quantity = string;
export type RedemptionState = 'pending' | 'fulfilled';
export type PrivilegeKind = 'beauty' | 'drink';
export type MessageState =
  | 'draft'
  | 'approved'
  | 'sending'
  | 'accepted'
  | 'delivered'
  | 'failed'
  | 'uncertain'
  | 'cancelled';
export interface Session {
  role: 'owner' | 'member';
  memberId: string | null;
  expiresAt: ISODateTime;
}
export interface PrivilegeInput {
  slug: string;
  title: string;
  description: string;
  kind: PrivilegeKind;
  enabled: boolean;
  opensAt: ISODateTime;
  closesAt: ISODateTime | null;
  minAmountPence: number | null;
  maxAmountPence: number | null;
}
export interface Privilege extends PrivilegeInput {
  id: string;
  available: boolean;
  unavailableReason:
    'disabled' | 'not-open' | 'expired' | 'already-redeemed' | null;
  redemption: Redemption | null;
}
export interface Redemption {
  id: string;
  privilegeId: string;
  memberId: string;
  state: RedemptionState;
  amountPence: number | null;
  currency: 'GBP' | null;
  quantity: Quantity | null;
  createdAt: ISODateTime;
  fulfilledAt: ISODateTime | null;
  notificationState: MessageState;
}
export interface RedeemInput {
  privilegeId: string;
  idempotencyKey: string;
  amountPence?: number;
  quantity?: Quantity;
}
export interface RedeemResult {
  redemption: Redemption;
  duplicate: boolean;
}
export interface RewardBalance {
  reward: 'drink-voucher';
  unit: 'voucher';
  quantity: Quantity;
}
export interface RewardTransaction {
  id: string;
  delta: Quantity;
  reason: string;
  createdAt: ISODateTime;
}
export interface SlotPlayResult {
  playId: string;
  stops: number[];
  outcome: 'pair' | 'miss' | 'triple' | 'jackpot';
  granted: Quantity;
  firstPlayBonus: Quantity;
  balance: RewardBalance;
  duplicate: boolean;
}
export interface ScheduledMessageInput {
  label: string;
  body: string;
  /** Unambiguous ISO instant with Z/offset. Never send a bare local time. */
  sendAt: ISODateTime | null;
  timezone: string;
}
export interface ScheduledMessage extends ScheduledMessageInput {
  id: string;
  category:
    | 'scheduled-alise'
    | 'transactional-arron'
    | 'correspondence-alise'
    | 'correspondence-arron';
  state: MessageState;
  approvedAt: ISODateTime | null;
  attempts: number;
  providerSid: string | null;
  lastError: string | null;
}
export interface DeliveryLog {
  id: string;
  messageId: string;
  state: string;
  providerSid: string | null;
  error: string | null;
  createdAt: ISODateTime;
}
export interface ActivityEvent {
  id: string;
  type: string;
  detail: Record<string, unknown>;
  createdAt: ISODateTime;
}
export interface OwnerOverview {
  privileges: Privilege[];
  redemptions: Redemption[];
  balances: RewardBalance[];
  messages: ScheduledMessage[];
  deliveries: DeliveryLog[];
  activity: ActivityEvent[];
  smsEnabled: boolean;
  transactionalSmsApproved: boolean;
}
export type ApiErrorCode =
  | 'invalid'
  | 'unauthorised'
  | 'forbidden'
  | 'not-found'
  | 'not-open'
  | 'expired'
  | 'already-redeemed'
  | 'idempotency-conflict'
  | 'insufficient-balance'
  | 'rate-limited'
  | 'conflict'
  | 'not-configured'
  | 'vault-locked'
  | 'credential-invalid'
  /** Communications to Alise are paused by the owner (ADR-021). */
  | 'on-hold'
  | 'server';
export interface ApiError {
  error: ApiErrorCode;
  message: string;
  requestId: string;
  redemption?: Redemption;
}

/* ------------------------------------------------------------------ */
/* The Private Gift Vault. See docs/GIFT_VAULT.md.                      */
/* No field anywhere names or describes the physical present.          */
/* ------------------------------------------------------------------ */
export type VaultState = 'locked' | 'ready' | 'opened';
export type VaultTrigger = 'manual' | 'scheduled' | 'casino';
/** The member's view. `clue` only once READY; `giftLocation` only once OPENED. */
export interface MemberVault {
  /** Stable id, e.g. `vault-003`. */
  id: string;
  /** The engraved compartment number. */
  number: number;
  state: VaultState;
  clue: string | null;
  giftLocation: string | null;
  readyAt: ISODateTime | null;
  openedAt: ISODateTime | null;
}
export interface MemberVaultList {
  /** False before the birthday time-lock; every compartment then reads LOCKED. */
  open: boolean;
  opensAt: ISODateTime;
  vaults: MemberVault[];
}
export interface VaultOpenInput {
  /** The token from the NFC tag's URL (43 characters). */
  credential?: string;
  /** The printed backup code, any case or spacing. */
  code?: string;
}
export interface VaultOpenResult {
  vault: MemberVault;
  alreadyOpened: boolean;
}
export interface VaultInput {
  displayNumber: number;
  clue: string;
  giftLocation: string;
  trigger: VaultTrigger;
  availableAt: ISODateTime | null;
  casinoRewardId: string | null;
}
export interface OwnerVault {
  id: string;
  slug: string;
  number: number;
  clue: string;
  giftLocation: string;
  trigger: VaultTrigger;
  availableAt: ISODateTime | null;
  casinoRewardId: string | null;
  state: VaultState;
  nfcToken: string;
  /** The URL to write onto the NFC sticker. */
  nfcUrl: string;
  backupCode: string;
  readyAt: ISODateTime | null;
  openedAt: ISODateTime | null;
  openedVia: 'nfc' | 'code' | 'owner' | null;
  createdAt: ISODateTime;
  updatedAt: ISODateTime;
}
export interface OwnerVaultList {
  opensAt: ISODateTime;
  vaults: OwnerVault[];
}
/** Read-only rehearsal payload: nothing about the real compartment changes. */
export interface VaultPreview {
  vault: MemberVault;
  ready: MemberVault;
  opened: MemberVault;
}
export interface VaultVerifyResult {
  vaultId: string;
  number: number;
  state: VaultState;
}

/* ------------------------------------------------------------------ */
/* The Correspondence Desk. See docs/CORRESPONDENCE_DESK.md.            */
/* ------------------------------------------------------------------ */
export type LetterState = 'draft' | 'scheduled' | 'published';
/** `opened` and `thanked` are stamps on a published letter. */
export type LetterStatus = LetterState | 'opened' | 'thanked';
export interface LetterInput {
  title: string;
  salutation: string;
  body: string;
  timezone: 'Europe/London' | 'America/Jamaica';
  /** Unambiguous ISO instant (stored in UTC), or null while undecided. */
  deliverAt: ISODateTime | null;
}
/** An outbox SMS as the Desk reports it; never implies delivery itself. */
export interface LetterSms {
  id: string;
  state: MessageState;
  attempts: number;
  sendAt: ISODateTime | null;
  providerSid: string | null;
  lastError: string | null;
}
export interface MemberLetterReply {
  id: string;
  body: string;
  createdAt: ISODateTime;
}
/** Alise's view: only published letters, never SMS state. */
export interface MemberLetter {
  id: string;
  title: string;
  salutation: string;
  body: string;
  timezone: LetterInput['timezone'];
  deliveredAt: ISODateTime;
  openedAt: ISODateTime | null;
  thankedAt: ISODateTime | null;
  status: 'published' | 'opened' | 'thanked';
  /** A birthday-journey letter's button (ADR-020); null for ordinary letters. */
  action?: LetterAction | null;
  replies: MemberLetterReply[];
}
export interface CorrespondenceSummary {
  unread: number;
  total: number;
}
export interface OwnerLetterReply extends MemberLetterReply {
  notificationSms: LetterSms | null;
}
export interface OwnerLetter extends LetterInput {
  id: string;
  state: LetterState;
  status: LetterStatus;
  scheduledAt: ISODateTime | null;
  publishedAt: ISODateTime | null;
  publishedVia: 'schedule' | 'send-now' | null;
  openedAt: ISODateTime | null;
  thankedAt: ISODateTime | null;
  invitationTemplate: 'morning' | 'afternoon' | 'evening' | 'night' | null;
  invitationSms: LetterSms | null;
  thanksSms: LetterSms | null;
  /** Set on letters the birthday journey wrote (ADR-020). */
  journeyRef?: string | null;
  action?: LetterAction | null;
  createdAt: ISODateTime;
  updatedAt: ISODateTime;
  replies: OwnerLetterReply[];
}
export interface OwnerCorrespondence {
  letters: OwnerLetter[];
  smsEnabled: boolean;
}

/* ------------------------------------------------------------------ */
/* The Butler's Service. See docs/BUTLERS_SERVICE.md.                 */
/* ------------------------------------------------------------------ */
/** A request Alise left by ringing for the Butler, as she sees it. */
export interface MemberServiceRequest {
  id: string;
  body: string;
  createdAt: ISODateTime;
  resolvedAt: ISODateTime | null;
}
export interface RequestResponse {
  id: string;
  kind: 'sms' | 'letter';
  createdAt: ISODateTime;
  sms: (LetterSms & { body: string }) | null;
  /** Null for an SMS, or when a linked draft letter was later deleted. */
  letter: {
    id: string;
    title: string;
    state: LetterState;
    status: LetterStatus;
    deliverAt: ISODateTime | null;
    publishedAt: ISODateTime | null;
  } | null;
}
/** Every word Alise has had with the Butler: from the bell or a letter. */
export interface OwnerServiceRequest {
  id: string;
  body: string;
  createdAt: ISODateTime;
  resolvedAt: ISODateTime | null;
  source: 'service' | 'letter';
  letter: { id: string; title: string } | null;
  notificationSms: LetterSms | null;
  responses: RequestResponse[];
}
export interface OwnerRequests {
  requests: OwnerServiceRequest[];
  smsEnabled: boolean;
}
/** A Butler SMS Arron wrote directly; an outbox message plus its creation. */
export interface DirectSms extends ScheduledMessage {
  createdAt: ISODateTime;
}
export interface DirectSmsInput {
  body: string;
  timezone: 'Europe/London' | 'America/Jamaica';
  /** Null sends now (the next dispatch round). */
  sendAt: ISODateTime | null;
  idempotencyKey: string;
}
export interface OwnerDirectSms {
  messages: DirectSms[];
  smsEnabled: boolean;
}
