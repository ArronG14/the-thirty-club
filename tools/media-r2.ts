/**
 * Protected films in Cloudflare R2 (ADR-027, docs/MEDIA_DELIVERY.md).
 *
 *   npm run media:verify -- [<dir>]             read-only checks
 *   npm run media:upload -- <dir>               dry run: what would happen
 *   npm run media:upload -- <dir> --confirm     upload (owner-approved only)
 *
 * <dir> holds the streaming prints (thirty-club-birthday-film-1080p.mp4,
 * …-720p.mp4, nyla-casino-surprise-1080x1920.mp4). Needs MEDIA_S3_ENDPOINT,
 * MEDIA_S3_ACCESS_KEY_ID and MEDIA_S3_SECRET_ACCESS_KEY in the environment
 * (or .env); the secret is never printed. The bucket (`ttc-media`) is
 * created by the owner in the Cloudflare dashboard, private (R2's default).
 *
 * Upload: multipart in 16 MiB parts, four at a time, each part retried, so
 * a dropped connection costs one part, not the film. Content-Type video/mp4
 * is stored with each object (R2 serves it back). An object already there
 * with the right size is kept unless --replace is given.
 *
 * Verify (run it again from Jamaica): each object exists with its expected
 * size and video/mp4; a presigned URL answers Safari's first probe
 * (bytes=0-1) and ranges at the start, middle and end with 206; sampled
 * ranges match the local print byte for byte (with <dir>); the first bytes
 * are `ftyp` then `moov` (fast start); an unsigned request, a forged
 * signature and an expired URL are all refused; throughput is reported.
 */
import { createHash } from 'node:crypto';
import { createReadStream, statSync } from 'node:fs';
import { open } from 'node:fs/promises';
import { basename, join } from 'node:path';
import {
  MEDIA_BUCKET,
  MEDIA_OBJECTS,
  type MediaObject,
} from '../netlify/backend/mediaObjects.ts';
import {
  objectUrl,
  presign,
  s3Config,
  signedHeaders,
} from '../netlify/backend/s3Presign.ts';

const PART = 16 * 1024 * 1024;
const PARALLEL = 4;

const [command, ...args] = process.argv.slice(2);
const flags = args.filter((a) => a.startsWith('--'));
const dir = args.find((a) => !a.startsWith('--'));
const confirm = flags.includes('--confirm');
const replace = flags.includes('--replace');

function fail(message: string): never {
  console.error(`✗ ${message}`);
  process.exit(1);
}
const config = s3Config(process.env);
if (!config)
  fail(
    'MEDIA_S3_ENDPOINT, MEDIA_S3_ACCESS_KEY_ID and MEDIA_S3_SECRET_ACCESS_KEY must be set (never commit them).',
  );
// http only for the local stand-in (tools/s3-standin.ts).
if (!/^https:\/\/|^http:\/\/127\.0\.0\.1:/.test(config.endpoint))
  fail(
    'MEDIA_S3_ENDPOINT must be https:// (https://<account id>.r2.cloudflarestorage.com)',
  );
if (new URL(config.endpoint).pathname !== '/')
  fail(
    'MEDIA_S3_ENDPOINT is the account endpoint only, without the bucket name.',
  );

const objects = Object.entries(MEDIA_OBJECTS).flatMap(
  ([id, o]: [string, MediaObject]) =>
    [o.standard, o.lighter]
      .filter((path): path is string => path !== null)
      .map((path) => ({ id, path, file: basename(path) })),
);

async function s3(
  method: string,
  path: string,
  {
    query = {},
    headers = {},
    body,
  }: {
    query?: Record<string, string>;
    headers?: Record<string, string>;
    body?: BodyInit;
  } = {},
): Promise<Response> {
  const url = objectUrl(config!, MEDIA_BUCKET, path);
  for (const [k, v] of Object.entries(query)) url.searchParams.set(k, v);
  const signed = await signedHeaders({ config: config!, url, method, headers });
  return fetch(url, {
    method,
    headers: signed,
    ...(body !== undefined ? { body } : {}),
    signal: AbortSignal.timeout(120_000),
  });
}

async function info(
  path: string,
): Promise<{ size: number; type: string } | null> {
  const response = await s3('HEAD', path);
  if (response.status === 404) return null;
  if (response.status === 403)
    fail(
      'the storage refused the credentials (check the token is scoped to the bucket ttc-media with Object Read & Write).',
    );
  if (!response.ok) fail(`checking ${path}: HTTP ${response.status}`);
  return {
    size: Number(response.headers.get('content-length') ?? -1),
    type: response.headers.get('content-type') ?? '',
  };
}

