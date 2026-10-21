/**
 * S3-compatible object storage for the protected films (ADR-027): Cloudflare
 * R2 by default (any S3-compatible service works). AWS Signature Version 4,
 * written against Web Crypto so it runs in the Netlify function, in Node
 * tools and (never exercised there) in the browser's TEST office, which
 * bundles media.ts. No SDK, no new dependency.
 *
 * A presigned GET signs only the host, so the iPhone's own Range and
 * playback headers pass untouched: seeking and partial downloads work.
 */

export interface S3Config {
  /** `https://<account id>.r2.cloudflarestorage.com` (no bucket, no slash). */
  endpoint: string;
  /** R2 ignores it ("auto"); other services need their own. */
  region: string;
  accessKeyId: string;
  secretAccessKey: string;
}

/** The storage configured for this deployment, or null (not configured). */
export function s3Config(env: NodeJS.ProcessEnv): S3Config | null {
  const endpoint = env.MEDIA_S3_ENDPOINT?.trim().replace(/\/+$/, '');
  const accessKeyId = env.MEDIA_S3_ACCESS_KEY_ID?.trim();
  const secretAccessKey = env.MEDIA_S3_SECRET_ACCESS_KEY?.trim();
  if (!endpoint || !accessKeyId || !secretAccessKey) return null;
  return {
    endpoint,
    region: env.MEDIA_S3_REGION?.trim() || 'auto',
    accessKeyId,
    secretAccessKey,
  };
}

const encoder = new TextEncoder();
const hex = (bytes: ArrayBuffer) =>
  Array.from(new Uint8Array(bytes), (b) =>
    b.toString(16).padStart(2, '0'),
  ).join('');

export async function sha256Hex(data: string | Uint8Array): Promise<string> {
  const bytes = typeof data === 'string' ? encoder.encode(data) : data;
  return hex(await crypto.subtle.digest('SHA-256', bytes as BufferSource));
}

async function hmac(key: ArrayBuffer | Uint8Array, data: string) {
  const imported = await crypto.subtle.importKey(
    'raw',
    key as BufferSource,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  return crypto.subtle.sign('HMAC', imported, encoder.encode(data));
}

/** RFC 3986 encoding, as SigV4 requires (encodeURIComponent leaves !'()*). */
const encode = (value: string) =>
  encodeURIComponent(value).replace(
    /[!'()*]/g,
    (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`,
  );

/** An object key as a path: each segment encoded, the slashes kept. */
export const encodeKey = (key: string) => key.split('/').map(encode).join('/');

/** Path-style address of an object (R2 and most S3 services accept it). */
export const objectUrl = (config: S3Config, bucket: string, key: string) =>
  new URL(`${config.endpoint}/${encode(bucket)}/${encodeKey(key)}`);

const stamp = (at: Date) => {
  const amzDate = at.toISOString().replace(/[-:]/g, '').replace(/\.\d+/, '');
  return { amzDate, date: amzDate.slice(0, 8) };
};

async function signature(
  config: S3Config,
  date: string,
  stringToSign: string,
): Promise<string> {
  const kDate = await hmac(
    encoder.encode(`AWS4${config.secretAccessKey}`),
    date,
  );
  const kRegion = await hmac(kDate, config.region);
  const kService = await hmac(kRegion, 's3');
  const kSigning = await hmac(kService, 'aws4_request');
  return hex(await hmac(kSigning, stringToSign));
}

const canonicalQuery = (params: [string, string][]) =>
  params
    .map(([k, v]) => [encode(k), encode(v)] as const)
    .sort(([a, av], [b, bv]) => (a < b ? -1 : a > b ? 1 : av < bv ? -1 : 1))
    .map(([k, v]) => `${k}=${v}`)
    .join('&');

/**
 * A presigned URL: anyone holding it may `method` the object until it
 * expires (R2 allows at most 7 days), and nothing else.
 */
export async function presign({
  config,
  url,
  method = 'GET',
  expiresIn,
  now = new Date(),
}: {
  config: S3Config;
  url: URL;
  method?: string;
  expiresIn: number;
  now?: Date;
}): Promise<string> {
  const { amzDate, date } = stamp(now);
  const scope = `${date}/${config.region}/s3/aws4_request`;
  const params: [string, string][] = [
    ...[...url.searchParams.entries()],
    ['X-Amz-Algorithm', 'AWS4-HMAC-SHA256'],
    ['X-Amz-Credential', `${config.accessKeyId}/${scope}`],
    ['X-Amz-Date', amzDate],
    ['X-Amz-Expires', String(Math.round(expiresIn))],
    ['X-Amz-SignedHeaders', 'host'],
  ];
  const query = canonicalQuery(params);
  const request = [
    method,
    url.pathname,
    query,
    `host:${url.host}\n`,
    'host',
    'UNSIGNED-PAYLOAD',
  ].join('\n');
  const toSign = [
    'AWS4-HMAC-SHA256',
    amzDate,
    scope,
    await sha256Hex(request),
  ].join('\n');
  const signed = await signature(config, date, toSign);
  return `${url.origin}${url.pathname}?${query}&X-Amz-Signature=${signed}`;
}

/**
 * Headers for an authenticated request (Authorization header form), for
 * the upload tool: multipart uploads and checks. `payloadHash` is the
 * body's SHA-256, or UNSIGNED-PAYLOAD.
 */
export async function signedHeaders({
  config,
  url,
  method,
  headers = {},
  payloadHash = 'UNSIGNED-PAYLOAD',
  now = new Date(),
}: {
  config: S3Config;
  url: URL;
  method: string;
  headers?: Record<string, string>;
  payloadHash?: string;
  now?: Date;
}): Promise<Record<string, string>> {
  const { amzDate, date } = stamp(now);
  const scope = `${date}/${config.region}/s3/aws4_request`;
  const all: Record<string, string> = {
    ...Object.fromEntries(
      Object.entries(headers).map(([k, v]) => [k.toLowerCase(), v.trim()]),
    ),
    host: url.host,
    'x-amz-content-sha256': payloadHash,
    'x-amz-date': amzDate,
  };
  const names = Object.keys(all).sort();
  const request = [
    method,
    url.pathname,
    canonicalQuery([...url.searchParams.entries()]),
    names.map((n) => `${n}:${all[n]}\n`).join(''),
    names.join(';'),
    payloadHash,
  ].join('\n');
  const toSign = [
    'AWS4-HMAC-SHA256',
    amzDate,
    scope,
    await sha256Hex(request),
  ].join('\n');
  const signed = await signature(config, date, toSign);
  // fetch sets Host itself (and refuses it as a header).
  const rest = Object.fromEntries(
    Object.entries(all).filter(([name]) => name !== 'host'),
  );
  return {
    ...rest,
    authorization: `AWS4-HMAC-SHA256 Credential=${config.accessKeyId}/${scope}, SignedHeaders=${names.join(';')}, Signature=${signed}`,
  };
}
