/**
 * The Private Gift Vault routes (docs/GIFT_VAULT.md). The database decides
 * every state change; this layer validates input, mints and hashes the
 * bearer secrets, rate-limits guesses and bridges Alise's existing
 * membership credential into a v1 session.
 */
import { randomInt } from 'node:crypto';
import type { OwnerVault, Session } from '../../src/shared/concierge/types.ts';
import { verifySession } from '../concierge/auth.ts';
import { hashToken, newToken } from './auth.ts';
import { BackendError, type Database } from './database.ts';
import * as v from './validation.ts';

/**
 * Casino rewards that release compartments, keyed by the server-verified
 * outcome that earns them. The id matches `CASINO_REWARD_IDS.vaultKeyOne`
 * (asserted in tests); the casino never learns what is inside.
 */
export const CASINO_VAULT_RELEASES = {
  jackpot: 'casino.vault-key-one',
} as const;

const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

/** A backup code such as `K7QM-3XRA-WP4N` (about 59 bits). */
export function newBackupCode(): string {
  const chars = Array.from(
    { length: 12 },
    () => CODE_ALPHABET[randomInt(0, CODE_ALPHABET.length)]!,
  ).join('');
  return `${chars.slice(0, 4)}-${chars.slice(4, 8)}-${chars.slice(8)}`;
}

/** Any case or spacing a person might type, or null if it cannot be a code. */
export function normaliseBackupCode(raw: unknown): string | null {
  if (typeof raw !== 'string' || raw.length > 40) return null;
  const chars = raw.toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (!/^[A-Z0-9]{12}$/.test(chars)) return null;
  return `${chars.slice(0, 4)}-${chars.slice(4, 8)}-${chars.slice(8)}`;
}

function credentials() {
  const nfcToken = newToken();
  const backupCode = newBackupCode();
  return {
    nfcToken,
    nfcTokenHash: hashToken(nfcToken),
    backupCode,
    backupCodeHash: hashToken(backupCode),
  };
}

/** Exactly one of an NFC token or a backup code, as lookup hashes. */
function credentialInput(body: Record<string, unknown>) {
  v.keys(body, ['credential', 'code']);
  if ((body.credential === undefined) === (body.code === undefined))
    v.invalid();
  if (body.credential !== undefined) {
    if (
      typeof body.credential !== 'string' ||
      !/^[A-Za-z0-9_-]{43}$/.test(body.credential)
    )
      throw new BackendError('credential-invalid');
    return { credentialHash: hashToken(body.credential) };
  }
  const code = normaliseBackupCode(body.code);
  if (!code) throw new BackendError('credential-invalid');
  return { codeHash: hashToken(code) };
}

function vaultInput(body: Record<string, unknown>) {
  v.keys(body, [
    'displayNumber',
    'clue',
    'giftLocation',
    'trigger',
    'availableAt',
    'casinoRewardId',
  ]);
  const number = v.integer(body.displayNumber);
  if (number > 999) v.invalid();
  for (const field of [body.clue, body.giftLocation])
    if (typeof field !== 'string' || field.length > 1000) v.invalid();
  if (!['manual', 'scheduled', 'casino'].includes(String(body.trigger)))
    v.invalid();
  const availableAt = v.instant(body.availableAt, true);
  if (body.trigger === 'scheduled' && !availableAt) v.invalid();
  const reward = body.casinoRewardId;
  if (
    reward !== null &&
    (typeof reward !== 'string' || !/^[a-z0-9.-]{3,80}$/.test(reward))
  )
    v.invalid();
  if (body.trigger === 'casino' && reward === null) v.invalid();
  return {
    displayNumber: number,
    clue: (body.clue as string).trim(),
    giftLocation: (body.giftLocation as string).trim(),
    trigger: body.trigger,
    availableAt,
    casinoRewardId: reward,
  };
}

/**
 * Exchanges a verified live-realm concierge session (the membership card or
 * travel credential Alise already presented) for a v1 member session. A
 * rehearsal session is refused: rehearsal never touches the live vault.
 */
export async function bridgeMemberSession(
  request: Request,
  db: Database,
  env: NodeJS.ProcessEnv,
  token: string,
): Promise<Session> {
  const secret = env.CONCIERGE_SESSION_SECRET?.trim();
  if (!secret || secret.length < 24) throw new BackendError('not-configured');
  const header = request.headers.get('authorization') ?? '';
  const legacy = header.startsWith('Bearer ') ? header.slice(7).trim() : '';
  const claims = legacy ? await verifySession(legacy, secret) : null;
  if (!claims) throw new BackendError('unauthorised');
  if (claims.realm !== 'live') throw new BackendError('forbidden');
  if (
    !claims.scopes.includes('membership') &&
    !claims.scopes.includes('departure')
  )
    throw new BackendError('unauthorised');
  return db.action<Session>(null, 'system', 'system-member-bridge', {
    hash: hashToken(token),
  });
}

/**
 * The physical membership card (ADR-023): a live-realm concierge session
 * that carries the `membership` credential, which only presenting the card
 * (its /c/<token> link or its printed code) grants. The travel credential
 * does not count. Verified with the concierge's own secret, server-side.
 */
