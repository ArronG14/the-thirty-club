import type { MembershipStorage } from '../../club/domain/membershipRecord';
import type { EntranceStorage } from './entranceRecord';

export interface Clock {
  now(): number;
}

export const systemClock: Clock = { now: () => Date.now() };

/**
 * Whether Alise's membership card has been presented on this device. The
 * birthday makes her eligible; the card opens the doors (ADR-012).
 */
export interface MembershipCard {
  isPresented(): boolean;
}

export const presentedCard: MembershipCard = { isPresented: () => true };
export const absentCard: MembershipCard = { isPresented: () => false };

export type PreviewMode =
  | 'locked'
  | 'final-minute'
  | 'midnight'
  | 'arrival'
  /** Birthday midnight has passed; the doors wait for the card. */
  | 'awaiting-card'
  | 'induction'
  | 'lounge'
  | 'evening'
  /** Grand Casino previews: every room open, casino state seeded. */
  | 'casino-lobby'
  | 'casino-roulette'
  | 'casino-slots'
  | 'casino-jackpot'
  | 'casino-completed';

export interface EntranceEnvironment {
  clock: Clock;
  storage: EntranceStorage;
  /** Membership and room progress, shown in the Members' Lounge. */
  membership: MembershipStorage;
  /** The membership credential (the physical card). */
  card: MembershipCard;
  /** Non-null only in development builds; production never sets it. */
  preview: PreviewMode | null;
}
