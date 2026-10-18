/**
 * Optional offline recognition of the MEMBERSHIP credential only, so the
 * birthday ceremony never depends on hotel Wi-Fi. The build may carry salted
 * SHA-256 digests (VITE_MEMBERSHIP_TOKEN_SHA256, VITE_MEMBERSHIP_CODE_SHA256;
 * generate with `node tools/membership-hash.mjs`). Used only when the
 * service cannot be reached. This is ceremonial, not security: a short code's
 * digest can be brute-forced by anyone who reads the bundle (ADR-012).
 */
import { normaliseCode } from '../domain/credentials';

export type OfflineKind = 'token' | 'code';

const DIGESTS: Record<OfflineKind, string | undefined> = {
  token: import.meta.env.VITE_MEMBERSHIP_TOKEN_SHA256,
  code: import.meta.env.VITE_MEMBERSHIP_CODE_SHA256,
};

export async function membershipDigest(
  kind: OfflineKind,
  input: string,
): Promise<string> {
  const value = kind === 'code' ? normaliseCode(input) : input.trim();
  const bytes = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(`thirty-club:${kind}:${value}`),
  );
  return Array.from(new Uint8Array(bytes), (b) =>
    b.toString(16).padStart(2, '0'),
  ).join('');
}

export async function matchesOfflineMembership(
  input: string,
  kind: OfflineKind,
  digests: Record<OfflineKind, string | undefined> = DIGESTS,
): Promise<boolean> {
  const expected = digests[kind]?.trim().toLowerCase();
  if (!expected || !input || typeof crypto?.subtle === 'undefined') {
    return false;
  }
  try {
    return (await membershipDigest(kind, input)) === expected;
  } catch {
    return false;
  }
}
