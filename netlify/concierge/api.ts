/**
 * The concierge HTTP API, served by one Netlify Function at `/api/*`.
 * Framework-free: a Request goes in, a Response comes out.
 *
 *   GET  /api/concierge/state      schedule; records when a session is sent
 *   POST /api/concierge/activate   present a credential (link token or code)
 *   POST /api/concierge/redeem     redeem a privilege (departure session)
 *   GET  /api/owner/overview       owner console data      (x-owner-key)
 *   POST /api/owner/test           test message to Arron   (x-owner-key)
 *   POST /api/owner/resend         resend a notification   (x-owner-key)
 *   POST /api/owner/message        send / mark sent        (x-owner-key)
 *   POST /api/owner/schedule       move a release or send  (x-owner-key)
 *   POST /api/owner/session        rehearsal/display token (x-owner-key)
 *   POST /api/owner/reset          clear records           (x-owner-key)
 */
import {
  isPrivilegeId,
  PRIVILEGES,
} from '../../src/features/concierge/domain/catalogue.ts';
import {
  checkRedemption,
  IDEMPOTENCY_PATTERN,
  type ApiErrorBody,
  type ErrorCode,
} from '../../src/features/concierge/domain/contract.ts';
import {
  credentialUrl,
  isPlausibleToken,
} from '../../src/features/concierge/domain/credentials.ts';
import {
  composeMessage,
  isMessageId,
  MESSAGES,
} from '../../src/features/concierge/domain/messages.ts';
import { isPrivilegeReleased } from '../../src/features/concierge/domain/schedule.ts';
import type {
  Realm,
  Scope,
  SessionClaims,
} from '../../src/features/concierge/domain/session.ts';
import { anonymise, secretsEqual, signSession, verifySession } from './auth.ts';
import { telegramMessage } from './channels.ts';
import { configHealth } from './config.ts';
import { readShopping, requestShopping } from './shopping.ts';
import {
  conciergeState,
  deliverRedemption,
  dispatchMessage,
  keys,
  loadActivations,
  loadDispatches,
  loadOverrides,
  loadRedemptions,
  markMessageSent,
  matchCredential,
  publicRedemption,
  realmNow,
  recordActivation,
  scheduleFor,
  type RedemptionRecord,
  type ServiceDeps,
} from './service.ts';

const MAX_BODY_BYTES = 4096;
const WINDOW_MS = 15 * 60_000;
const LIMITS = { credential: 8, owner: 8, redeem: 30 } as const;

const HEADERS = {
  'content-type': 'application/json; charset=utf-8',
  'cache-control': 'no-store',
  'x-content-type-options': 'nosniff',
};

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: HEADERS });
}

function fail(status: number, error: ErrorCode, message: string, extra = {}) {
  const body: ApiErrorBody = { error, message, ...extra };
  return json(status, body);
}

class HttpError extends Error {
  constructor(readonly response: Response) {
    super('http');
  }
}

async function readBody(request: Request): Promise<Record<string, unknown>> {
  const text = await request.text();
  if (new TextEncoder().encode(text).length > MAX_BODY_BYTES) {
    throw new HttpError(fail(413, 'invalid', 'That request is too large.'));
  }
  if (text.trim() === '') return {};
  try {
    const data: unknown = JSON.parse(text);
    if (typeof data === 'object' && data !== null && !Array.isArray(data)) {
      return data as Record<string, unknown>;
    }
  } catch {
    // fall through
  }
  throw new HttpError(fail(400, 'invalid', 'That request was not understood.'));
}

function optionalString(value: unknown, max: number): string | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  if (typeof value !== 'string' || value.length > max) {
    throw new HttpError(
      fail(400, 'invalid', 'That request was not understood.'),
    );
  }
  return value;
}

function realmParam(value: unknown): Realm {
  return value === 'rehearsal' ? 'rehearsal' : 'live';
}

// ---------- Rate limiting ----------

async function overLimit(
  deps: ServiceDeps,
  bucket: keyof typeof LIMITS,
  ip: string,
): Promise<boolean> {
  const window = Math.floor(deps.clock() / WINDOW_MS);
  const entry = await deps.store.get<number>(
    `ratelimit/${bucket}/${await anonymise(ip)}/${window}`,
  );
  return (entry?.value ?? 0) >= LIMITS[bucket];
}

