/**
 * What the Departure Lounge shows, derived from the service's state, the
 * device record and the clock. Pure: no React, no storage, no time of its own.
 */
import {
  DEPARTURE_LOUNGE_OPENS,
  PRIVILEGES,
  type PrivilegeDefinition,
  type PrivilegeId,
} from './catalogue.ts';
import type { ConciergeState, PublicRedemption } from './contract.ts';
import { effectiveSchedule } from './schedule.ts';
import { instantOf } from './time.ts';

export type LoungePhase =
  /** Before Thursday 14:00 UK. */
  | 'closed'
  /** Open, but this device has not presented the travel credential. */
  | 'credential'
  /** The lounge and its privileges. */
  | 'open';

export type PrivilegeStatus =
  /** Not released yet. */
  | 'locked'
  /** Released; the seal is unbroken. */
  | 'sealed'
  /** Seal broken; not redeemed (or correspondence being read). */
  | 'open'
  /** Redemption requested, waiting for a connection. */
  | 'pending'
  /** The service recorded the redemption. */
  | 'redeemed';

export interface PrivilegeView {
  privilege: PrivilegeDefinition;
  status: PrivilegeStatus;
  opensAt: number;
  redemption?: PublicRedemption;
}

export interface LoungeInputs {
  now: number;
  state: ConciergeState | null;
  hasDeparture: boolean;
  opened: readonly PrivilegeId[];
  pending: Partial<Record<PrivilegeId, unknown>>;
}

/** The schedule as last reported, or the catalogue defaults offline. */
export function knownSchedule(state: ConciergeState | null) {
  if (state) return state.schedule;
  const defaults = effectiveSchedule();
  return {
    departureOpensAt: defaults.departureOpensAt,
    privileges: defaults.privileges,
  };
}

export function loungePhase({
  now,
  state,
  hasDeparture,
}: LoungeInputs): LoungePhase {
  const opensAt =
    state?.schedule.departureOpensAt ?? instantOf(DEPARTURE_LOUNGE_OPENS);
  if (now < opensAt) return 'closed';
  return hasDeparture ? 'open' : 'credential';
}

export function privilegeViews(inputs: LoungeInputs): PrivilegeView[] {
  const schedule = knownSchedule(inputs.state);
  return PRIVILEGES.map((privilege) => {
    const opensAt = schedule.privileges[privilege.id];
    const redemption = inputs.state?.redemptions[privilege.id];
    let status: PrivilegeStatus;
    if (redemption) status = 'redeemed';
    else if (inputs.pending[privilege.id]) status = 'pending';
    else if (inputs.now < opensAt) status = 'locked';
    else if (inputs.opened.includes(privilege.id)) status = 'open';
    else status = 'sealed';
    return {
      privilege,
      status,
      opensAt,
      ...(redemption ? { redemption } : {}),
    };
  });
}

/** The moment something on screen next changes by itself, if any. */
export function nextChange(inputs: LoungeInputs): number | null {
  const schedule = knownSchedule(inputs.state);
  const upcoming = [
    schedule.departureOpensAt,
    ...Object.values(schedule.privileges),
  ].filter((at) => at > inputs.now);
  return upcoming.length > 0 ? Math.min(...upcoming) : null;
}
