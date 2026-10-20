/**
 * The birthday journey (docs/BIRTHDAY_JOURNEY_INTEGRATION_CONTRACT.md):
 * room admissions, the owner's milestones and the inbox of cross-system
 * events. The database decides every state change (`ttc_journey_action`);
 * this layer validates input and supplies the Butler's centrally defined
 * words. Letters are Correspondence Desk letters, so their SMS invitations
 * go through the existing outbox, sent only while SMS_SENDING_ENABLED.
 */
import type { Session } from '../../src/shared/concierge/types.ts';
import { INVITATION_TEMPLATES } from '../../src/shared/correspondence/templates.ts';
import {
  isAdmissionRoom,
  isMilestoneKey,
  type JourneyEventType,
  type MilestoneEffect,
} from '../../src/shared/journey/contract.ts';
import { JOURNEY_TEMPLATES } from '../../src/shared/journey/templates.ts';
import { BackendError, type Database } from './database.ts';
import { requireCommunications } from './hold.ts';
import * as v from './validation.ts';

/** Every journey call carries the Butler's words. */
export const withJourneyTemplates = (input: Record<string, unknown> = {}) => ({
  ...input,
  journey: JOURNEY_TEMPLATES,
  templates: INVITATION_TEMPLATES,
});

/**
 * Fires due milestones and processes open events. Run by the every-minute
 * round before letters are published; safe to run concurrently.
 */
export async function runJourneyRound(
  db: Database,
): Promise<{ fired: number; processed: number }> {
  return db.action(
    null,
    'system',
    'system-journey-round',
    withJourneyTemplates(),
  );
}

/** Processes open events now (e.g. straight after a Casino transaction). */
export const processJourneyEvents = runJourneyRound;

export interface JourneyEventInput<
  T extends JourneyEventType = JourneyEventType,
> {
  type: T | (string & {});
  /** The publishing system, e.g. 'casino'. */
  source: string;
  /** Stable idempotency key, e.g. `spins-batch-<id>`. */
  key: string;
  payload: Record<string, unknown>;
}

/**
 * Publishes an event in its own transaction and processes it at once.
 * Prefer `public.ttc_journey_publish(...)` inside your own SQL transaction
 * (contract §2); use this only when there is none to join.
 */
export async function publishJourneyEvent(
  db: Database,
  event: JourneyEventInput,
): Promise<{ event: { id: string; state: string; letterId: string | null } }> {
  return db.action(
    null,
    'system',
    'system-journey-event',
    withJourneyTemplates({ ...event }),
  );
}

const ROOM = '([a-z-]{3,20})';
const KEY = '([a-z0-9][a-z0-9-]{2,59})';
const ID = '([A-Fa-f0-9-]{36})';

function room(value: unknown) {
  if (!isAdmissionRoom(value)) v.invalid();
  return value;
}

function effects(value: unknown): MilestoneEffect[] {
  if (!Array.isArray(value) || value.length < 1 || value.length > 10)
    v.invalid();
  return value.map((raw): MilestoneEffect => {
    if (!raw || typeof raw !== 'object') v.invalid();
    const effect = raw as Record<string, unknown>;
    if (effect.type === 'invite-room') {
      v.keys(effect, ['type', 'room']);
      return { type: 'invite-room', room: room(effect.room) };
    }
    if (effect.type === 'letter') {
      v.keys(effect, ['type', 'title', 'body', 'action']);
      const action = effect.action;
      let parsed: { kind: 'admission' | 'return'; room: never } | null = null;
      if (action !== undefined && action !== null) {
        if (typeof action !== 'object') v.invalid();
        const a = action as Record<string, unknown>;
        v.keys(a, ['kind', 'room']);
        if (a.kind !== 'admission' && a.kind !== 'return') v.invalid();
        parsed = { kind: a.kind, room: room(a.room) as never };
      }
      return {
        type: 'letter',
        title: v.text(effect.title, 1, 120),
        body: v.text(effect.body, 1, 4000),
        action: parsed,
      };
    }
    if (effect.type === 'hook') {
      v.keys(effect, ['type', 'name', 'params']);
      if (
        typeof effect.name !== 'string' ||
        !/^[a-z][a-z0-9_.-]{2,60}$/.test(effect.name)
      )
        v.invalid();
      const params = effect.params ?? {};
      if (!params || typeof params !== 'object' || Array.isArray(params))
        v.invalid();
      return {
        type: 'hook',
        name: effect.name,
        params: params as Record<string, unknown>,
      };
    }
    return v.invalid();
  });
}