async function countHit(
  deps: ServiceDeps,
  bucket: keyof typeof LIMITS,
  ip: string,
) {
  const window = Math.floor(deps.clock() / WINDOW_MS);
  const key = `ratelimit/${bucket}/${await anonymise(ip)}/${window}`;
  // Best effort: an occasional lost increment under a race is acceptable.
  const entry = await deps.store.get<number>(key);
  await deps.store.put(key, (entry?.value ?? 0) + 1);
}

function limited(): Response {
  return fail(
    429,
    'rate-limited',
    'Too many attempts. Please wait a few minutes and try again.',
  );
}

// ---------- Sessions ----------

async function sessionFrom(
  deps: ServiceDeps,
  request: Request,
): Promise<{ claims: SessionClaims | null; rejected: boolean }> {
  const header = request.headers.get('authorization');
  if (!header) return { claims: null, rejected: false };
  const token = header.startsWith('Bearer ') ? header.slice(7).trim() : '';
  const secret = deps.config.sessionSecret;
  if (!token || !secret) return { claims: null, rejected: true };
  const claims = await verifySession(token, secret);
  return { claims, rejected: claims === null };
}

function issue(deps: ServiceDeps, claims: SessionClaims): Promise<string> {
  const secret = deps.config.sessionSecret;
  if (!secret) throw new HttpError(notConfigured());
  return signSession(claims, secret);
}

function notConfigured(): Response {
  return fail(
    503,
    'not-configured',
    'The concierge service has not been configured yet.',
  );
}

// ---------- Member routes ----------

async function getState(deps: ServiceDeps, request: Request) {
  const { claims, rejected } = await sessionFrom(deps, request);
  if (rejected) {
    return fail(401, 'unauthorised', 'This session is no longer valid.');
  }
  return json(200, await conciergeState(deps, claims));
}

async function activate(deps: ServiceDeps, request: Request, ip: string) {
  if (!deps.config.sessionSecret) return notConfigured();
  if (await overLimit(deps, 'credential', ip)) return limited();
  const body = await readBody(request);
  const token = optionalString(body.token, 128);
  const code = optionalString(body.code, 64);
  if (!token && !code) {
    return fail(400, 'invalid', 'Please present a credential.');
  }
  if (token && !isPlausibleToken(token)) {
    await countHit(deps, 'credential', ip);
    return fail(404, 'unrecognised', 'This credential was not recognised.');
  }
  const match = await matchCredential(deps.config, {
    ...(token ? { token } : {}),
    ...(code ? { code } : {}),
  });
  if (!match) {
    await countHit(deps, 'credential', ip);
    return fail(404, 'unrecognised', 'This credential was not recognised.');
  }
  // A device already in a realm (e.g. a rehearsal) stays in it.
  const { claims: existing } = await sessionFrom(deps, request);
  const realm = existing?.realm ?? 'live';
  const at = realmNow(deps, existing);
  const { record } = await recordActivation(
    deps,
    realm,
    match.credential,
    match.via,
    at,
  );
  const claims: SessionClaims = {
    v: 1,
    realm,
    scopes: [
      ...new Set<Scope>([...(existing?.scopes ?? []), match.credential]),
    ],
    iat: deps.clock(),
    ...(existing?.offsetMs !== undefined
      ? { offsetMs: existing.offsetMs }
      : {}),
  };
  return json(200, {
    session: await issue(deps, claims),
    credential: match.credential,
    activatedAt: record.at,
    state: await conciergeState(deps, claims),
  });
}

