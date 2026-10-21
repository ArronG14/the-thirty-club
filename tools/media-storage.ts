/**
 * Protected films in Supabase Storage (ADR-026, docs/MEDIA_DELIVERY.md).
 *
 *   npm run media:verify                      read-only checks
 *   npm run media:upload -- <dir>             dry run: what would happen
 *   npm run media:upload -- <dir> --confirm   upload (owner-approved only)
 *
 * <dir> holds the streaming prints made by tools/transcode-streaming-film
 * (thirty-club-birthday-film-1080p.mp4, …-720p.mp4,
 * nyla-casino-surprise-1080x1920.mp4). Needs SUPABASE_URL and
 * SUPABASE_SERVICE_ROLE_KEY in the environment (or .env); the key is never
 * printed. Uploading creates the bucket PRIVATE if it is missing, refuses a
 * public one, and uses Supabase's resumable (TUS) upload in 6 MB chunks, so
 * a dropped connection resumes rather than restarts. An object that already
 * exists is left alone unless --replace is given.
 *
 * Verify (after upload, from anywhere — run it again from Jamaica): each
 * object exists with its expected size and video/mp4; a signed URL answers
 * byte ranges with 206 at the start, middle and end; the first bytes are
 * `ftyp` then `moov` (fast start); the public URL is refused; and the
 * throughput of a 16 MB range read is reported.
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

const CHUNK = 6 * 1024 * 1024; // Supabase's required TUS chunk size.
const LIMIT_BYTES = 600 * 1024 * 1024; // The bucket's own per-file limit.

const [command, dir, ...flags] = process.argv.slice(2);
const confirm = flags.includes('--confirm');
const replace = flags.includes('--replace');
const base = process.env.SUPABASE_URL?.replace(/\/$/, '');
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

function fail(message: string): never {
  console.error(`✗ ${message}`);
  process.exit(1);
}
if (!base || !key)
  fail(
    'SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set (never commit them).',
  );
// http only for a local stand-in (the tool's own rehearsal).
if (!/^https:\/\/|^http:\/\/127\.0\.0\.1:/.test(base))
  fail('SUPABASE_URL must be https://');

const auth = { apikey: key, authorization: `Bearer ${key}` };

/** Every object, with the local file it comes from. */
const objects = Object.entries(MEDIA_OBJECTS).flatMap(
  ([id, o]: [string, MediaObject]) =>
    [o.standard, o.lighter]
      .filter((path): path is string => path !== null)
      .map((path) => ({ id, path, file: basename(path) })),
);

async function bucket(): Promise<{ public: boolean } | null> {
  const response = await fetch(`${base}/storage/v1/bucket/${MEDIA_BUCKET}`, {
    headers: auth,
  });
  if (response.status === 404 || response.status === 400) return null;
  if (!response.ok) fail(`reading the bucket: HTTP ${response.status}`);
  return (await response.json()) as { public: boolean };
}

/**
 * Whether an object exists, its size and type: by a signed one-byte read,
 * which is exactly what the iPhone will do (and works on every Storage
 * version). Null when it is not there.
 */
async function info(
  path: string,
): Promise<{ size: number; type: string } | null> {
  const signing = await fetch(
    `${base}/storage/v1/object/sign/${MEDIA_BUCKET}/${path}`,
    {
      method: 'POST',
      headers: { ...auth, 'content-type': 'application/json' },
      body: JSON.stringify({ expiresIn: 60 }),
    },
  );
  const signed = (await signing.json().catch(() => ({}))) as {
    signedURL?: string;
  };
  if (!signing.ok || !signed.signedURL) return null;
  const probe = await fetch(`${base}/storage/v1${signed.signedURL}`, {
    headers: { range: 'bytes=0-0' },
  });
  await probe.arrayBuffer();
  if (!probe.ok) return null;
  return {
    size: Number(probe.headers.get('content-range')?.split('/')[1] ?? -1),
    type: probe.headers.get('content-type') ?? '',
  };
}

