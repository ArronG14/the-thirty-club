/**
 * Protected-film delivery (ADR-027) with the REAL streaming prints, through
 * the real `/api/v1/media/<id>` ticket endpoint and presigned URLs, played
 * by the owner's Films desk on an iPhone-sized browser. The storage is a
 * local stand-in for Cloudflare R2 (tools/s3-standin.ts) that refuses any
 * unsigned, forged or expired request and serves byte ranges; it can slow
 * down, drop requests and expire every issued URL on command.
 *
 * Not covered (no automation can): the iPhone's native fullscreen player,
 * the real R2 edge, and the hotel Wi-Fi. `npm run media:verify` covers the
 * real bucket; the Films desk on the iPhone covers the rest.
 */
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import {
  expect,
  test,
  type APIRequestContext,
  type Page,
} from '@playwright/test';

// Set by playwright.media.config.ts (the only config that runs this spec).
const PRINTS = process.env.MEDIA_PRINTS ?? '';
const STANDIN = process.env.S3_STANDIN_URL ?? '';
const FILES = {
  standard: 'thirty-club-birthday-film-1080p.mp4',
  lighter: 'thirty-club-birthday-film-720p.mp4',
  nyla: 'nyla-casino-surprise-1080x1920.mp4',
};
const SIZE = { standard: 344_036_034, lighter: 168_057_331, nyla: 25_845_875 };
const HEADERS = {
  'content-type': 'application/json',
  'x-concierge-request': '1',
};

test.skip(
  !PRINTS ||
    !STANDIN ||
    !Object.values(FILES).every((f) => existsSync(join(PRINTS, f))),
  `the streaming prints are not in ${PRINTS}`,
);

interface Stat {
  method: string;
  key: string;
  range: string | null;
  status: number;
  bytes: number;
  type: string | null;
}
const control = async (request: APIRequestContext, path: string) =>
  (await request.post(`${STANDIN}${path}`)).ok();
const stats = async (request: APIRequestContext) =>
  (await (await request.get(`${STANDIN}/__stats`)).json()) as {
    requests: Stat[];
    bytes: number;
  };
const of = (all: Stat[], file: string) =>
  all.filter((s) => s.key.endsWith(`/${file}`));

const PLAYERS = {
  standard: {
    label: 'Thirty Years of Alise',
    button: 'Play the standard print',
  },
  lighter: {
    label: 'Thirty Years of Alise, lighter print',
    button: 'Play the lighter print',
  },
  nyla: { label: 'Nyla’s film', button: 'Play' },
} as const;
type Print = keyof typeof PLAYERS;

const video = (page: Page, print: Print) =>
  page.locator(`video[aria-label="${PLAYERS[print].label}"]`);
const player = (page: Page, print: Print) =>
  page.locator('.dd__card').filter({ has: video(page, print) });
const button = (page: Page, print: Print, name: string | RegExp) =>
  player(page, print).getByRole('button', {
    name,
    exact: typeof name === 'string',
  });
const state = (page: Page, print: Print) =>
  video(page, print).evaluate((v: HTMLVideoElement) => ({
    time: v.currentTime,
    duration: v.duration,
    width: v.videoWidth,
    height: v.videoHeight,
    paused: v.paused,
    preload: v.preload,
    src: v.currentSrc,
  }));

async function openFilmsDesk(page: Page) {
  const login = await page.context().request.post('/api/v1/auth/owner', {
    headers: HEADERS,
    data: { password: 'thirty-club-local-rehearsal-only' },
  });
  expect(login.status()).toBe(200);
  await page.goto('/concierge/owner?section=films');
  await expect(page.getByRole('heading', { name: 'Films' })).toBeVisible({
    timeout: 30_000,
  });
}

async function playFor(page: Page, print: Print, seconds: number) {
  await button(page, print, PLAYERS[print].button).click();
  await expect
    .poll(async () => (await state(page, print)).time, { timeout: 30_000 })
    .toBeGreaterThan(seconds);
}

test.beforeEach(async ({ request }) => {
  await control(request, '/__reset');
});

