/**
 * LOCAL TESTS ONLY (ADR-027). A small stand-in for Cloudflare R2's S3 API,
 * strict where it matters for the films: every request must carry a valid
 * Signature Version 4 (presigned query or Authorization header), presigned
 * URLs expire, objects keep their Content-Type, and GET answers byte ranges
 * with 206 exactly as the iPhone expects. It also accepts the multipart
 * uploads the media tool makes, so the real upload can be rehearsed.
 *
 *   node --experimental-strip-types tools/s3-standin.ts
 *
 * S3_STANDIN_PORT (4190), S3_STANDIN_DIR (where uploads are kept; a fresh
 * temporary folder by default), S3_STANDIN_SEED (a folder of streaming
 * prints, served under their real object names without copying).
 * Credentials: MEDIA_S3_ACCESS_KEY_ID / MEDIA_S3_SECRET_ACCESS_KEY.
 *
 * Test controls (unsigned, local only): GET /__stats, POST /__reset,
 * POST /__throttle?kbps=N (0 = unlimited), POST /__expire-issued (every URL
 * signed up to now reads as expired), POST /__fail?count=N or ?seconds=N
 * (the next N object reads, or every read for N seconds, answer 503, as an
 * outage would).
 */
import { createReadStream, existsSync, mkdtempSync, statSync } from 'node:fs';
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { createServer, type IncomingMessage } from 'node:http';
import { tmpdir } from 'node:os';
import { basename, dirname, join } from 'node:path';
import { Transform } from 'node:stream';
import {
  MEDIA_BUCKET,
  MEDIA_OBJECTS,
} from '../netlify/backend/mediaObjects.ts';
import {
  presign,
  signedHeaders,
  type S3Config,
} from '../netlify/backend/s3Presign.ts';

const PORT = Number(process.env.S3_STANDIN_PORT ?? 4190);
const DIR =
  process.env.S3_STANDIN_DIR ?? mkdtempSync(join(tmpdir(), 's3-standin-'));
const SEED = process.env.S3_STANDIN_SEED;
const config: S3Config = {
  endpoint: `http://127.0.0.1:${PORT}`,
  region: process.env.MEDIA_S3_REGION ?? 'auto',
  accessKeyId: process.env.MEDIA_S3_ACCESS_KEY_ID ?? 'local-standin-key',
  secretAccessKey:
    process.env.MEDIA_S3_SECRET_ACCESS_KEY ?? 'local-standin-secret',
};

interface Meta {
  type: string;
  cacheControl: string | null;
}
const seeded = new Map<string, string>();
if (SEED)
  for (const o of Object.values(MEDIA_OBJECTS))
    for (const key of [o.standard, o.lighter])
      if (key && existsSync(join(SEED, basename(key))))
        seeded.set(key, join(SEED, basename(key)));

let stats = { requests: [] as Stat[], bytes: 0 };
interface Stat {
  method: string;
  key: string;
  range: string | null;
  status: number;
  bytes: number;
  type: string | null;
}
let kbps = 0;
let expiredBefore = 0;
let failNext = 0;
let failUntil = 0;
const uploads = new Map<
  string,
  { key: string; meta: Meta; parts: Map<number, string> }
>();

const fileOf = (key: string) => seeded.get(key) ?? join(DIR, 'objects', key);
const metaOf = async (key: string): Promise<Meta | null> => {
  if (seeded.has(key)) return { type: 'video/mp4', cacheControl: null };
  try {
    return JSON.parse(
      await readFile(`${fileOf(key)}.meta.json`, 'utf8'),
    ) as Meta;
  } catch {
    return null;
  }
};

const xml = (body: string) => `<?xml version="1.0" encoding="UTF-8"?>${body}`;
const error = (code: string, message: string) =>
  xml(`<Error><Code>${code}</Code><Message>${message}</Message></Error>`);

