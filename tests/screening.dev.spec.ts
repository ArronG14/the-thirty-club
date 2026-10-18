import { expect, test } from '@playwright/test';
test('plays actual H.264 media, pauses, seeks, browses, resumes and completes', async ({
  page,
}) => {
  await page.goto('/?preview=screening-demo');
  await page.getByRole('button', { name: 'Begin screening' }).click();
  const video = page.locator('video');
  await expect
    .poll(() => video.evaluate((v: HTMLVideoElement) => v.currentTime))
    .toBeGreaterThan(0.1);
  await page.getByRole('button', { name: 'Pause', exact: true }).click();
  await expect
    .poll(() => video.evaluate((v: HTMLVideoElement) => v.paused))
    .toBe(true);
  await page.getByRole('slider').fill('2');
  await expect
    .poll(() => video.evaluate((v: HTMLVideoElement) => v.currentTime))
    .toBeGreaterThan(1.8);
  await page.getByRole('button', { name: 'Next message', exact: true }).click();
  await expect(video).toHaveAttribute('src', /test-portrait/);
  await page
    .getByRole('button', { name: 'Browse messages', exact: true })
    .click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await expect(
    page.getByText('Not yet watched', { exact: true }),
  ).toBeVisible();
  await page.keyboard.press('Escape');
  await page.reload();
  await page.getByRole('button', { name: 'Resume screening' }).click();
  await expect(video).toHaveAttribute('src', /test-portrait/);
  await expect(page.getByText('The end', { exact: true })).toBeVisible({
    timeout: 12000,
  });
  const progress = await page.evaluate(() =>
    JSON.parse(localStorage.getItem('thirty-club:screening')!),
  );
  expect(progress.watched).toEqual(['test-portrait']);
  await page.getByRole('button', { name: 'Rewatch the collection' }).click();
  await expect(
    page.getByRole('button', { name: /Watch next message from/ }),
  ).toBeVisible({ timeout: 12000 });
});
test('error recovery, reduced motion and screen-filling destination', async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/?preview=screening-endframe');
  expect(await page.locator('.screening-endframe').boundingBox()).toEqual({
    x: 0,
    y: 0,
    width: 390,
    height: 844,
  });
  await expect(page.locator('.cinema__architecture')).toHaveCount(0);
  await expect(
    page.locator('button:not(.dev-menu *), video, canvas'),
  ).toHaveCount(0);
  await page.route('**/media/screening/test-landscape.mp4', (route) =>
    route.fulfill({ status: 404 }),
  );
  await page.goto('/?preview=screening-demo');
  await expect(page.locator('.cinema')).toHaveAttribute('data-view', 'arrival');
  await page.getByRole('button', { name: 'Begin screening' }).click();
  await expect(
    page.getByText('This message cannot load right now.'),
  ).toBeVisible();
  await expect(page.getByRole('button', { name: 'Retry' })).toBeVisible();
  await page.getByRole('button', { name: 'Next message', exact: true }).click();
  await expect(page.locator('.cinema')).toHaveAttribute(
    'data-motion',
    'reduced',
  );
  await expect(page.locator('.cinema')).toHaveAttribute(
    'data-view',
    'playback',
  );
  await expect(page.locator('.cinema__architecture')).toBeHidden();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});

for (const [width, height] of [
  [390, 844],
  [375, 667],
]) {
  test(`rotation preserves the same video, position and source at ${width}×${height}`, async ({
    page,
  }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.setViewportSize({ width: width!, height: height! });
    await page.goto('/?preview=screening-demo');
    await page.getByRole('button', { name: 'Begin screening' }).click();
    const video = page.locator('video');
    await expect
      .poll(() => video.evaluate((v: HTMLVideoElement) => v.currentTime))
      .toBeGreaterThan(0.1);
    await page.getByRole('button', { name: 'Pause', exact: true }).click();
    const identity = await video.elementHandle();
    const originalTime = await video.evaluate(
      (v: HTMLVideoElement) => v.currentTime,
    );
    const portrait = await page.locator('.premiere__picture').boundingBox();
    expect(portrait!.width).toBe(width);
    expect(portrait!.height / portrait!.width).toBeCloseTo(360 / 640, 2);
    await page.setViewportSize({ width: height!, height: width! });
    expect(await identity!.evaluate((v) => v.isConnected)).toBe(true);
    expect(
      await video.evaluate((v: HTMLVideoElement) => v.currentTime),
    ).toBeCloseTo(originalTime, 1);
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0);
    const landscape = await video.boundingBox();
    expect(landscape!.width).toBe(height);
    expect(landscape!.height).toBeGreaterThan(width! * 0.95);
    await page.getByRole('button', { name: 'Show playback controls' }).click();
    expect(await video.evaluate((v) => getComputedStyle(v).objectFit)).toBe(
      'contain',
    );
    const toolbar = await page
      .getByRole('button', { name: 'Next message', exact: true })
      .boundingBox();
    expect(toolbar!.y + toolbar!.height).toBeLessThanOrEqual(width!);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.getByRole('button', { name: 'Play', exact: true }).click();
    await page.setViewportSize({ width: width!, height: height! });
    expect(await identity!.evaluate((v) => v.isConnected)).toBe(true);
    await expect
      .poll(() => video.evaluate((v: HTMLVideoElement) => v.currentTime))
      .toBeGreaterThan(originalTime + 0.1);
    await page
      .getByRole('button', { name: 'Next message', exact: true })
      .click();
    await expect
      .poll(() => video.evaluate((v: HTMLVideoElement) => v.videoHeight))
      .toBe(640);
    await page.getByRole('button', { name: 'Pause', exact: true }).click();
    const tall = await video.boundingBox();
    expect(tall!.width).toBe(width);
    expect(tall!.height).toBeLessThanOrEqual(height! - 98);
    expect(await video.evaluate((v) => getComputedStyle(v).objectFit)).toBe(
      'contain',
    );
    expect(
      await page.evaluate(() => document.documentElement.scrollHeight),
    ).toBeLessThanOrEqual(height!);
    await page.setViewportSize({ width: height!, height: width! });
    expect(
      await video.evaluate(
        (v: HTMLVideoElement) => v.videoWidth / v.videoHeight,
      ),
    ).toBeCloseTo(360 / 640, 2);
    expect(await video.evaluate((v) => getComputedStyle(v).objectFit)).toBe(
      'contain',
    );
    await page.getByRole('button', { name: 'Show playback controls' }).click();
    await page
      .getByRole('button', { name: 'Browse messages', exact: true })
      .click();
    await expect(page.getByRole('dialog')).toBeVisible();
  });
}
test('arrival pushes into playback and removes the architecture', async ({
  page,
}) => {
  await page.goto('/?preview=screening-arrival');
  await expect(page.locator('.cinema__architecture')).toBeVisible();
  await expect(page.locator('button:not(.dev-menu *), video')).toHaveCount(0);
  await page.goto('/?preview=screening-demo');
  await page.getByRole('button', { name: 'Begin screening' }).click();
  await expect(page.locator('.cinema__push-surface')).toBeHidden();
  await expect(page.locator('.cinema__architecture')).toBeHidden();
  await expect(page.locator('.cinema')).toHaveAttribute(
    'data-view',
    'playback',
  );
  await expect
    .poll(() =>
      page.locator('video').evaluate((v: HTMLVideoElement) => v.currentTime),
    )
    .toBeGreaterThan(0.1);
});