interface JourneyRouteContext {
  route: string;
  path: string;
  method: string;
  body: Record<string, unknown>;
  session: Session;
  db: Database;
  env: NodeJS.ProcessEnv;
}

/** The journey's routes, or undefined when the request is not one of them. */
export async function journeyRoute({
  route,
  path,
  method,
  body,
  session,
  db,
  env,
}: JourneyRouteContext): Promise<
  { data: unknown; status?: number } | undefined
> {
  const call = <T = Record<string, unknown>>(
    action: string,
    input: Record<string, unknown> = {},
  ) =>
    db.action<T>(
      session.memberId,
      session.role,
      action,
      withJourneyTemplates(input),
    );

  if (path === '/journey' || path.startsWith('/journey/')) {
    if (session.role !== 'member') throw new BackendError('forbidden');
    if (route === 'GET /journey') return { data: await call('journey-state') };
    const accept = new RegExp(`^/journey/admissions/${ROOM}/accept$`).exec(
      path,
    );
    if (accept && method === 'POST') {
      v.keys(body, []);
      const result = await call<{ duplicate: boolean }>('journey-accept', {
        roomId: room(accept[1]),
      });
      return { data: result, status: result.duplicate ? 200 : 201 };
    }
    return undefined;
  }

  if (path !== '/owner/journey' && !path.startsWith('/owner/journey/'))
    return undefined;
  if (session.role !== 'owner') throw new BackendError('forbidden');
  if (route === 'GET /owner/journey')
    return {
      data: {
        ...(await call('owner-journey')),
        smsEnabled: env.SMS_SENDING_ENABLED === 'true',
      },
    };
  if (route === 'POST /owner/journey/milestones') {
    v.keys(body, ['key', 'title', 'description', 'fireAt', 'effects']);
    if (!isMilestoneKey(body.key)) v.invalid();
    const created = await call<{ duplicate: boolean }>(
      'owner-journey-milestone-create',
      {
        key: body.key,
        title: v.text(body.title, 1, 120),
        description:
          body.description === undefined
            ? ''
            : v.text(body.description, 0, 1000),
        fireAt: v.instant(body.fireAt),
        effects: effects(body.effects),
      },
    );
    return { data: created, status: created.duplicate ? 200 : 201 };
  }
  const milestone = new RegExp(
    `^/owner/journey/milestones/${KEY}(?:/(fire|hold|resume|retry))?$`,
  ).exec(path);
  if (milestone) {
    const key = milestone[1]!;
    if (method === 'PATCH' && !milestone[2]) {
      v.keys(body, ['title', 'description', 'fireAt', 'effects']);
      const input: Record<string, unknown> = { key };
      if (body.title !== undefined) input.title = v.text(body.title, 1, 120);
      if (body.description !== undefined)
        input.description = v.text(body.description, 0, 1000);
      if (body.fireAt !== undefined) input.fireAt = v.instant(body.fireAt);
      if (body.effects !== undefined) input.effects = effects(body.effects);
      return { data: await call('owner-journey-milestone-update', input) };
    }
    if (method === 'POST' && milestone[2]) {
      v.keys(body, []);
      // Firing delivers to Alise; refused while communications are held.
      if (milestone[2] === 'fire' || milestone[2] === 'retry')
        await requireCommunications(db);
      return {
        data: await call(`owner-journey-milestone-${milestone[2]}`, { key }),
      };
    }
    return undefined;
  }
  const rooms = new RegExp(
    `^/owner/journey/rooms/${ROOM}/(invite|withdraw)$`,
  ).exec(path);
  if (rooms && method === 'POST') {
    v.keys(body, []);
    if (rooms[2] === 'invite') await requireCommunications(db);
    return {
      data: await call(`owner-journey-room-${rooms[2]}`, {
        roomId: room(rooms[1]),
      }),
    };
  }
  const retry = new RegExp(`^/owner/journey/events/${ID}/retry$`).exec(path);
  if (retry && method === 'POST') {
    v.keys(body, []);
    await requireCommunications(db);
    return {
      data: await call('owner-journey-event-retry', {
        id: v.uuid(retry[1]).toLowerCase(),
      }),
    };
  }
  return undefined;
}