/** Checks the request's signature; returns an error code or null. */
async function authenticate(
  req: IncomingMessage,
  url: URL,
): Promise<string | null> {
  const q = url.searchParams;
  if (q.has('X-Amz-Signature')) {
    const date = q.get('X-Amz-Date') ?? '';
    const expires = Number(q.get('X-Amz-Expires'));
    const at = new Date(
      `${date.slice(0, 4)}-${date.slice(4, 6)}-${date.slice(6, 8)}T${date.slice(9, 11)}:${date.slice(11, 13)}:${date.slice(13, 15)}Z`,
    );
    if (Number.isNaN(at.getTime()) || !(expires > 0))
      return 'AuthorizationQueryParametersError';
    const unsigned = new URL(url);
    for (const k of [
      'X-Amz-Algorithm',
      'X-Amz-Credential',
      'X-Amz-Date',
      'X-Amz-Expires',
      'X-Amz-SignedHeaders',
      'X-Amz-Signature',
    ])
      unsigned.searchParams.delete(k);
    const expected = await presign({
      config,
      url: unsigned,
      method: req.method ?? 'GET',
      expiresIn: expires,
      now: at,
    });
    if (
      new URL(expected).searchParams.get('X-Amz-Signature') !==
      q.get('X-Amz-Signature')
    )
      return 'SignatureDoesNotMatch';
    if (
      Date.now() > at.getTime() + expires * 1000 ||
      at.getTime() <= expiredBefore
    )
      return 'ExpiredRequest';
    return null;
  }
  const header = req.headers.authorization;
  if (!header) return 'AccessDenied';
  const signed = /SignedHeaders=([^,]+)/.exec(header)?.[1]?.split(';') ?? [];
  const date = String(req.headers['x-amz-date'] ?? '');
  const at = new Date(
    `${date.slice(0, 4)}-${date.slice(4, 6)}-${date.slice(6, 8)}T${date.slice(9, 11)}:${date.slice(11, 13)}:${date.slice(13, 15)}Z`,
  );
  const headers: Record<string, string> = {};
  for (const name of signed)
    if (!['host', 'x-amz-date', 'x-amz-content-sha256'].includes(name))
      headers[name] = String(req.headers[name] ?? '');
  const expected = await signedHeaders({
    config,
    url,
    method: req.method ?? 'GET',
    headers,
    payloadHash: String(req.headers['x-amz-content-sha256'] ?? ''),
    now: at,
  });
  if (expected.authorization !== header) return 'SignatureDoesNotMatch';
  if (Math.abs(Date.now() - at.getTime()) > 15 * 60_000)
    return 'RequestTimeTooSkewed';
  return null;
}

async function body(req: IncomingMessage): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(chunk as Buffer);
  return Buffer.concat(chunks);
}

const throttle = () =>
  new Transform({
    transform(chunk: Buffer, _enc, done) {
      if (!kbps) return done(null, chunk);
      const pieces: Buffer[] = [];
      for (let i = 0; i < chunk.length; i += 16 * 1024)
        pieces.push(chunk.subarray(i, i + 16 * 1024));
      const push = () => {
        const piece = pieces.shift();
        if (!piece) return done();
        this.push(piece);
        setTimeout(push, (piece.length * 8) / kbps);
      };
      push();
    },
  });

createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', config.endpoint);
  const record = (status: number, bytes = 0): Stat => {
    const entry: Stat = {
      method: req.method ?? 'GET',
      key: url.pathname,
      range: req.headers.range ?? null,
      status,
      bytes,
      type: String(res.getHeader('content-type') ?? '') || null,
    };
    stats.requests.push(entry);
    stats.bytes += bytes;
    return entry;
  };
  try {
    if (url.pathname.startsWith('/__')) {
      res.setHeader('content-type', 'application/json');
      if (url.pathname === '/__stats') return res.end(JSON.stringify(stats));
      if (url.pathname === '/__reset') {
        stats = { requests: [], bytes: 0 };
        kbps = 0;
        expiredBefore = 0;
        failNext = 0;
        failUntil = 0;
        return res.end('{}');
      }
      if (url.pathname === '/__throttle') {
        kbps = Number(url.searchParams.get('kbps') ?? 0);
        return res.end('{}');
      }
      if (url.pathname === '/__fail') {
        failNext = Number(url.searchParams.get('count') ?? 0);
        failUntil =
          Date.now() + 1000 * Number(url.searchParams.get('seconds') ?? 0);
        return res.end('{}');
      }
      if (url.pathname === '/__expire-issued') {
        expiredBefore = Date.now();
        return res.end('{}');
      }
      res.statusCode = 404;
      return res.end('{}');
    }
    res.setHeader('content-type', 'application/xml');
    const denied = await authenticate(req, url);
    if (denied) {
      res.statusCode = 403;
      record(403);
      return res.end(error(denied, 'Refused by the local R2 stand-in.'));
    }
    const [, bucket, ...rest] = url.pathname.split('/');
    const key = rest.map(decodeURIComponent).join('/');
    if (bucket !== MEDIA_BUCKET || !key) {
      res.statusCode = 404;
      record(404);
      return res.end(error('NoSuchBucket', 'Unknown bucket.'));
    }
    const q = url.searchParams;
    if (req.method === 'POST' && q.has('uploads')) {
      const id = `u${Date.now().toString(36)}${Math.random().toString(36).slice(2)}`;
      uploads.set(id, {
        key,
        meta: {
          type: String(
            req.headers['content-type'] ?? 'application/octet-stream',
          ),
          cacheControl: (req.headers['cache-control'] as string) ?? null,
        },
        parts: new Map(),
      });
      await mkdir(join(DIR, 'parts', id), { recursive: true });
      record(200);
      return res.end(
        xml(
          `<InitiateMultipartUploadResult><Bucket>${bucket}</Bucket><Key>${key}</Key><UploadId>${id}</UploadId></InitiateMultipartUploadResult>`,
        ),
      );
    }
    if (req.method === 'PUT' && q.has('uploadId')) {
      const upload = uploads.get(q.get('uploadId')!);
      if (!upload) {
        res.statusCode = 404;
        return res.end(error('NoSuchUpload', 'Unknown upload.'));
      }
      const n = Number(q.get('partNumber'));
      const data = await body(req);
      const path = join(DIR, 'parts', q.get('uploadId')!, String(n));
      await writeFile(path, data);
      upload.parts.set(n, path);
      res.setHeader('etag', `"part-${n}-${data.length}"`);
      record(200);
      return res.end();
    }
    if (req.method === 'POST' && q.has('uploadId')) {
      const id = q.get('uploadId')!;
      const upload = uploads.get(id);
      if (!upload) {
        res.statusCode = 404;
        return res.end(error('NoSuchUpload', 'Unknown upload.'));
      }
      const listed = [
        ...(await body(req))
          .toString()
          .matchAll(/<PartNumber>(\d+)<\/PartNumber>/g),
      ].map((m) => Number(m[1]));
      const target = fileOf(upload.key);
      await mkdir(dirname(target), { recursive: true });
      const assembled = `${target}.partial`;
      await writeFile(assembled, '');
      const { appendFile } = await import('node:fs/promises');
      for (const n of listed)
        await appendFile(assembled, await readFile(upload.parts.get(n)!));
      await rename(assembled, target);
      await writeFile(`${target}.meta.json`, JSON.stringify(upload.meta));
      await rm(join(DIR, 'parts', id), { recursive: true, force: true });
      uploads.delete(id);
      record(200);
      return res.end(
        xml(
          `<CompleteMultipartUploadResult><Key>${upload.key}</Key><ETag>"local-${listed.length}"</ETag></CompleteMultipartUploadResult>`,
        ),
      );
    }
    if (req.method === 'DELETE' && q.has('uploadId')) {
      uploads.delete(q.get('uploadId')!);
      res.statusCode = 204;
      record(204);
      return res.end();
    }
    if (req.method === 'GET' && (failNext > 0 || Date.now() < failUntil)) {
      if (failNext > 0) failNext--;
      res.statusCode = 503;
      record(503);
      return res.end(error('ServiceUnavailable', 'Simulated outage.'));
    }
    if (req.method === 'GET' || req.method === 'HEAD') {
      const meta = await metaOf(key);
      const file = fileOf(key);
      if (!meta || !existsSync(file)) {
        res.statusCode = 404;
        record(404);
        return res.end(
          req.method === 'HEAD'
            ? undefined
            : error('NoSuchKey', 'No such key.'),
        );
      }
      const size = statSync(file).size;
      res.setHeader('content-type', meta.type);
      res.setHeader('accept-ranges', 'bytes');
      res.setHeader('etag', `"${size.toString(16)}"`);
      if (meta.cacheControl) res.setHeader('cache-control', meta.cacheControl);
      let start = 0;
      let end = size - 1;
      const range = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range ?? '');
      if (req.headers.range && range) {
        if (range[1] === '') {
          start = Math.max(0, size - Number(range[2]));
        } else {
          start = Number(range[1]);
          if (range[2] !== '') end = Math.min(end, Number(range[2]));
        }
        if (start > end || start >= size) {
          res.statusCode = 416;
          res.setHeader('content-range', `bytes */${size}`);
          record(416);
          return res.end();
        }
        res.statusCode = 206;
        res.setHeader('content-range', `bytes ${start}-${end}/${size}`);
      }
      res.setHeader('content-length', String(end - start + 1));
      if (req.method === 'HEAD') {
        record(res.statusCode);
        return res.end();
      }
      // Recorded now and counted as it streams: a long range read is
      // often still open when a test asks.
      const entry = record(res.statusCode);
      const stream = createReadStream(file, { start, end }).pipe(throttle());
      stream.on('data', (chunk: Buffer) => {
        entry.bytes += chunk.length;
        stats.bytes += chunk.length;
      });
      res.on('close', () => stream.destroy());
      stream.pipe(res);
      return;
    }
    res.statusCode = 405;
    record(405);
    res.end(error('MethodNotAllowed', 'Not supported by the stand-in.'));
  } catch (cause) {
    res.statusCode = 500;
    res.end(error('InternalError', String(cause)));
  }
}).listen(PORT, '127.0.0.1', () => {
  console.log(
    `Local R2 stand-in on ${config.endpoint} (bucket ${MEDIA_BUCKET}; ${seeded.size} seeded prints; uploads in ${DIR})`,
  );
});
