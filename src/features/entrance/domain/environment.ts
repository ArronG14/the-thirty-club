import type { MembershipStorage } from '../../club/domain/membershipRecord';
import type { EntranceStorage } from './entranceRecord';

export interface Clock {
  now(): number;
}

export const systemClock: Clock = { now: () => Date.now() };

export type PreviewMode =
  | 'locked'
  | 'final-minute'
  | 'midnight'
  | 'arrival'
  | 'induction'
  | 'lounge'
  | 'evening';

export interface EntranceEnvironment {
  clock: Clock;
  storage: EntranceStorage;
  /** Membership and room progress, shown in the Members' Lounge. */
  membership: MembershipStorage;
  /** Non-null only in development builds; production never sets it. */
  preview: PreviewMode | null;
}