async function redeem(deps: ServiceDeps, request: Request, ip: string) {
  const { claims } = await sessionFrom(deps, request);
  if (!claims) {
    return fail(401, 'unauthorised', 'Please present your travel credential.');
  }
  if (!claims.scopes.includes('departure')) {
    return fail(403, 'forbidden', 'Please present your travel credential.');
  }
  if (await overLimit(deps, 'redeem', ip)) return limited();
  await countHit(deps, 'redeem', ip);
  const body = await readBody(request);
  if (!isPrivilegeId(body.privilegeId)) {
    return fail(404, 'not-found', 'That privilege does not exist.');
  }
  const privilegeId = body.privilegeId;
  if (
    typeof body.idempotencyKey !== 'string' ||
    !IDEMPOTENCY_PATTERN.test(body.idempotencyKey)
  ) {
    return fail(400, 'invalid', 'That request was not understood.');
  }
  const check = checkRedemption({
    privilegeId,
    choice: body.choice,
    note: body.note,
  });
  if (!check.ok) return fail(400, 'invalid', check.message);

  const now = realmNow(deps, claims);
  const schedule = await scheduleFor(deps, claims.realm);
  if (
    now < schedule.departureOpensAt ||
    !isPrivilegeReleased(schedule, privilegeId, now)
  ) {
    return fail(
      403,
      'not-released',
      'This privilege has not been released yet.',
    );
  }

  const key = keys.redemption(claims.realm, privilegeId);
  const record: RedemptionRecord = {
    privilegeId,
    redeemedAt: new Date(now).toISOString(),
    idempotencyKey: body.idempotencyKey,
    ...(check.choice ? { choice: check.choice } : {}),
    ...(check.note ? { note: check.note } : {}),
    notification: { status: 'pending', attempts: 0 },
  };
  if (!(await deps.store.create(key, record))) {
    const existing = (await deps.store.get<RedemptionRecord>(key))?.value;
    if (!existing) return fail(500, 'server', 'Please try again.');
    if (existing.idempotencyKey === body.idempotencyKey) {
      return json(200, {
        redemption: publicRedemption(existing),
        duplicate: true,
      });
    }
    return fail(
      409,
      'already-redeemed',
      'This privilege has already been redeemed.',
      {
        redemption: publicRedemption(existing),
      },
    );
  }
  const delivered =
    (await deliverRedemption(deps, claims.realm, privilegeId)) ?? record;
  return json(201, {
    redemption: publicRedemption(delivered),
    duplicate: false,
  });
}

async function shoppingSession(deps: ServiceDeps, request: Request) {
  const { claims } = await sessionFrom(deps, request);
  if (!claims) {
    return fail(401, 'unauthorised', 'Please present your membership first.');
  }
  if (
    !claims.scopes.includes('membership') &&
    !claims.scopes.includes('departure')
  ) {
    return fail(403, 'forbidden', 'Please present your membership first.');
  }
  return claims;
}

async function shoppingState(deps: ServiceDeps, request: Request) {
  const claims = await shoppingSession(deps, request);
  if (claims instanceof Response) return claims;
  return json(200, await readShopping(deps, claims.realm));
}

async function shoppingRequest(
  deps: ServiceDeps,
  request: Request,
  ip: string,
) {
  const claims = await shoppingSession(deps, request);
  if (claims instanceof Response) return claims;
  if (await overLimit(deps, 'redeem', ip)) return limited();
  await countHit(deps, 'redeem', ip);
  const body = await readBody(request);
  const outcome = await requestShopping(deps, claims.realm, {
    amount: body.amount,
    idempotencyKey: body.idempotencyKey,
  });
  return 'body' in outcome
    ? json(outcome.status, outcome.body)
    : json(outcome.status, { error: outcome.error, message: outcome.message });
}

// ---------- Owner routes ----------

async function ownerAuthorised(
  deps: ServiceDeps,
  request: Request,
  ip: string,
): Promise<Response | null> {
  if (!deps.config.ownerKey) {
    // Say why, without revealing anything: a short key is ignored on purpose.
    return deps.config.env.CONCIERGE_OWNER_KEY?.trim()
      ? fail(
          503,
          'not-configured',
          'CONCIERGE_OWNER_KEY is set but shorter than the 16 characters required, so it is ignored. Set a longer key and redeploy.',
        )
      : notConfigured();
  }
  if (await overLimit(deps, 'owner', ip)) return limited();
  const key = request.headers.get('x-owner-key');
  if (await secretsEqual(key, deps.config.ownerKey)) return null;
  await countHit(deps, 'owner', ip);
  return fail(401, 'unauthorised', 'The owner key was not accepted.');
}

