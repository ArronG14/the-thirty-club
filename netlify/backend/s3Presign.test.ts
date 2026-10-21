// @vitest-environment node
/**
 * Signature Version 4 against AWS's own published examples (Amazon S3 API
 * reference, "Authenticating Requests: AWS Signature Version 4": the
 * query-string example and the GET Object header example). The same
 * algorithm is what Cloudflare R2 checks.
 */
import { describe, expect, it } from 'vitest';
import {
  encodeKey,
  objectUrl,
  presign,
  s3Config,
  signedHeaders,
  type S3Config,
} from './s3Presign.ts';

const AWS_EXAMPLE: S3Config = {
  endpoint: 'https://examplebucket.s3.amazonaws.com',
  region: 'us-east-1',
  accessKeyId: 'AKIAIOSFODNN7EXAMPLE',
  secretAccessKey: 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY',
};
const AT = new Date('2013-05-24T00:00:00Z');

describe('AWS Signature Version 4', () => {
  it("matches AWS's presigned URL example", async () => {
    const url = await presign({
      config: AWS_EXAMPLE,
      url: new URL('https://examplebucket.s3.amazonaws.com/test.txt'),
      expiresIn: 86400,
      now: AT,
    });
    expect(url).toBe(
      'https://examplebucket.s3.amazonaws.com/test.txt' +
        '?X-Amz-Algorithm=AWS4-HMAC-SHA256' +
        '&X-Amz-Credential=AKIAIOSFODNN7EXAMPLE%2F20130524%2Fus-east-1%2Fs3%2Faws4_request' +
        '&X-Amz-Date=20130524T000000Z&X-Amz-Expires=86400&X-Amz-SignedHeaders=host' +
        '&X-Amz-Signature=aeeed9bbccd4d02ee5c0109b86d86835f995330da4c265957d157751f604d404',
    );
  });

  it("matches AWS's GET Object (Range) header example", async () => {
    const headers = await signedHeaders({
      config: AWS_EXAMPLE,
      url: new URL('https://examplebucket.s3.amazonaws.com/test.txt'),
      method: 'GET',
      headers: { range: 'bytes=0-9' },
      payloadHash:
        'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
      now: AT,
    });
    expect(headers.authorization).toBe(
      'AWS4-HMAC-SHA256 Credential=AKIAIOSFODNN7EXAMPLE/20130524/us-east-1/s3/aws4_request, SignedHeaders=host;range;x-amz-content-sha256;x-amz-date, Signature=f0e8bdb87c964420e857bd35b5d6ed310bd44f0170aba48dd91039c6036bdb41',
    );
    expect(headers.host).toBeUndefined();
    expect(headers['x-amz-date']).toBe('20130524T000000Z');
  });
});

describe('configuration and addresses', () => {
  it('reads R2 from the environment, region "auto" by default', () => {
    expect(s3Config({})).toBeNull();
    expect(
      s3Config({
        MEDIA_S3_ENDPOINT: 'https://abc.r2.cloudflarestorage.com/',
        MEDIA_S3_ACCESS_KEY_ID: 'id',
      }),
    ).toBeNull();
    expect(
      s3Config({
        MEDIA_S3_ENDPOINT: ' https://abc.r2.cloudflarestorage.com/ ',
        MEDIA_S3_ACCESS_KEY_ID: 'id',
        MEDIA_S3_SECRET_ACCESS_KEY: 'secret',
      }),
    ).toEqual({
      endpoint: 'https://abc.r2.cloudflarestorage.com',
      region: 'auto',
      accessKeyId: 'id',
      secretAccessKey: 'secret',
    });
  });

  it('addresses objects path-style, every segment encoded', () => {
    const config = { ...AWS_EXAMPLE, endpoint: 'https://abc.example' };
    expect(encodeKey("films/a b/it's(1).mp4")).toBe(
      'films/a%20b/it%27s%281%29.mp4',
    );
    expect(objectUrl(config, 'ttc-media', 'films/x/f.mp4').href).toBe(
      'https://abc.example/ttc-media/films/x/f.mp4',
    );
  });

  it('a presigned URL carries no secret, and signs only the host', async () => {
    const url = await presign({
      config: AWS_EXAMPLE,
      url: new URL('https://abc.example/ttc-media/f.mp4'),
      expiresIn: 14400,
    });
    expect(url).not.toContain(AWS_EXAMPLE.secretAccessKey);
    expect(url).not.toContain(encodeURIComponent(AWS_EXAMPLE.secretAccessKey));
    expect(new URL(url).searchParams.get('X-Amz-SignedHeaders')).toBe('host');
    expect(new URL(url).searchParams.get('X-Amz-Expires')).toBe('14400');
  });
});