async function sign(path: string, seconds: number): Promise<string> {
  const response = await fetch(
    `${base}/storage/v1/object/sign/${MEDIA_BUCKET}/${path}`,
    {
      method: 'POST',
      headers: { ...auth, 'content-type': 'application/json' },
      body: JSON.stringify({ expiresIn: seconds }),
    },
  );
  const data = (await response.json()) as { signedURL?: string };
  if (!response.ok || !data.signedURL)
    fail(`signing ${path}: HTTP ${response.status}`);
  return `${base}/storage/v1${data.signedURL}`;
}

async function sha256(file: string): Promise<string> {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(file))
    hash.update(chunk as Buffer);
  return hash.digest('hex');
}

async function upload(file: string, path: string) {
  const size = statSync(file).size;
  const meta = Object.entries({
    bucketName: MEDIA_BUCKET,
    objectName: path,
    contentType: 'video/mp4',
    cacheControl: '3600',
  })
    .map(([k, v]) => `${k} ${Buffer.from(v).toString('base64')}`)
    .join(',');
  const created = await fetch(`${base}/storage/v1/upload/resumable`, {
    method: 'POST',
    headers: {
      ...auth,
      'tus-resumable': '1.0.0',
      'upload-length': String(size),
      'upload-metadata': meta,
      'x-upsert': replace ? 'true' : 'false',
    },
  });
  if (created.status === 413)
    fail(
      `${basename(file)} (${(size / 1e6).toFixed(0)} MB) exceeds the project's upload limit. Raise the global file size limit (Supabase → Storage → Settings; the Free plan cannot exceed 50 MB).`,
    );
  if (created.status !== 201)
    fail(
      `starting the upload of ${basename(file)}: HTTP ${created.status} ${await created.text()}`,
    );
  const location = created.headers.get('location');
  if (!location) fail('the upload service gave no location');
  const handle = await open(file, 'r');
  let offset = 0;
  let tries = 0;
  try {
    while (offset < size) {
      const length = Math.min(CHUNK, size - offset);
      const buffer = Buffer.alloc(length);
      await handle.read(buffer, 0, length, offset);
      const response = await fetch(location, {
        method: 'PATCH',
        headers: {
          ...auth,
          'tus-resumable': '1.0.0',
          'upload-offset': String(offset),
          'content-type': 'application/offset+octet-stream',
        },
        body: buffer,
      }).catch(() => null);
      if (response?.status === 204) {
        offset = Number(response.headers.get('upload-offset'));
        tries = 0;
        process.stdout.write(
          `\r  ${basename(file)} ${((100 * offset) / size).toFixed(0)}%   `,
        );
        continue;
      }
      // Dropped or refused: ask the server where it got to, then resume.
      if (++tries > 8)
        fail(`uploading ${basename(file)} stalled at ${offset} bytes`);
      await new Promise((r) => setTimeout(r, 2000 * tries));
      const head = await fetch(location, {
        method: 'HEAD',
        headers: { ...auth, 'tus-resumable': '1.0.0' },
      }).catch(() => null);
      const at = Number(head?.headers.get('upload-offset'));
      if (Number.isFinite(at)) offset = at;
    }
  } finally {
    await handle.close();
  }
  process.stdout.write('\n');
}