test('the real prints: nothing before the tap, then play, seek and byte ranges', async ({
  page,
  request,
}) => {
  // A good connection (20 Mbit/s) throughout, so what the browser fetches
  // is measured as on a real network, not on loopback (where it reads
  // tens of megabytes before its own cancel lands).
  await control(request, '/__throttle?kbps=20000');
  await openFilmsDesk(page);
  for (const print of Object.keys(PLAYERS) as Print[])
    await expect(button(page, print, PLAYERS[print].button)).toBeEnabled({
      timeout: 15_000,
    });
  await page.waitForTimeout(3000);

  // Before any tap: only what preload="metadata" reads (the header, which
  // fast start puts first; Chromium reads up to 4 MiB), never the film.
  const before = await stats(request);
  for (const print of Object.keys(FILES) as Print[]) {
    const fetched = of(before.requests, FILES[print]).reduce(
      (n, s) => n + s.bytes,
      0,
    );
    test.info().annotations.push({
      type: 'before the tap',
      description: `${print}: ${fetched} bytes of ${SIZE[print]}`,
    });
    expect(fetched, `${print} fetched before the tap`).toBeLessThan(12_000_000);
    expect((await state(page, print)).preload).toBe('metadata');
  }

  const expected = {
    standard: { width: 1920, height: 1080, duration: 880.1 },
    lighter: { width: 1280, height: 720, duration: 880.1 },
    nyla: { width: 1080, height: 1920, duration: 33.3 },
  };
  for (const print of Object.keys(PLAYERS) as Print[]) {
    await playFor(page, print, 1.5);
    const playing = await state(page, print);
    expect(playing.width).toBe(expected[print].width);
    expect(playing.height).toBe(expected[print].height);
    expect(playing.duration).toBeCloseTo(expected[print].duration, 0);
    expect(new URL(playing.src).searchParams.get('X-Amz-Signature')).toMatch(
      /^[0-9a-f]{64}$/,
    );
    // Seek well into the film: only that part is fetched.
    const target = playing.duration * 0.7;
    await video(page, print).evaluate(
      (v: HTMLVideoElement, t: number) => (v.currentTime = t),
      target,
    );
    await expect
      .poll(async () => (await state(page, print)).time, { timeout: 30_000 })
      .toBeGreaterThan(target + 1);
    await video(page, print).evaluate((v: HTMLVideoElement) => v.pause());
  }
  await page.waitForTimeout(1000);

  const after = await stats(request);
  for (const print of Object.keys(FILES) as Print[]) {
    const reads = of(after.requests, FILES[print]).filter(
      (s) => s.method === 'GET',
    );
    expect(reads.length).toBeGreaterThan(0);
    for (const read of reads) {
      expect([200, 206]).toContain(read.status);
      expect(read.type).toBe('video/mp4');
    }
    // The browser asked for ranges, and the storage answered with them.
    expect(reads.some((r) => r.range && r.status === 206)).toBe(true);
    // Seeking to 70 % asked for bytes from there, not from the start.
    if (print !== 'nyla')
      expect(
        reads.some(
          (r) =>
            Number(/^bytes=(\d+)-/.exec(r.range ?? '')?.[1]) >
            SIZE[print] * 0.5,
        ),
        `${print}: a range request from the seek point`,
      ).toBe(true);
  }
  // Nothing reached storage unsigned, forged or expired.
  expect(after.requests.filter((s) => s.status === 403)).toEqual([]);
});

test('an expired URL is refused by storage; Retry fetches a fresh ticket and plays', async ({
  page,
  request,
}) => {
  await openFilmsDesk(page);
  await expect(button(page, 'nyla', 'Play')).toBeEnabled({ timeout: 15_000 });
  await page.waitForTimeout(1500);
  const first = (await state(page, 'nyla')).src;
  // Every URL issued so far now reads as expired (as after a long pause).
  await control(request, '/__expire-issued');
  await page.waitForTimeout(1100);
  await video(page, 'nyla').evaluate((v: HTMLVideoElement) => v.load());
  await button(page, 'nyla', 'Play').click();
  await expect(button(page, 'nyla', 'Try again')).toBeVisible({
    timeout: 70_000,
  });
  // Chromium: "…taking too long… Your place is kept"; WebKit: "could not
  // start". Either way an honest Retry, never a spinner.
  await expect(player(page, 'nyla').getByRole('alert')).toContainText(
    /try again/i,
  );
  expect((await stats(request)).requests.some((s) => s.status === 403)).toBe(
    true,
  );
  await page.waitForTimeout(500);
  await button(page, 'nyla', 'Try again').click();
  await expect
    .poll(async () => (await state(page, 'nyla')).time, { timeout: 30_000 })
    .toBeGreaterThan(1);
  expect((await state(page, 'nyla')).src).not.toBe(first);
});

test('before a ticket expires the page renews it, so she never meets a dead URL', async ({
  page,
  request,
}) => {
  await page.clock.install();
  await openFilmsDesk(page);
  await expect(button(page, 'nyla', 'Play')).toBeEnabled({ timeout: 15_000 });
  await expect
    .poll(async () => (await state(page, 'nyla')).src)
    .toContain('X-Amz-Signature=');
  const first = (await state(page, 'nyla')).src;
  // The page sits open for 3 h 50 min; the storage has expired the old URL.
  await control(request, '/__expire-issued');
  await page.waitForTimeout(1100);
  await page.clock.fastForward('03:50:00');
  await expect
    .poll(async () => (await state(page, 'nyla')).src, { timeout: 15_000 })
    .not.toBe(first);
  await button(page, 'nyla', 'Play').click();
  await expect
    .poll(async () => (await state(page, 'nyla')).time, { timeout: 30_000 })
    .toBeGreaterThan(1);
});