export async function requireMembershipCard(
  request: Request,
  env: NodeJS.ProcessEnv,
): Promise<void> {
  const secret = env.CONCIERGE_SESSION_SECRET?.trim();
  if (!secret || secret.length < 24) throw new BackendError('not-configured');
  const header = request.headers.get('authorization') ?? '';
  const legacy = header.startsWith('Bearer ') ? header.slice(7).trim() : '';
  const claims = legacy ? await verifySession(legacy, secret) : null;
  if (!claims) throw new BackendError('unauthorised');
  if (claims.realm !== 'live') throw new BackendError('forbidden');
  if (!claims.scopes.includes('membership'))
    throw new BackendError('unauthorised');
}

/** Releases compartments a server-verified casino outcome has earned. */
export async function releaseCasinoVaults(
  db: Database,
  outcome: string,
): Promise<void> {
  const rewardId =
    CASINO_VAULT_RELEASES[outcome as keyof typeof CASINO_VAULT_RELEASES];
  if (!rewardId) return;
  try {
    await db.action(null, 'system', 'system-vault-casino', { rewardId });
  } catch {
    // The play is already recorded; the next qualifying play retries.
    console.error('[backend] vault release failed');
  }
}

interface VaultRouteContext {
  route: string;
  path: string;
  method: string;
  body: Record<string, unknown>;
  session: Session;
  db: Database;
  env: NodeJS.ProcessEnv;
  origin: string;
  ip: string;
}

const ID = '[a-f0-9-]{36}';

/** The vault's routes, or undefined when the request is not one of them. */
export async function vaultRoute({
  route,
  path,
  method,
  body,
  session,
  db,
  env,
  origin,
  ip,
}: VaultRouteContext): Promise<{ data: unknown; status?: number } | undefined> {
  const call = <T = Record<string, unknown>>(
    action: string,
    input: Record<string, unknown> = {},
  ) => db.action<T>(session.memberId, session.role, action, input);
  const site = (env.CONCIERGE_SITE_URL?.trim() || origin).replace(/\/$/, '');
  const withUrl = (vault: Omit<OwnerVault, 'nfcUrl'>): OwnerVault => ({
    ...vault,
    nfcUrl: `${site}/v/${vault.nfcToken}`,
  });
  const ownerVault = async (action: string, input: Record<string, unknown>) => {
    const result = await call<{ vault: Omit<OwnerVault, 'nfcUrl'> }>(
      action,
      input,
    );
    return { vault: withUrl(result.vault) };
  };

  if (route === 'GET /vaults') return { data: await call('vault-list') };
  if (route === 'POST /vaults/open') {
    if (session.role !== 'member') throw new BackendError('forbidden');
    const bucket = `vault:${hashToken(ip)}`;
    const rate = await db.action<{ allowed: boolean }>(
      null,
      'system',
      'system-vault-attempts',
      { bucket },
    );
    if (!rate.allowed) throw new BackendError('rate-limited');
    try {
      return { data: await call('vault-open', credentialInput(body)) };
    } catch (error) {
      if (error instanceof BackendError && error.code === 'credential-invalid')
        await db.action(null, 'system', 'system-vault-failure', { bucket });
      throw error;
    }
  }

  if (!path.startsWith('/owner/vaults')) return undefined;
  if (session.role !== 'owner') throw new BackendError('forbidden');
  if (route === 'GET /owner/vaults') {
    const result = await call<{
      opensAt: string;
      vaults: Omit<OwnerVault, 'nfcUrl'>[];
    }>('owner-vault-list');
    return { data: { ...result, vaults: result.vaults.map(withUrl) } };
  }
  if (route === 'POST /owner/vaults')
    return {
      data: await ownerVault('owner-vault-create', {
        ...vaultInput(body),
        ...credentials(),
      }),
      status: 201,
    };
  if (route === 'POST /owner/vaults/verify')
    return { data: await call('owner-vault-verify', credentialInput(body)) };
  const id = new RegExp(`^/owner/vaults/(${ID})(?:/([a-z-]+))?$`).exec(path);
  if (!id) return undefined;
  const vaultId = v.uuid(id[1]);
  const verb = id[2];
  if (method === 'PATCH' && !verb)
    return {
      data: await ownerVault('owner-vault-update', {
        ...vaultInput(body),
        id: vaultId,
      }),
    };
  if (method === 'GET' && verb === 'preview')
    return { data: await call('owner-vault-preview', { id: vaultId }) };
  if (method !== 'POST') return undefined;
  v.keys(body, []);
  if (verb === 'ready' || verb === 'lock' || verb === 'open')
    return { data: await ownerVault(`owner-vault-${verb}`, { id: vaultId }) };
  if (verb === 'rotate-credential') {
    const { nfcToken, nfcTokenHash } = credentials();
    return {
      data: await ownerVault('owner-vault-rotate', {
        id: vaultId,
        nfcToken,
        nfcTokenHash,
      }),
    };
  }
  if (verb === 'rotate-code') {
    const { backupCode, backupCodeHash } = credentials();
    return {
      data: await ownerVault('owner-vault-rotate', {
        id: vaultId,
        backupCode,
        backupCodeHash,
      }),
    };
  }
  return undefined;
}