test('landscape chrome fades, returns on tap and stays available to keyboard users', async ({
  page,
}) => {
  await page.setViewportSize({ width: 844, height: 390 });
  await page.goto('/?preview=screening-demo');
  await page.getByRole('button', { name: 'Begin screening' }).click();
  const video = page.locator('video');
  expect(await video.evaluate((v: HTMLVideoElement) => v.controls)).toBe(false);
  await expect(page.getByRole('slider')).toHaveCount(1);
  await expect(page.locator('.premiere__chrome')).toBeHidden({ timeout: 4500 });
  await page.getByRole('button', { name: 'Show playback controls' }).click();
  await expect(
    page.getByRole('button', { name: 'Pause', exact: true }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Pause', exact: true }).focus();
  await page.keyboard.press('Space');
  await expect(
    page.getByRole('button', { name: 'Play', exact: true }),
  ).toBeVisible();
});
test('ended film waits on a single elegant overlay before selecting the next sender', async ({
  page,
}) => {
  await page.goto('/?preview=screening-demo');
  await page.getByRole('button', { name: 'Begin screening' }).click();
  const video = page.locator('video');
  await expect
    .poll(() => video.evaluate((v: HTMLVideoElement) => v.duration))
    .toBeGreaterThan(0);
  await page.getByRole('slider').fill('5.8');
  await expect(
    page.getByRole('heading', { name: 'Landscape test film' }),
  ).toBeVisible();
  await expect(page.getByRole('slider')).toHaveCount(0);
  await expect(video).toHaveAttribute('src', /test-landscape/);
  expect(await video.evaluate((v: HTMLVideoElement) => v.ended)).toBe(true);
  await page.getByRole('button', { name: /Watch next message from/ }).click();
  await expect(video).toHaveAttribute('src', /test-portrait/);
  await expect(
    page.getByRole('heading', { name: 'The end', exact: true }),
  ).toBeVisible({ timeout: 10000 });
  await expect(
    page.getByRole('link', { name: 'Return to the Members’ Lounge' }),
  ).toBeVisible();
});

test.describe('developer menu (dev server only)', () => {
  test('opens, has comfortable touch targets, and reaches the unlocked room', async ({
    page,
  }) => {
    await page.goto('/');
    await page.getByRole('button', { name: 'Dev' }).click();
    const nav = page.getByRole('navigation', { name: 'Developer navigation' });
    await expect(nav).toBeVisible();
    const sizes = await page
      .locator('.dev-menu button, .dev-menu a')
      .evaluateAll((els) =>
        els.map((el) => {
          const r = el.getBoundingClientRect();
          return Math.min(r.width, r.height);
        }),
      );
    expect(sizes.length).toBeGreaterThan(10);
    for (const size of sizes) expect(size).toBeGreaterThanOrEqual(44);
    await nav.getByRole('link', { name: 'Room, unlocked' }).click();
    await expect(page).toHaveURL(/rooms\/screening-room\?preview=evening/);
    await expect(page.getByRole('button', { name: 'Dev' })).toBeVisible();
    await expect(page.locator('body')).not.toContainText('not open yet');
  });

  test('real gate link keeps production locking', async ({ page }) => {
    await page.clock.setFixedTime(new Date(2026, 9, 17, 20, 0, 0));
    await page.goto('/rooms/screening-room');
    await expect(page.getByText('not open yet')).toBeVisible();
  });
});