test('a dropped connection mid-film: Retry resumes from her place', async ({
  page,
  request,
}) => {
  await openFilmsDesk(page);
  await expect(button(page, 'lighter', 'Play the lighter print')).toBeEnabled({
    timeout: 15_000,
  });
  await playFor(page, 'lighter', 2);
  // Jump to a part not yet fetched, while the storage is down for good.
  // (WebKit reports "playing" over a frozen picture: ADR-027's stall rule
  // counts progress, so Retry still appears.)
  await control(request, '/__fail?seconds=300');
  await video(page, 'lighter').evaluate((v: HTMLVideoElement) => {
    v.currentTime = 500;
  });
  await expect(button(page, 'lighter', 'Try again')).toBeVisible({
    timeout: 70_000,
  });
  await control(request, '/__fail?seconds=0');
  await button(page, 'lighter', 'Try again').click();
  await expect
    .poll(async () => (await state(page, 'lighter')).time, { timeout: 30_000 })
    .toBeGreaterThan(400);
});

test('a hotel-Wi-Fi connection: the lighter print plays steadily at 2.5 Mbit/s', async ({
  page,
  request,
}) => {
  await openFilmsDesk(page);
  await expect(button(page, 'lighter', 'Play the lighter print')).toBeEnabled({
    timeout: 15_000,
  });
  await control(request, '/__throttle?kbps=2500');
  await playFor(page, 'lighter', 0.5);
  const started = await state(page, 'lighter');
  await page.waitForTimeout(12_000);
  const later = await state(page, 'lighter');
  // Twelve seconds of wall clock should be close to twelve of film.
  expect(later.time - started.time).toBeGreaterThan(9);
  expect(later.paused).toBe(false);
});

test('a connection too slow to start: loading is shown, then an honest Retry', async ({
  page,
  request,
}) => {
  test.setTimeout(150_000);
  await openFilmsDesk(page);
  await expect(button(page, 'standard', 'Play the standard print')).toBeEnabled(
    {
      timeout: 15_000,
    },
  );
  await control(request, '/__throttle?kbps=24');
  // A fresh load, so the slow connection is what the player meets.
  await video(page, 'standard').evaluate((v: HTMLVideoElement) => {
    v.currentTime = 300;
  });
  await button(page, 'standard', 'Play the standard print').click();
  await expect(button(page, 'standard', 'Loading the film…')).toBeVisible();
  await expect(
    player(page, 'standard').getByText(
      'Loading the film. On a slow connection this can take a moment.',
    ),
  ).toBeVisible();
  await expect(player(page, 'standard').getByRole('alert')).toContainText(
    'taking too long',
    { timeout: 60_000 },
  );
  await expect(button(page, 'standard', 'Try again')).toBeVisible();
});

test('no premature birthday access: signed out, then Alise before midnight Jamaica', async ({
  browser,
  request,
}) => {
  const anonymous = await request.get('/api/v1/media/birthday-film', {
    headers: HEADERS,
  });
  expect(anonymous.status()).toBe(401);
  // The owner invites Alise and admits her to the Screening Room early;
  // the server's clock (21–23 October) still keeps the film shut.
  const owner = await browser.newContext();
  expect(
    (
      await owner.request.post('/api/v1/auth/owner', {
        headers: HEADERS,
        data: { password: 'thirty-club-local-rehearsal-only' },
      })
    ).status(),
  ).toBe(200);
  const invitation = await owner.request.post('/api/v1/owner/invitations', {
    headers: HEADERS,
    data: {},
  });
  const { token } = (await invitation.json()) as { token: string };
  const alise = await browser.newContext();
  expect(
    (
      await alise.request.post('/api/v1/auth/member', {
        headers: HEADERS,
        data: { token },
      })
    ).status(),
  ).toBe(200);
  const notAdmitted = await alise.request.get('/api/v1/media/birthday-film', {
    headers: HEADERS,
  });
  expect(notAdmitted.status()).toBe(403);
  await owner.request.post(
    '/api/v1/owner/journey/rooms/screening-room/invite',
    {
      headers: HEADERS,
      data: {},
    },
  );
  await alise.request.post('/api/v1/journey/admissions/screening-room/accept', {
    headers: HEADERS,
    data: {},
  });
  const early = await alise.request.get('/api/v1/media/birthday-film', {
    headers: HEADERS,
  });
  expect(Date.now()).toBeLessThan(Date.parse('2026-10-24T05:00:00Z'));
  expect(early.status()).toBe(403);
  expect(((await early.json()) as { error: string }).error).toBe('not-open');
  // Nyla's film has not been won either.
  expect(
    (
      await alise.request.get('/api/v1/media/nyla-film', { headers: HEADERS })
    ).status(),
  ).toBe(403);
  // The storage itself refuses any address without a valid signature.
  const bare = await request.get(
    `${STANDIN}/ttc-media/films/x/${FILES.standard}`,
  );
  expect(bare.status()).toBe(403);
  // And nothing was signed for her: storage saw no birthday request at all.
  expect(
    of((await stats(request)).requests, FILES.standard).filter(
      (s) => s.status !== 403,
    ),
  ).toEqual([]);
  await owner.close();
  await alise.close();
});
