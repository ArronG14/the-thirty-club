/**
 * The Private Screening Room with a real five-second MP4, against the
 * production build on an iPhone-sized browser (playwright.screening.config.ts):
 * the Butler's escort from the Lounge, his introduction, Watch Movie, real
 * playback to the natural end, the return to the seat, his closing words,
 * unlimited replay, early exit, refresh and the returning visitor. All of it
 * runs in a Dev Mode rehearsal; LIVE is checked to stay untouched.
 *
 * Not covered (no automation can): the iPhone's own native fullscreen player.
 * See docs/SCREENING_ROOM_IMPLEMENTATION.md for the manual device steps.
 */
import { mkdirSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';

const SHOTS = process.env.SCREENING_SHOTS ?? 'docs/screening/journey';
mkdirSync(SHOTS, { recursive: true });

const INTRODUCTION =
  'Madam, a number of distinguished guests have requested the opportunity to address you on this rather special occasion. I have taken the liberty of arranging a private screening.';
const CLOSING =
  'I trust you enjoyed your private screening, Madam. The theatre shall remain at your disposal should you wish to revisit it.';
const WELCOME_BACK =
  'Welcome back, Madam. Your private screening is ready whenever you wish.';
const OWNER = 'thirty-club:owner:';

async function shot(page: Page, name: string, settle = 600) {
  await page.waitForTimeout(settle);
  const browser = page.context().browser()?.browserType().name() ?? 'browser';
  await page.screenshot({
    path: `${SHOTS}/${browser}-${name}.jpg`,
    type: 'jpeg',
    quality: 80,
  });
}

/** Every request that reached the preview server's API. */
function apiCalls(page: Page) {
  const calls: string[] = [];
  page.on('request', (request) => {
    const url = new URL(request.url());
    if (url.pathname.startsWith('/api/'))
      calls.push(`${request.method()} ${url.pathname}`);
  });
  return calls;
}

test.beforeEach(async ({ context }) => {
  await context.addInitScript(() => {
    localStorage.setItem(
      'thirty-club:first-visit-verified',
      '2026-10-18T00:00:00.000Z',
    );
    // The poster lounge: software WebGL is far too slow for timing checks.
    Object.defineProperty(window, 'WebGL2RenderingContext', {
      value: undefined,
    });
  });
});

async function unlock(page: Page) {
  await page.goto('/');
  for (let i = 0; i < 5; i++) await page.locator('.timepiece').tap();
  await page.getByLabel('Private access code').fill('1414');
  await page.getByRole('button', { name: 'Unlock private office' }).click();
  await expect(
    page.getByRole('button', { name: 'Open Dev Mode' }),
  ).toBeVisible();
}

async function launch(page: Page, name: RegExp) {
  await page.getByRole('button', { name: 'Open Dev Mode' }).click();
  await expect(page.getByRole('dialog', { name: 'Dev Mode' })).toBeVisible();
  await page.getByRole('button', { name }).first().click();
  await page.waitForLoadState('load');
}

const video = (page: Page) => page.locator('.cinema__film video');
const time = (page: Page) =>
  video(page).evaluate((v: HTMLVideoElement) => v.currentTime);
const record = (page: Page) =>
  page.evaluate(
    (key) => JSON.parse(sessionStorage.getItem(key) ?? 'null'),
    `${OWNER}thirty-club:screening`,
  );

/** Leaves the player the way a viewer would in this browser. */
async function closePlayer(page: Page) {
  const fullscreen = await page.evaluate(() =>
    Boolean(document.fullscreenElement),
  );
  if (fullscreen) await page.evaluate(() => document.exitFullscreen());
  else await page.getByRole('button', { name: 'Leave the screening' }).click();
}

test('the full journey: escort, introduction, real film, closing words, encore', async ({
  page,
}) => {
  await unlock(page);
  const calls = apiCalls(page);
  await launch(page, /^The Screening Room journey/);
  await expect(page.locator('.lounge')).toBeVisible({ timeout: 60000 });

  // Stage A: the Butler's escort.
  const continueButton = page.getByRole('button', {
    name: 'Continue your evening',
  });
  await expect(continueButton).toBeVisible({ timeout: 30000 });
  const started = Date.now();
  await continueButton.click();
  await expect(
    page.getByText('This way, Madam. Your seat is ready.'),
  ).toBeVisible();
  await expect(page.locator('.lounge')).toHaveAttribute('data-escort', 'true');
  await shot(page, '01-escort-fade', 1500);
  await expect(page).toHaveURL(/\/rooms\/screening-room$/, { timeout: 10000 });
  const escortMs = Date.now() - started;
  expect(escortMs).toBeGreaterThan(2000);
  expect(escortMs).toBeLessThan(4500);

  // Stage B: seated before the poster; the Butler's introduction.
  await expect(
    page.getByRole('heading', { name: 'Thirty Years of Alise' }),
  ).toBeVisible();
  await expect(page.getByText(INTRODUCTION)).toBeVisible({ timeout: 5000 });
  await expect(
    page.getByText('Rehearsal · temporary five-second test film'),
  ).toBeVisible();
  const watch = page.getByRole('button', { name: 'Watch Movie' });
  const box = (await watch.boundingBox())!;
  expect(box.height).toBeGreaterThanOrEqual(44);
  expect(box.width).toBeGreaterThanOrEqual(150);
  expect(box.y + box.height).toBeLessThan(664);
  // No sideways scrolling on the phone.
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await shot(page, '02-seated-introduction', 1200);

  // Stage C: Watch Movie plays the real MP4.
  await watch.click();
  await expect(page.locator('.cinema')).toHaveAttribute('data-phase', 'film');
  await expect.poll(() => time(page), { timeout: 10000 }).toBeGreaterThan(0.5);
  const media = await video(page).evaluate((v: HTMLVideoElement) => ({
    duration: v.duration,
    width: v.videoWidth,
    controls: v.controls,
    muted: v.muted,
    inline: v.hasAttribute('playsinline'),
  }));
  expect(media.duration).toBeCloseTo(5, 0);
  expect(media.width).toBe(1280);
  expect(media).toMatchObject({ controls: true, muted: false, inline: false });
  await shot(page, '03-film-playing', 300);

  // Stage D: the natural end returns her to her seat.
  await expect(page.locator('.cinema')).toHaveAttribute(
    'data-phase',
    'seated',
    { timeout: 15000 },
  );
  await expect(page.getByText(CLOSING)).toBeVisible();
  expect(await page.evaluate(() => document.fullscreenElement)).toBeNull();
  expect(await record(page)).toMatchObject({ completions: 1, plays: 1 });
  const membership = await page.evaluate(
    (key) => JSON.parse(sessionStorage.getItem(key)!),
    `${OWNER}thirty-club:membership`,
  );
  expect(membership.rooms['screening-room'].completedAt).toBeTruthy();
  await shot(page, '04-closing-words', 900);

  // Encore, as often as she likes.
  await page.getByRole('button', { name: 'Watch Movie' }).click();
  await expect.poll(() => time(page), { timeout: 10000 }).toBeGreaterThan(0.3);
  await expect(page.locator('.cinema')).toHaveAttribute(
    'data-phase',
    'seated',
    { timeout: 15000 },
  );
  await expect(
    page.getByText(
      'An encore, Madam. The theatre remains entirely at your disposal.',
    ),
  ).toBeVisible();
  const after = await record(page);
  expect(after).toMatchObject({ completions: 2, plays: 2 });

  // Stage E: a later visit gets the short welcome.
  await page
    .getByRole('link', { name: 'Return to the Members’ Lounge' })
    .click();
  await expect(page.locator('.lounge')).toBeVisible({ timeout: 30000 });
  await page.goto('/rooms/screening-room');
  await expect(page.getByText(WELCOME_BACK)).toBeVisible({ timeout: 5000 });
  await expect(page.getByText(INTRODUCTION)).toHaveCount(0);

  // The rehearsal never touched Alise's records or the server.
  expect(
    await page.evaluate(() => [
      localStorage.getItem('thirty-club:screening'),
      localStorage.getItem('thirty-club:membership'),
    ]),
  ).toEqual([null, null]);
  expect(calls).toEqual([]);
});

test('leaving early keeps her place; refresh resumes; no false completion', async ({
  page,
}) => {
  await unlock(page);
  await launch(page, /^The Screening Room journey/);
  await page.goto('/rooms/screening-room');
  await page.getByRole('button', { name: 'Watch Movie' }).click();
  await expect.poll(() => time(page), { timeout: 10000 }).toBeGreaterThan(1.6);
  await closePlayer(page);
  await expect(page.locator('.cinema')).toHaveAttribute('data-phase', 'seated');
  await expect(
    page.getByText('Of course, Madam. I have kept your place.'),
  ).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Resume Movie' }),
  ).toBeVisible();
  const kept = await record(page);
  expect(kept.completedAt).toBeNull();
  expect(kept.resume.seconds).toBeGreaterThan(1.4);
  await shot(page, '05-early-exit');

  // A long pause changes nothing: the place is still kept after a refresh.
  await page.reload();
  await expect(
    page.getByText(
      'Welcome back, Madam. I have kept your place, should you wish to continue.',
    ),
  ).toBeVisible({ timeout: 5000 });
  await page.getByRole('button', { name: 'Resume Movie' }).click();
  await expect
    .poll(() => time(page), { timeout: 10000 })
    .toBeGreaterThan(kept.resume.seconds - 0.2);
  // Refreshing mid-film is an interruption, not a completion.
  await expect.poll(() => time(page), { timeout: 10000 }).toBeGreaterThan(2.6);
  await page.reload();
  const refreshed = await record(page);
  expect(refreshed.completedAt).toBeNull();
  expect(refreshed.resume.seconds).toBeGreaterThan(2);

  // "From the beginning" restarts and this time reaches the end.
  await page.getByRole('button', { name: 'Watch from the beginning' }).click();
  await expect.poll(() => time(page), { timeout: 10000 }).toBeGreaterThan(0.2);
  expect(await time(page)).toBeLessThan(2);
  await expect(page.getByText(CLOSING)).toBeVisible({ timeout: 15000 });
  expect(await record(page)).toMatchObject({ completions: 1, resume: null });
});

