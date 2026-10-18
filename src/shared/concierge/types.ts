/** Versioned, authoritative Concierge API. See docs/CONCIERGE_API_CONTRACT.md. */
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
  category: 'scheduled-alise' | 'transactional-arron';
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
  | 'server';
export interface ApiError {
  error: ApiErrorCode;
  message: string;
  requestId: string;
  redemption?: Redemption;
}