async function overview(deps: ServiceDeps, url: URL) {
  const realm = realmParam(url.searchParams.get('realm'));
  const [schedule, overrides, activations, redemptions, dispatches] =
    await Promise.all([
      scheduleFor(deps, realm),
      loadOverrides(deps, realm),
      loadActivations(deps, realm),
      loadRedemptions(deps, realm),
      loadDispatches(deps, realm),
    ]);
  const { credentials, siteUrl } = deps.config;
  return json(200, {
    realm,
    now: deps.clock(),
    health: configHealth(deps.config),
    schedule,
    overrides,
    activations,
    redemptions,
    dispatches,
    privileges: PRIVILEGES.map(({ id, title, kind, provisional }) => ({
      id,
      title,
      kind,
      provisional: Boolean(provisional),
    })),
    messages: MESSAGES.map((message) => ({
      id: message.id,
      label: message.label,
      timing: message.timing.kind,
      sendAt: schedule.messages[message.id],
      text: composeMessage(message, siteUrl),
    })),
    credentials: {
      departure: {
        link: credentials.departure.token
          ? credentialUrl(siteUrl, credentials.departure.token)
          : null,
        code: credentials.departure.code,
      },
      membership: {
        link: credentials.membership.token
          ? credentialUrl(siteUrl, credentials.membership.token)
          : null,
        code: credentials.membership.code,
      },
    },
  });
}

async function ownerTest(deps: ServiceDeps, body: Record<string, unknown>) {
  const realm = realmParam(body.realm);
  const result = await deps.channels.arron(
    telegramMessage('THE THIRTY CLUB — TEST', [
      'Your concierge is connected. Notifications will arrive here.',
    ]),
    realm,
  );
  return json(result.ok ? 200 : 502, result);
}

async function ownerResend(deps: ServiceDeps, body: Record<string, unknown>) {
  const realm = realmParam(body.realm);
  if (!isPrivilegeId(body.privilegeId)) {
    return fail(404, 'not-found', 'That privilege does not exist.');
  }
  const key = keys.redemption(realm, body.privilegeId);
  const entry = await deps.store.get<RedemptionRecord>(key);
  if (!entry) return fail(404, 'not-found', 'Nothing has been redeemed.');
  // A resend starts a fresh round of attempts, even after delivery.
  await deps.store.replace(
    key,
    { ...entry.value, notification: { status: 'pending', attempts: 0 } },
    entry.etag,
  );
  const next = await deliverRedemption(deps, realm, body.privilegeId);
  return json(200, { redemption: next });
}

async function ownerMessage(deps: ServiceDeps, body: Record<string, unknown>) {
  const realm = realmParam(body.realm);
  if (!isMessageId(body.messageId)) {
    return fail(404, 'not-found', 'That message does not exist.');
  }
  switch (body.action) {
    case 'send': {
      const record = await dispatchMessage(deps, realm, body.messageId, {
        force: true,
      });
      return record
        ? json(200, { dispatch: record })
        : fail(409, 'invalid', 'That message is being sent right now.');
    }
    case 'mark-sent':
      return json(200, {
        dispatch: await markMessageSent(deps, realm, body.messageId),
      });
    case 'reset':
      await deps.store.remove(keys.dispatch(realm, body.messageId));
      return json(200, { dispatch: null });
    default:
      return fail(400, 'invalid', 'Unknown action.');
  }
}

async function ownerSchedule(deps: ServiceDeps, body: Record<string, unknown>) {
  const realm = realmParam(body.realm);
  const overrides = await loadOverrides(deps, realm);
  const at = body.at === null ? null : optionalString(body.at, 40);
  if (at && Number.isNaN(Date.parse(at))) {
    return fail(400, 'invalid', 'That is not a valid time.');
  }
  if (isPrivilegeId(body.privilegeId)) {
    const privileges = { ...overrides.privileges };
    if (at) privileges[body.privilegeId] = new Date(at).toISOString();
    else delete privileges[body.privilegeId];
    overrides.privileges = privileges;
  } else if (isMessageId(body.messageId)) {
    const messages = { ...overrides.messages };
    const entry = { ...messages[body.messageId] };
    if (at) entry.sendAt = new Date(at).toISOString();
    else if (body.at === null) delete entry.sendAt;
    if (typeof body.disabled === 'boolean') {
      if (body.disabled) entry.disabled = true;
      else delete entry.disabled;
    }
    messages[body.messageId] = entry;
    overrides.messages = messages;
  } else {
    return fail(404, 'not-found', 'Nothing to reschedule.');
  }
  await deps.store.put(keys.overrides(realm), overrides);
  return json(200, { schedule: await scheduleFor(deps, realm), overrides });
}

