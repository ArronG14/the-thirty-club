/**
 * Session signing and secret comparison with Web Crypto (no dependencies).
 */
import {
  base64UrlDecode,
  base64UrlEncode,
  encodeClaims,
  parseClaims,
  type SessionClaims,
} from '../../src/features/concierge/domain/session.ts';

const encoder = new TextEncoder();

async function hmacKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify'],
  );
}

export async function signSession(
  claims: SessionClaims,
  secret: string,
): Promise<string> {
  const payload = encodeClaims(claims);
  const signature = await crypto.subtle.sign(
    'HMAC',
    await hmacKey(secret),
    encoder.encode(payload),
  );
  return `${payload}.${base64UrlEncode(new Uint8Array(signature))}`;
}

/** The verified claims, or null for anything forged, altered or malformed. */
export async function verifySession(
  token: string,
  secret: string,
): Promise<SessionClaims | null> {
  const parts = token.split('.');
  if (parts.length !== 2 || !parts[0] || !parts[1] || token.length > 2048) {
    return null;
  }
  const [payload, signature] = parts;
  try {
    const valid = await crypto.subtle.verify(
      'HMAC',
      await hmacKey(secret),
      base64UrlDecode(signature) as BufferSource,
      encoder.encode(payload),
    );
    if (!valid) return null;
    return parseClaims(
      JSON.parse(new TextDecoder().decode(base64UrlDecode(payload))),
    );
  } catch {
    return null;
  }
}

async function digest(text: string): Promise<Uint8Array> {
  return new Uint8Array(
    await crypto.subtle.digest('SHA-256', encoder.encode(text)),
  );
}

/** Constant-time comparison (both sides hashed to equal length first). */
export async function secretsEqual(
  a: string | null | undefined,
  b: string | null | undefined,
): Promise<boolean> {
  if (!a || !b) return false;
  const [left, right] = await Promise.all([digest(a), digest(b)]);
  let difference = 0;
  for (let i = 0; i < left.length; i += 1) {
    difference |= (left[i] ?? 0) ^ (right[i] ?? 0);
  }
  return difference === 0;
}

/** A short, non-reversible label for an IP address in rate-limit keys. */
export async function anonymise(text: string): Promise<string> {
  return base64UrlEncode((await digest(`thirty-club:${text}`)).slice(0, 9));
}
