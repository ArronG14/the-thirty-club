/**
 * The effective concierge schedule: catalogue defaults, moved by environment
 * variables (set in Netlify) and then by the owner console (stored by the
 * service). Pure; the service and the website compute it identically.
 */
import {
  DEPARTURE_LOUNGE_OPENS,
  PRIVILEGE_IDS,
  PRIVILEGES,
  type PrivilegeId,
} from './catalogue.ts';
import { MESSAGES, type MessageId } from './messages.ts';
import { instantOf } from './time.ts';

export interface MessageOverride {
  /** ISO instant replacing the default send time. */
  sendAt?: string;
  /** The message will not be sent automatically. */
  disabled?: boolean;
}

export interface ScheduleOverrides {
  /** ISO instants replacing default privilege releases. */
  privileges?: Partial<Record<PrivilegeId, string>>;
  messages?: Partial<Record<MessageId, MessageOverride>>;
}

export interface EffectiveSchedule {
  departureOpensAt: number;
  privileges: Record<PrivilegeId, number>;
  /** When each message is sent automatically; null for manual or disabled. */
  messages: Record<MessageId, number | null>;
}

export type EnvLookup = Record<string, string | undefined>;

function isoInstant(value: unknown): number | null {
  if (typeof value !== 'string' || value.trim() === '') return null;
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? null : parsed;
}

export function effectiveSchedule(
  overrides: ScheduleOverrides = {},
  env: EnvLookup = {},
): EffectiveSchedule {
  const departureOpensAt = instantOf(DEPARTURE_LOUNGE_OPENS);
  const privileges = {} as Record<PrivilegeId, number>;
  for (const privilege of PRIVILEGES) {
    const chosen =
      isoInstant(overrides.privileges?.[privilege.id]) ??
      (privilege.opensAtEnv ? isoInstant(env[privilege.opensAtEnv]) : null) ??
      instantOf(privilege.opensAt);
    // Nothing inside the lounge can be released before the lounge opens.
    privileges[privilege.id] = Math.max(chosen, departureOpensAt);
  }
  const messages = {} as Record<MessageId, number | null>;
  for (const message of MESSAGES) {
    const override = overrides.messages?.[message.id];
    const timing = message.timing;
    const fallback =
      timing.kind === 'at'
        ? instantOf(timing.at)
        : timing.kind === 'privilege'
          ? privileges[timing.privilegeId]
          : null;
    messages[message.id] = override?.disabled
      ? null
      : (isoInstant(override?.sendAt) ?? fallback);
  }
  return { departureOpensAt, privileges, messages };
}

export function isPrivilegeReleased(
  schedule: EffectiveSchedule,
  id: PrivilegeId,
  now: number,
): boolean {
  return now >= schedule.privileges[id];
}

/** Validates stored overrides field by field; unknown keys are dropped. */
export function parseOverrides(raw: unknown): ScheduleOverrides {
  if (typeof raw !== 'object' || raw === null) return {};
  const source = raw as Record<string, unknown>;
  const result: ScheduleOverrides = {};
  if (typeof source.privileges === 'object' && source.privileges !== null) {
    const privileges: Partial<Record<PrivilegeId, string>> = {};
    for (const id of PRIVILEGE_IDS) {
      const value = (source.privileges as Record<string, unknown>)[id];
      if (typeof value === 'string' && isoInstant(value) !== null) {
        privileges[id] = value;
      }
    }
    result.privileges = privileges;
  }
  if (typeof source.messages === 'object' && source.messages !== null) {
    const messages: Partial<Record<MessageId, MessageOverride>> = {};
    for (const message of MESSAGES) {
      const value = (source.messages as Record<string, unknown>)[message.id];
      if (typeof value !== 'object' || value === null) continue;
      const entry = value as Record<string, unknown>;
      const override: MessageOverride = {};
      if (typeof entry.sendAt === 'string' && isoInstant(entry.sendAt)) {
        override.sendAt = entry.sendAt;
      }
      if (entry.disabled === true) override.disabled = true;
      messages[message.id] = override;
    }
    result.messages = messages;
  }
  return result;
}
