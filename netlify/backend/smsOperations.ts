/**
 * SMS operations in the Owner Control Centre (ADR-022): the operating mode,
 * deliberate approval of queued messages once LIVE, and rehearsal copies to
 * the owner's own verified number. Owner session only; phone numbers and
 * credentials never leave the server.
 */
import type { Session } from '../../src/shared/concierge/types.ts';
import { INVITATION_TEMPLATES } from '../../src/shared/correspondence/templates.ts';
import { isMilestoneKey } from '../../src/shared/journey/contract.ts';
import { JOURNEY_TEMPLATES } from '../../src/shared/journey/templates.ts';
import {
  rehearsalSms,
  type RehearsalTarget,
} from '../../src/shared/sms/rehearsal.ts';
import { BackendError, type Database } from './database.ts';
import { deliverSms, transportStatus } from './smsPolicy.ts';
import * as v from './validation.ts';

/** Where a rehearsal link should take the owner in TEST. */
const SEED_TARGETS: Record<string, RehearsalTarget> = {
  'butler-teaser-2026-10-21': { scenario: 'early-admission-teaser' },
};
const MILESTONE_TARGETS: Record<string, RehearsalTarget> = {
  'casino-opening': { launch: 'casino-admission' },
  'birthday-screening': { launch: 'screening-journey' },
  'birthday-vault': { launch: 'gift-vault' },
};

interface SmsRouteContext {
  route: string;
  path: string;
  method: string;
  body: Record<string, unknown>;
  session: Session;
  db: Database;
  env: NodeJS.ProcessEnv;
  send: typeof fetch;
}

const ID = '([A-Fa-f0-9-]{36})';

export async function smsRoute({
  route,
  path,
  method,
  body,
  session,
  db,
  env,
  send,
}: SmsRouteContext): Promise<{ data: unknown; status?: number } | undefined> {
  if (path !== '/owner/sms' && !path.startsWith('/owner/sms/'))
    return undefined;
  if (session.role !== 'owner') throw new BackendError('forbidden');
  const call = <T = Record<string, unknown>>(
    action: string,
    input: Record<string, unknown> = {},
  ) => db.action<T>(session.memberId, 'owner', action, input);

  if (route === 'GET /owner/sms')
    return {
      data: { ...(await call('owner-sms')), transport: transportStatus(env) },
    };

  if (route === 'POST /owner/sms/mode') {
    v.keys(body, ['mode', 'confirm']);
    if (
      body.mode !== 'off' &&
      body.mode !== 'rehearsal' &&
      body.mode !== 'live'
    )
      v.invalid();
    // LIVE is a deliberate act: the owner types LIVE.
    if (body.mode === 'live' && body.confirm !== 'LIVE') v.invalid();
    return {
      data: {
        ...(await call('owner-sms-mode', { mode: body.mode })),
        transport: transportStatus(env),
      },
    };
  }

  const approve = new RegExp(`^/owner/sms/messages/${ID}/approve$`).exec(path);
  if (approve && method === 'POST') {
    v.keys(body, []);
    return {
      data: await call('owner-sms-approve', {
        id: v.uuid(approve[1]).toLowerCase(),
      }),
    };
  }

  if (route === 'POST /owner/sms/rehearsals') {
    v.keys(body, ['kind', 'id', 'idempotencyKey']);
    const key = v.idempotency(body.idempotencyKey);
    let target: RehearsalTarget = {};
    let id: string;
    if (body.kind === 'message') {
      id = v.uuid(body.id).toLowerCase();
    } else if (body.kind === 'milestone') {
      if (!isMilestoneKey(body.id)) v.invalid();
      id = body.id;
      target = MILESTONE_TARGETS[id] ?? {};
    } else return v.invalid();
    // The LIVE text, from the same records and templates as LIVE uses.
    const source = await call<{ liveBody: string; seedKey?: string | null }>(
      'owner-sms-rehearsal-source',
      {
        kind: body.kind,
        id,
        journey: { ...JOURNEY_TEMPLATES, invitations: INVITATION_TEMPLATES },
      },
    );
    if (source.seedKey) target = SEED_TARGETS[source.seedKey] ?? target;
    const text = rehearsalSms(source.liveBody, target);
    if (text.length > 1600) v.invalid();
    const created = await call<{
      rehearsal: { id: string; state: string };
      duplicate: boolean;
    }>('owner-sms-rehearsal-create', {
      idempotencyKey: key,
      kind: body.kind,
      id,
      liveBody: source.liveBody,
      body: text,
    });
    // A repeated click is the same rehearsal: never a second SMS.
    if (created.duplicate) return { data: created };
    const sent = await deliverSms(db, env, send, {
      audience: 'owner-test',
      body: text,
    });
    const result = await call('owner-sms-rehearsal-result', {
      id: created.rehearsal.id,
      state: sent.state === 'accepted' ? 'accepted' : 'failed',
      providerSid: sent.state === 'accepted' ? sent.providerSid : null,
      error: sent.state === 'accepted' ? null : sent.error,
    });
    return { data: result, status: 201 };
  }
  return undefined;
}