async function verify() {
  let failures = 0;
  const check = (ok: boolean, label: string) => {
    console.log(`  ${ok ? '✓' : '✗'} ${label}`);
    if (!ok) failures++;
  };
  const found = await bucket();
  check(found !== null, `bucket ${MEDIA_BUCKET} exists`);
  check(found?.public === false, `bucket ${MEDIA_BUCKET} is private`);
  for (const { path, file } of objects) {
    console.log(`${file}`);
    const meta = await info(path);
    check(meta !== null, 'uploaded');
    if (!meta) continue;
    check(meta.type === 'video/mp4', `content type video/mp4 (${meta.type})`);
    const size = meta.size;
    const url = await sign(path, 600);
    const range = async (from: number, to: number) =>
      fetch(url, { headers: { range: `bytes=${from}-${to}` } });
    const first = await range(0, 65535);
    const head = Buffer.from(await first.arrayBuffer());
    check(first.status === 206, `byte range at the start → ${first.status}`);
    check(
      first.headers.get('content-type') === 'video/mp4',
      `served as video/mp4 (${first.headers.get('content-type')})`,
    );
    check(
      head.subarray(4, 8).toString('latin1') === 'ftyp' &&
        head.includes(Buffer.from('moov')),
      'fast start: ftyp, then moov in the first 64 KB',
    );
    const total = Number(first.headers.get('content-range')?.split('/')[1]);
    check(total === size || size < 0, `size ${total} bytes`);
    const middle = await range(
      Math.floor(total / 2),
      Math.floor(total / 2) + 1023,
    );
    check(
      middle.status === 206,
      `byte range in the middle (seeking) → ${middle.status}`,
    );
    await middle.arrayBuffer();
    const end = await range(total - 1024, total - 1);
    check(end.status === 206, `byte range at the end → ${end.status}`);
    await end.arrayBuffer();
    const started = Date.now();
    const sample = await range(0, Math.min(total, 16 * 1024 * 1024) - 1);
    const bytes = (await sample.arrayBuffer()).byteLength;
    const mbps = (bytes * 8) / 1e6 / ((Date.now() - started) / 1000);
    console.log(
      `  · ${(bytes / 1e6).toFixed(1)} MB read at ${mbps.toFixed(1)} Mbit/s from here`,
    );
    const publicUrl = `${base}/storage/v1/object/public/${MEDIA_BUCKET}/${path}`;
    const open = await fetch(publicUrl, { headers: { range: 'bytes=0-0' } });
    await open.arrayBuffer();
    check(open.status >= 400, `public address refused → ${open.status}`);
    const expired = await fetch(url.replace(/token=[^&]+/, 'token=invalid'), {
      headers: { range: 'bytes=0-0' },
    });
    await expired.arrayBuffer();
    check(
      expired.status >= 400,
      `a forged or expired token refused → ${expired.status}`,
    );
  }
  if (failures) fail(`${failures} check(s) failed`);
  console.log('All protected-media checks passed.');
}

if (command === 'verify') {
  await verify();
} else if (command === 'upload') {
  if (!dir)
    fail('usage: npm run media:upload -- <dir> [--confirm] [--replace]');
  for (const { file } of objects) {
    const local = join(dir, file);
    try {
      statSync(local);
    } catch {
      fail(`missing ${local}`);
    }
  }
  console.log(
    `Project: ${new URL(base).host}  bucket: ${MEDIA_BUCKET} (private)`,
  );
  for (const { file, path } of objects) {
    const local = join(dir, file);
    const size = statSync(local).size;
    const existing = await info(path);
    console.log(
      `${file}  ${(size / 1e6).toFixed(1)} MB  sha256 ${(await sha256(local)).slice(0, 16)}…  → ${existing ? (replace ? 'replace' : 'already uploaded, kept') : 'upload'}`,
    );
  }
  if (!confirm) {
    console.log(
      '\nDry run. Nothing was changed. Add --confirm once the owner has approved.',
    );
    process.exit(0);
  }
  const found = await bucket();
  if (found?.public) fail(`bucket ${MEDIA_BUCKET} is PUBLIC; refusing.`);
  if (!found) {
    const created = await fetch(`${base}/storage/v1/bucket`, {
      method: 'POST',
      headers: { ...auth, 'content-type': 'application/json' },
      body: JSON.stringify({
        id: MEDIA_BUCKET,
        name: MEDIA_BUCKET,
        public: false,
        file_size_limit: LIMIT_BYTES,
        allowed_mime_types: ['video/mp4'],
      }),
    });
    if (!created.ok)
      fail(
        `creating the private bucket: HTTP ${created.status} ${await created.text()}`,
      );
    console.log(`Created private bucket ${MEDIA_BUCKET}.`);
  }
  for (const { file, path } of objects) {
    if (!replace && (await info(path))) continue;
    await upload(join(dir, file), path);
  }
  await verify();
} else {
  fail('usage: media:verify | media:upload -- <dir> [--confirm] [--replace]');
}