async function sha256(file: string): Promise<string> {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(file))
    hash.update(chunk as Buffer);
  return hash.digest('hex');
}

async function read(
  file: string,
  from: number,
  length: number,
): Promise<Buffer<ArrayBuffer>> {
  const handle = await open(file, 'r');
  try {
    const buffer = Buffer.alloc(length);
    await handle.read(buffer, 0, length, from);
    return buffer;
  } finally {
    await handle.close();
  }
}

async function upload(file: string, path: string) {
  const size = statSync(file).size;
  const created = await s3('POST', path, {
    query: { uploads: '' },
    headers: {
      'content-type': 'video/mp4',
      'cache-control': 'private, max-age=14400',
    },
  });
  const id = /<UploadId>([^<]+)<\/UploadId>/.exec(await created.text())?.[1];
  if (!created.ok || !id)
    fail(`starting the upload of ${basename(file)}: HTTP ${created.status}`);
  const count = Math.ceil(size / PART);
  const etags: string[] = new Array<string>(count);
  let done = 0;
  let next = 0;
  const worker = async () => {
    while (next < count) {
      const n = next++;
      const from = n * PART;
      const data = await read(file, from, Math.min(PART, size - from));
      for (let attempt = 1; ; attempt++) {
        const response = await s3('PUT', path, {
          query: { partNumber: String(n + 1), uploadId: id },
          body: data,
        }).catch(() => null);
        const etag = response?.headers.get('etag');
        if (response?.ok && etag) {
          await response.arrayBuffer();
          etags[n] = etag;
          break;
        }
        if (attempt >= 6)
          throw new Error(
            `part ${n + 1} failed (HTTP ${response?.status ?? 'network'})`,
          );
        await new Promise((r) => setTimeout(r, 2000 * attempt));
      }
      done++;
      process.stdout.write(
        `\r  ${basename(file)} ${((100 * done) / count).toFixed(0)}%   `,
      );
    }
  };
  try {
    await Promise.all(
      Array.from({ length: Math.min(PARALLEL, count) }, worker),
    );
  } catch (cause) {
    await s3('DELETE', path, { query: { uploadId: id } }).catch(() => null);
    fail(
      `uploading ${basename(file)}: ${(cause as Error).message}. Nothing was kept; run it again.`,
    );
  }
  const parts = etags
    .map(
      (etag, i) =>
        `<Part><PartNumber>${i + 1}</PartNumber><ETag>${etag}</ETag></Part>`,
    )
    .join('');
  const completed = await s3('POST', path, {
    query: { uploadId: id },
    headers: { 'content-type': 'application/xml' },
    body: `<CompleteMultipartUpload>${parts}</CompleteMultipartUpload>`,
  });
  const answer = await completed.text();
  if (!completed.ok || answer.includes('<Error>'))
    fail(
      `completing the upload of ${basename(file)}: HTTP ${completed.status} ${answer.slice(0, 200)}`,
    );
  process.stdout.write('\n');
}

