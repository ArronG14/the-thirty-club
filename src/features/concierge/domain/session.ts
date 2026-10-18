/**
 * Concierge sessions. The service signs a small claims object with
 * HMAC-SHA256 after a credential is presented; the website keeps the token
 * so later visits need no physical credential. The website only DECODES the
 * claims (it cannot verify them); the service verifies on every call.
 */
import type { CredentialId } from './credentials.ts';

/**
 * `live` is Alise's journey. `rehearsal` is the owner's isolated copy: its
 * records, notifications and clock never touch the live journey.
 */
export type Realm = 'live' | 'rehearsal';

/** A presented credential, or `display` for a paired concierge screen. */
export type Scope = CredentialId | 'display';

export interface SessionClaims {
  v: 1;
  realm: Realm;
  scopes: Scope[];
  /** Issued at, epoch ms. */
  iat: number;
  /** Rehearsal only: virtual time = real time + offsetMs. */
  offsetMs?: number;
}

const SCOPES: readonly Scope[] = ['departure', 'membership', 'display'];

export function base64UrlEncode(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

export function base64UrlDecode(text: string): Uint8Array {
  const padded = text.replace(/-/g, '+').replace(/_/g, '/');
  const binary = atob(padded + '='.repeat((4 - (padded.length % 4)) % 4));
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

export function encodeClaims(claims: SessionClaims): string {
  return base64UrlEncode(new TextEncoder().encode(JSON.stringify(claims)));
}

/** Validates the shape of decoded claims; null when malformed. */
export function parseClaims(value: unknown): SessionClaims | null {
  if (typeof value !== 'object' || value === null) return null;
  const source = value as Record<string, unknown>;
  if (source.v !== 1) return null;
  if (source.realm !== 'live' && source.realm !== 'rehearsal') return null;
  if (!Array.isArray(source.scopes)) return null;
  if (typeof source.iat !== 'number' || !Number.isFinite(source.iat)) {
    return null;
  }
  const scopes = source.scopes.filter((scope): scope is Scope =>
    SCOPES.includes(scope as Scope),
  );
  const claims: SessionClaims = {
    v: 1,
    realm: source.realm,
    scopes: [...new Set(scopes)],
    iat: source.iat,
  };
  if (
    source.realm === 'rehearsal' &&
    typeof source.offsetMs === 'number' &&
    Number.isFinite(source.offsetMs)
  ) {
    claims.offsetMs = source.offsetMs;
  }
  return claims;
}

/** Reads the claims of a token WITHOUT verifying its signature. */
export function decodeSessionClaims(token: string): SessionClaims | null {
  const [payload] = token.split('.');
  if (!payload) return null;
  try {
    return parseClaims(
      JSON.parse(new TextDecoder().decode(base64UrlDecode(payload))),
    );
  } catch {
    return null;
  }
}

export function hasScope(claims: SessionClaims | null, scope: Scope): boolean {
  return Boolean(claims?.scopes.includes(scope));
}
