import { randomInt } from 'node:crypto';
import type { Session } from '../../src/shared/concierge/types.ts';
import { chooseSlotOutcome } from '../../src/features/casino/domain/slots.ts';
import { SLOT_RULES } from '../../src/features/casino/config/casinoRules.ts';
import { BackendError, type Database } from './database.ts';
import {
  hashToken,
  newToken,
  passwordMatches,
  readToken,
  requireSession,
  sessionCookie,
} from './auth.ts';
import * as v from './validation.ts';
import { statusCallback } from './sms.ts';
import { correspondenceRoute } from './correspondence.ts';
import {
  journeyRoute,
  processJourneyEvents,
  withJourneyTemplates,
} from './journey.ts';
import { requireCommunications } from './hold.ts';
import { smsRoute } from './smsOperations.ts';
import { serviceRoute } from './service.ts';
import { casinoRoute } from './casino.ts';
import {
  bridgeMemberSession,
  releaseCasinoVaults,
  vaultRoute,
} from './vault.ts';
const statuses: Record<string, number> = {
  invalid: 400,
  unauthorised: 401,
  forbidden: 403,
  'not-found': 404,
  'not-open': 403,
  expired: 403,
  'already-redeemed': 409,
  'idempotency-conflict': 409,
  'insufficient-balance': 409,
  'rate-limited': 429,
  conflict: 409,
  'not-configured': 503,
  'vault-locked': 409,
  'credential-invalid': 404,
  'on-hold': 409,
  server: 500,
};
const messages: Record<string, string> = {
  invalid: 'Please check the details and try again.',
  unauthorised: 'Please sign in to continue.',
  forbidden: 'This action is not available to this session.',
  'not-found': 'This record could not be found.',
  'not-open': 'This privilege has not opened yet.',
  expired: 'This privilege or scheduled time has expired.',
  'already-redeemed': 'This privilege has already been claimed.',
  'idempotency-conflict':
    'This retry key was already used with different details.',
  'insufficient-balance': 'There are not enough drink vouchers.',
  'rate-limited': 'Please wait before trying again.',
  conflict: 'The record has changed or this action is unavailable.',
  'not-configured': 'The Butler’s Office is awaiting server configuration.',
  'vault-locked': 'This compartment has not yet been prepared.',
  'credential-invalid': 'This key is not recognised by the vault.',
  'on-hold':
    'Communications to Alise are on hold. Release them in the Owner Control Centre first.',
  server: 'The Butler is momentarily unavailable. Please try again.',
};
export interface ApiDeps {
  db: Database;
  env: NodeJS.ProcessEnv;
  /** The provider transport; tests and the rehearsal office pass a fake. */
  send?: typeof fetch;
}
export function createBackendApi({ db, env, send = fetch }: ApiDeps) {
  return async (request: Request, ip: string): Promise<Response> => {
    const requestId = crypto.randomUUID();
    const url = new URL(request.url);
    const path = url.pathname.replace(/\/+$/, '').replace(/^\/api\/v1/, '');
    const headers = new Headers({
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
      'x-content-type-options': 'nosniff',
      'x-request-id': requestId,
    });
    const respond = (data: unknown, status = 200) =>
      new Response(JSON.stringify(data), { status, headers });
    try {
      if (path === '/twilio/status' && request.method === 'POST')
        return await statusCallback(request, db, env);
      const mutation = ['POST', 'PATCH'].includes(request.method);
      if (!['GET', 'POST', 'PATCH'].includes(request.method))
        throw new BackendError('not-found');
      let body: Record<string, unknown> = {};
      if (mutation) {
        const origin = request.headers.get('origin');
        if (
          request.headers.get('x-concierge-request') !== '1' ||
          (origin && origin !== url.origin) ||
          request.headers.get('sec-fetch-site') === 'cross-site'
        )
          throw new BackendError('forbidden');
        if (
          !request.headers.get('content-type')?.startsWith('application/json')
        )
          v.invalid();
        const raw = await request.text();
        if (new TextEncoder().encode(raw).length > 16384)
          return respond(
            { error: 'invalid', message: 'Request too large.', requestId },
            413,
          );
        try {
          const parsed: unknown = JSON.parse(raw);
          if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed))
            v.invalid();
          body = parsed as Record<string, unknown>;
        } catch {
          v.invalid();
        }
      }
      if (
        request.method === 'POST' &&
        ['/auth/owner', '/auth/member', '/auth/member/concierge'].includes(path)
      ) {
        const rate = await db.action<{ allowed: boolean }>(
          null,
          'system',
          'system-rate',
          { bucket: `login:${hashToken(ip)}` },
        );
        if (!rate.allowed) throw new BackendError('rate-limited');
        const token = newToken();
        let session: Session;
        if (path === '/auth/owner') {
          v.keys(body, ['password']);
          if (!env.OWNER_PASSWORD_HASH)
            throw new BackendError('not-configured');
          v.text(body.password, 1, 512);
          const password = body.password as string;
          if (!(await passwordMatches(password, env.OWNER_PASSWORD_HASH)))
            throw new BackendError('unauthorised');
          session = await db.action<Session>(
            null,
            'system',
            'system-session-create',
            { hash: hashToken(token) },
          );
        } else if (path === '/auth/member/concierge') {
          v.keys(body, []);
          session = await bridgeMemberSession(request, db, env, token);
        } else {
          v.keys(body, ['token']);
          const invite = v.text(body.token, 43, 43);
          if (!/^[A-Za-z0-9_-]{43}$/.test(invite)) v.invalid();
          session = await db.action<Session>(
            null,
            'system',
            'system-member-exchange',
            { invitationHash: hashToken(invite), hash: hashToken(token) },
          );
        }
        headers.set(
          'set-cookie',
          sessionCookie(url, token, session.role === 'owner' ? 28800 : 2592000),
        );
        return respond({ session });
      }
      // Public: when the doors open early, if authorised (ADR-022). It
      // reveals only an opening time and the server's own clock.
      if (path === '/entrance' && request.method === 'GET')
        return respond(
          await db.action(
            null,
            'system',
            'system-journey-entrance',
            withJourneyTemplates(),
          ),
        );
      const session = await requireSession(db, request);
      const call = <T = Record<string, unknown>>(
        action: string,
        input: Record<string, unknown> = {},
      ) => db.action<T>(session.memberId, session.role, action, input);
      if (path === '/auth/session' && request.method === 'GET')
        return respond({ session });
      if (path === '/auth/logout' && request.method === 'POST') {
        v.keys(body, []);
        await db.action(null, 'system', 'system-session-delete', {
          hash: hashToken(readToken(request)!),
        });
        headers.set('set-cookie', sessionCookie(url, '', 0));
        return respond({ ok: true });
      }
      if (path.startsWith('/owner/') && session.role !== 'owner')
        throw new BackendError('forbidden');
      const route = `${request.method} ${path}`;
      if (
        path === '/casino' ||
        path.startsWith('/casino/spins') ||
        path.startsWith('/vouchers') ||
        path.startsWith('/owner/casino/') ||
        path.startsWith('/owner/vouchers')
      ) {
        const result = await casinoRoute({ route, path, body, session, db });
        if (result) {
          // The Casino publishes its events in its own transaction (contract
          // §2); let the Butler react now rather than at the next round. A
          // failure here never undoes the committed Casino action.
          if (request.method !== 'GET')
            await processJourneyEvents(db).catch(() => undefined);
          return respond(result.data, result.status);
        }
      }
      if (route === 'GET /privileges') return respond(await call('privileges'));
      if (route === 'GET /redemptions')
        return respond(await call('redemptions'));
      if (request.method === 'GET' && /^\/redemptions\/[^/]+$/.test(path))
        return respond(
          await call('redemption', { id: v.uuid(path.split('/')[2]) }),
        );
      if (route === 'GET /rewards/balances')
        return respond(await call('balances'));
      if (route === 'GET /rewards/transactions')
        return respond(await call('transactions'));
      if (route === 'POST /redemptions') {
        v.keys(body, [
          'privilegeId',
          'idempotencyKey',
          'amountPence',
          'quantity',
        ]);
        v.uuid(body.privilegeId);
        v.idempotency(body.idempotencyKey);
        if (body.amountPence !== undefined) v.integer(body.amountPence);
        if (
          body.quantity !== undefined &&
          (typeof body.quantity !== 'string' ||
            !/^[1-9][0-9]{0,999}$/.test(body.quantity))
        )
          v.invalid();
        const result = await call('redeem', body);
        if (result.error === 'already-redeemed')
          throw new BackendError('already-redeemed', {
            redemption: result.redemption,
          });
        return respond(result, result.duplicate ? 200 : 201);
      }
      if (route === 'POST /casino/slots/play') {
        if (session.role !== 'member') throw new BackendError('forbidden');
        v.keys(body, ['idempotencyKey']);
        v.idempotency(body.idempotencyKey);
        const ctx = await db.action<{ sequence: number; jackpotPaid: boolean }>(
          session.memberId,
          'system',
          'system-slots-context',
        );
        const outcome = chooseSlotOutcome({
          spinsPlayed: ctx.sequence,
          config: SLOT_RULES.config,
          rng: () => randomInt(0, 2 ** 32) / 2 ** 32,
          jackpotPaid: ctx.jackpotPaid,
        });
        const result = await call('slots-play', {
          ...body,
          sequence: ctx.sequence,
          stops: outcome.stops,
          outcome: outcome.evaluation.class,
        });
        if (result.outcome === 'jackpot' || ctx.jackpotPaid)
          await releaseCasinoVaults(db, 'jackpot');
        return respond(result, result.duplicate ? 200 : 201);
      }
      if (route === 'GET /owner/overview')
        return respond({
          ...(await call('owner-overview')),
          smsEnabled: env.SMS_SENDING_ENABLED === 'true',
        });
      if (route === 'POST /owner/notification-policy') {
        v.keys(body, ['transactionalSmsApproved']);
        if (typeof body.transactionalSmsApproved !== 'boolean') v.invalid();
        return respond(await call('owner-notification-policy', body));
      }
      if (route === 'GET /owner/communications')
        return respond(await call('owner-communications'));
      if (route === 'POST /owner/communications/release') {
        v.keys(body, ['confirm', 'note']);
        if (body.confirm !== 'RELEASE') v.invalid();
        if (body.note !== undefined) v.text(body.note, 0, 300);
        return respond(await call('owner-communications-release', body));
      }
      if (route === 'POST /owner/communications/hold') {
        v.keys(body, []);
        return respond(await call('owner-communications-hold'));
      }
      if (route === 'POST /owner/invitations') {
        v.keys(body, []);
        // An invitation link is how Alise is first contacted (ADR-021).
        await requireCommunications(db);
        const token = newToken();
        return respond(
          {
            token,
            ...(await call('owner-invitation', { hash: hashToken(token) })),
          },
          201,
        );
      }
      if (route === 'POST /owner/revoke-member-sessions') {
        v.keys(body, []);
        return respond(await call('owner-revoke'));
      }
      if (route === 'POST /owner/privileges') {
        v.privilege(body);
        return respond(await call('owner-privilege-create', body), 201);
      }
      if (
        request.method === 'PATCH' &&
        /^\/owner\/privileges\/[^/]+$/.test(path)
      ) {
        v.privilege(body);
        return respond(
          await call('owner-privilege-update', {
            ...body,
            id: v.uuid(path.split('/')[3]),
          }),
        );
      }
      if (
        request.method === 'POST' &&
        /^\/owner\/redemptions\/[^/]+\/fulfil$/.test(path)
      ) {
        v.keys(body, []);
        return respond(
          await call('owner-fulfil', { id: v.uuid(path.split('/')[3]) }),
        );
      }
      if (route === 'POST /owner/rewards/adjust') {
        v.keys(body, ['delta', 'reason', 'idempotencyKey']);
        v.idempotency(body.idempotencyKey);
        v.text(body.reason, 3, 280);
        if (
          typeof body.delta !== 'string' ||
          !/^-?[1-9][0-9]{0,999}$/.test(body.delta)
        )
          v.invalid();
        return respond(await call('owner-adjust', body));
      }
      if (route === 'POST /owner/messages') {
        v.message(body);
        return respond(await call('owner-message-create', body), 201);
      }
      if (
        request.method === 'PATCH' &&
        /^\/owner\/messages\/[^/]+$/.test(path)
      ) {
        v.message(body);
        return respond(
          await call('owner-message-update', {
            ...body,
            id: v.uuid(path.split('/')[3]),
          }),
        );
      }
      if (
        request.method === 'POST' &&
        /^\/owner\/messages\/[^/]+\/(approve|cancel|retry)$/.test(path)
      ) {
        v.keys(body, []);
        return respond(
          await call(`owner-message-${path.split('/')[4]}`, {
            id: v.uuid(path.split('/')[3]),
          }),
        );
      }
      const vault = await vaultRoute({
        route,
        path,
        method: request.method,
        body,
        session,
        db,
        env,
        origin: url.origin,
        ip,
      });
      if (vault) return respond(vault.data, vault.status);
      const service = await serviceRoute({
        route,
        path,
        method: request.method,
        body,
        session,
        db,
        env,
      });
      if (service) return respond(service.data, service.status);
      const desk = await correspondenceRoute({
        route,
        path,
        method: request.method,
        body,
        session,
        db,
        env,
      });
      if (desk) return respond(desk.data, desk.status);
      const sms = await smsRoute({
        route,
        path,
        method: request.method,
        body,
        session,
        db,
        env,
        send,
      });
      if (sms) return respond(sms.data, sms.status);
      const journey = await journeyRoute({
        route,
        path,
        method: request.method,
        body,
        session,
        db,
        env,
      });
      if (journey) return respond(journey.data, journey.status);
      throw new BackendError('not-found');
    } catch (error) {
      const known =
        error instanceof BackendError ? error : new BackendError('server');
      if (known.code === 'server')
        console.error('[backend]', requestId, 'Request failed');
      return respond(
        {
          error: known.code,
          message: messages[known.code],
          requestId,
          ...known.extra,
        },
        statuses[known.code] ?? 500,
      );
    }
  };
}