test('LIVE: no early unlock, no test film for Alise, rehearsal records stay apart', async ({
  page,
}) => {
  // The night before the birthday: the room is locked.
  await page.clock.setFixedTime(new Date('2026-10-24T04:30:00Z'));
  await page.goto('/rooms/screening-room');
  await expect(page.getByText(/opens once your membership/)).toBeVisible();
  await expect(page.locator('video')).toHaveCount(0);

  // After midnight, inducted: the room opens but the birthday film is not
  // configured, so nothing pretends to be her screening.
  await page.clock.setFixedTime(new Date('2026-10-24T06:00:00Z'));
  await page.evaluate((stamp) => {
    localStorage.setItem(
      'thirty-club:membership',
      JSON.stringify({ version: 1, inductedAt: stamp, rooms: {} }),
    );
    localStorage.setItem(
      'thirty-club:entrance',
      JSON.stringify({ version: 1, unlockedAt: stamp, ceremonySeenAt: stamp }),
    );
  }, '2026-10-24T05:05:00.000Z');
  await page.reload();
  await expect(
    page.getByText('Your screening is being prepared.'),
  ).toBeVisible();
  await expect(page.getByRole('button', { name: /Movie/ })).toHaveCount(0);
  await expect(page.locator('video')).toHaveCount(0);
  await expect(page.getByText(/test film/i)).toHaveCount(0);
  await shot(page, '06-live-unconfigured', 1400);
  const membership = await page.evaluate(() =>
    JSON.parse(localStorage.getItem('thirty-club:membership')!),
  );
  expect(membership.rooms['screening-room']?.completedAt).toBeUndefined();
});

test('landscape on the phone keeps the poster and Watch Movie in view', async ({
  page,
}) => {
  await unlock(page);
  await launch(page, /^The Private Screening Room/);
  await page.setViewportSize({ width: 844, height: 390 });
  const watch = page.getByRole('button', { name: /Movie$/ });
  await expect(watch).toBeVisible({ timeout: 30000 });
  const box = (await watch.boundingBox())!;
  expect(box.y + box.height).toBeLessThanOrEqual(390);
  expect(box.height).toBeGreaterThanOrEqual(44);
  await shot(page, '07-landscape', 1400);
});