async function verify(local?: string) {
  let failures = 0;
  const check = (ok: boolean, label: string) => {
    console.log(`  ${ok ? '✓' : '✗'} ${label}`);
    if (!ok) failures++;
  };
  console.log(
    `Storage: ${new URL(config!.endpoint).host}  bucket: ${MEDIA_BUCKET}`,
  );
  for (const { path, file } of objects) {
    console.log(file);
    const meta = await info(path);
    check(meta !== null, 'uploaded');
    if (!meta) continue;
    const localFile = local ? join(local, file) : null;
    const localSize = localFile ? statSync(localFile).size : null;
    check(
      localSize === null || meta.size === localSize,
      `size ${meta.size} bytes${localSize === null ? '' : ` (local ${localSize})`}`,
    );
    check(meta.type === 'video/mp4', `content type video/mp4 (${meta.type})`);
    const address = objectUrl(config!, MEDIA_BUCKET, path);
    const url = await presign({
      config: config!,
      url: address,
      expiresIn: 600,
    });
    const range = async (from: number, to: number) => {
      const response = await fetch(url, {
        headers: { range: `bytes=${from}-${to}` },
      });
      return { response, data: Buffer.from(await response.arrayBuffer()) };
    };
    const probe = await range(0, 1);
    check(
      probe.response.status === 206 && probe.data.length === 2,
      `Safari's first probe (bytes=0-1) → ${probe.response.status}, ${probe.data.length} bytes`,
    );
    check(
      probe.response.headers.get('content-range') === `bytes 0-1/${meta.size}`,
      `content-range ${probe.response.headers.get('content-range')}`,
    );
    const first = await range(0, 65535);
    check(
      first.response.status === 206,
      `byte range at the start → ${first.response.status}`,
    );
    check(
      first.response.headers.get('content-type') === 'video/mp4',
      `served as video/mp4 (${first.response.headers.get('content-type')})`,
    );
    check(
      first.data.subarray(4, 8).toString('latin1') === 'ftyp' &&
        first.data.includes(Buffer.from('moov')),
      'fast start: ftyp, then moov in the first 64 KB',
    );
    const total = meta.size;
    for (const [label, at] of [
      ['a quarter in', Math.floor(total / 4)],
      ['the middle (seeking)', Math.floor(total / 2)],
      ['three quarters in', Math.floor((3 * total) / 4)],
      ['the end', total - 262144],
    ] as const) {
      const sample = await range(at, at + 262143);
      const same = localFile
        ? sample.data.equals(await read(localFile, at, 262144))
        : true;
      check(
        sample.response.status === 206 && sample.data.length === 262144 && same,
        `byte range at ${label} → ${sample.response.status}${localFile ? (same ? ', identical to the local print' : ', DIFFERENT from the local print') : ''}`,
      );
    }
    const started = Date.now();
    const sample = await range(0, Math.min(total, 16 * 1024 * 1024) - 1);
    const mbps =
      (sample.data.length * 8) / 1e6 / ((Date.now() - started) / 1000);
    console.log(
      `  · ${(sample.data.length / 1e6).toFixed(1)} MB read at ${mbps.toFixed(1)} Mbit/s from here (the 1080p print needs ~3.2, the 720p ~1.5)`,
    );
    const unsigned = await fetch(address, { headers: { range: 'bytes=0-0' } });
    await unsigned.arrayBuffer();
    check(
      unsigned.status === 400 ||
        unsigned.status === 401 ||
        unsigned.status === 403,
      `unsigned request refused → ${unsigned.status}`,
    );
    const forged = await fetch(
      url.replace(
        /X-Amz-Signature=[0-9a-f]+/,
        `X-Amz-Signature=${'0'.repeat(64)}`,
      ),
      {
        headers: { range: 'bytes=0-0' },
      },
    );
    await forged.arrayBuffer();
    check(forged.status === 403, `forged signature refused → ${forged.status}`);
  }
  // Expiry, once: a URL valid for one second, tried three seconds later.
  const short = await presign({
    config: config!,
    url: objectUrl(config!, MEDIA_BUCKET, objects[0]!.path),
    expiresIn: 1,
  });
  await new Promise((r) => setTimeout(r, 3000));
  const expired = await fetch(short, { headers: { range: 'bytes=0-0' } });
  await expired.arrayBuffer();
  check(
    expired.status === 403,
    `an expired URL is refused → ${expired.status}`,
  );
  if (failures) fail(`${failures} check(s) failed`);
  console.log('All protected-media checks passed.');
}

if (command === 'verify') {
  await verify(dir);
} else if (command === 'upload') {
  if (!dir)
    fail('usage: npm run media:upload -- <dir> [--confirm] [--replace]');
  for (const { file } of objects) {
    try {
      statSync(join(dir, file));
    } catch {
      fail(`missing ${join(dir, file)}`);
    }
  }
  console.log(
    `Storage: ${new URL(config.endpoint).host}  bucket: ${MEDIA_BUCKET} (private)`,
  );
  const plan: { file: string; path: string; send: boolean }[] = [];
  for (const { file, path } of objects) {
    const local = join(dir, file);
    const size = statSync(local).size;
    const existing = await info(path);
    const send = replace || !existing || existing.size !== size;
    plan.push({ file, path, send });
    console.log(
      `${file}  ${(size / 1e6).toFixed(1)} MB  sha256 ${(await sha256(local)).slice(0, 16)}…  → ${
        !existing
          ? 'upload'
          : existing.size !== size
            ? 'replace (size differs)'
            : replace
              ? 'replace'
              : 'already uploaded, kept'
      }`,
    );
  }
  if (!confirm) {
    console.log(
      '\nDry run. Nothing was changed. Add --confirm once the owner has approved.',
    );
    process.exit(0);
  }
  for (const { file, path, send } of plan)
    if (send) await upload(join(dir, file), path);
  await verify(dir);
} else {
  fail(
    'usage: media:verify [-- <dir>] | media:upload -- <dir> [--confirm] [--replace]',
  );
}
