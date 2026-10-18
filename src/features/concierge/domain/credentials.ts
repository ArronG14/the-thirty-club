/**
 * Physical credentials. Each NFC tag carries a plain URL,
 * `https://<site>/c/<token>`, which any iPhone opens in Safari with no app
 * and no Web NFC. A short manual code (printed on the object) is the
 * fallback. Both are bearer secrets checked by the concierge service; the
 * website never decides on its own whether a credential is genuine.
 */

export type CredentialId = 'departure' | 'membership';

export const CREDENTIAL_IDS: readonly CredentialId[] = [
  'departure',
  'membership',
];

export const CREDENTIAL_PATH = '/c/';

/** Tokens are URL-safe and contain no dots (dotted paths are files). */
const TOKEN_PATTERN = /^[A-Za-z0-9_-]{8,128}$/;

export function isPlausibleToken(value: string): boolean {
  return TOKEN_PATTERN.test(value);
}

/**
 * Codes are forgiving: case, spaces and punctuation are ignored, so
 * "tc-3010 2410" and "TC30102410" are the same code.
 */
export function normaliseCode(input: string): string {
  return input
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .slice(0, 64);
}

export function credentialUrl(siteUrl: string, token: string): string {
  return `${siteUrl.replace(/\/+$/, '')}${CREDENTIAL_PATH}${token}`;
}

/** Where Alise goes once a credential is recognised. */
export function destinationFor(credential: CredentialId): string {
  return credential === 'departure' ? '/departure' : '/';
}