const GRANTABLE: readonly Scope[] = ['departure', 'membership'];

async function ownerSession(deps: ServiceDeps, body: Record<string, unknown>) {
  if (body.kind === 'display') {
    const realm = realmParam(body.realm);
    const claims: SessionClaims = {
      v: 1,
      realm,
      scopes: ['display'],
      iat: deps.clock(),
    };
    return json(200, { session: await issue(deps, claims) });
  }
  if (body.kind === 'rehearsal') {
    const at = typeof body.at === 'number' ? body.at : deps.clock();
    const scopes = Array.isArray(body.scopes)
      ? body.scopes.filter((scope): scope is Scope =>
          GRANTABLE.includes(scope as Scope),
        )
      : [];
    const claims: SessionClaims = {
      v: 1,
      realm: 'rehearsal',
      scopes,
      iat: deps.clock(),
      offsetMs: Math.round(at - deps.clock()),
    };
    return json(200, { session: await issue(deps, claims) });
  }
  return fail(400, 'invalid', 'Unknown session kind.');
}

async function ownerReset(deps: ServiceDeps, body: Record<string, unknown>) {
  const realm = realmParam(body.realm);
  // Live records are cleared only with an explicit confirmation phrase.
  if (realm === 'live' && body.confirm !== 'RESET LIVE') {
    return fail(400, 'invalid', 'Type RESET LIVE to clear live records.');
  }
  const found = await deps.store.list(`${realm}/`);
  const keep = keys.overrides(realm);
  await Promise.all(
    found.filter((key) => key !== keep).map((key) => deps.store.remove(key)),
  );
  return json(200, { cleared: found.filter((key) => key !== keep).length });
}

// ---------- Router ----------

export function createConciergeApi(deps: ServiceDeps) {
  return async function handle(
    request: Request,
    ip: string,
  ): Promise<Response> {
    const url = new URL(request.url);
    const route = `${request.method} ${url.pathname.replace(/\/+$/, '')}`;
    if (request.method === 'POST') {
      const origin = request.headers.get('origin');
      if (origin && new URL(origin).host !== url.host) {
        return fail(403, 'forbidden', 'Cross-site requests are not accepted.');
      }
    }
    try {
      switch (route) {
        case 'GET /api/concierge/state':
          return await getState(deps, request);
        case 'POST /api/concierge/activate':
          return await activate(deps, request, ip);
        case 'POST /api/concierge/redeem':
          return await redeem(deps, request, ip);
        case 'GET /api/concierge/shopping':
          return await shoppingState(deps, request);
        case 'POST /api/concierge/shopping':
          return await shoppingRequest(deps, request, ip);
      }
      if (url.pathname.startsWith('/api/owner/')) {
        const refused = await ownerAuthorised(deps, request, ip);
        if (refused) return refused;
        if (route === 'GET /api/owner/overview')
          return await overview(deps, url);
        if (request.method !== 'POST') {
          return fail(405, 'invalid', 'Method not allowed.');
        }
        const body = await readBody(request);
        switch (url.pathname.replace(/\/+$/, '')) {
          case '/api/owner/test':
            return await ownerTest(deps, body);
          case '/api/owner/resend':
            return await ownerResend(deps, body);
          case '/api/owner/message':
            return await ownerMessage(deps, body);
          case '/api/owner/schedule':
            return await ownerSchedule(deps, body);
          case '/api/owner/session':
            return await ownerSession(deps, body);
          case '/api/owner/reset':
            return await ownerReset(deps, body);
        }
      }
      return fail(404, 'not-found', 'There is nothing here.');
    } catch (error) {
      if (error instanceof HttpError) return error.response;
      deps.log?.('api-error', {
        route,
        error: error instanceof Error ? error.message : String(error),
      });
      return fail(
        500,
        'server',
        'The concierge was momentarily indisposed. Please try again.',
      );
    }
  };
}
