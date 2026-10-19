import { expect, test } from '@playwright/test';

test('production shell precaches and supports offline navigation', async ({
  page,
  context,
}) => {
  // Software WebGL in headless Chromium makes the 3D start-up slow.
  test.setTimeout(120_000);
  // Before the birthday, so the locked entrance renders whatever today is.
  await page.clock.setFixedTime(new Date(2026, 9, 17, 20, 0, 0));
  await page.goto('/');
  await expect(
    page.getByRole('heading', { name: 'The Thirty Club' }),
  ).toBeVisible();
  // Precaching includes the 3D chunk and textures (~1.5 MB).
  await expect(page.getByRole('status')).toContainText(
    'available offline on this device',
    { timeout: 30_000 },
  );
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  const manifest = await page.request.get('/manifest.webmanifest');
  expect(manifest.ok()).toBeTruthy();
  const config = await manifest.json();
  expect(config.display).toBe('standalone');
  expect(config.icons).toHaveLength(3);
  for (const icon of config.icons as { src: string }[]) {
    expect((await page.request.get(icon.src)).ok()).toBeTruthy();
  }
  await context.setOffline(true);
  await page.reload();
  expect(
    await page.evaluate(() => navigator.serviceWorker.controller !== null),
  ).toBe(true);
  await expect(
    page.getByRole('heading', { name: 'The Thirty Club' }),
  ).toBeVisible();
  await expect(page.getByRole('status')).toContainText('You are offline.');
  // The 3D chunk and scanned textures come from the precache too.
  await expect(page.locator('.facade')).toHaveAttribute(
    'data-render',
    /fading|scene/,
    { timeout: 60_000 },
  );
  // Typography is precached, not fetched: every face loads while offline.
  const offlineFaces = await page.evaluate(async () => {
    await document.fonts.ready;
    return [...document.fonts]
      .filter((face) => face.status === 'loaded')
      .map((face) => `${face.family} ${face.style}`);
  });
  expect(offlineFaces).toEqual(
    expect.arrayContaining([
      'Bodoni Moda normal',
      'Cormorant Garamond italic',
      'Jost normal',
    ]),
  );
  await page.goto('/missing-room?clue=/video.mp4');
  await expect(
    page.getByRole('heading', { name: 'This room does not exist.' }),
  ).toBeVisible();
  await page.getByRole('link', { name: 'Return to the entrance' }).click();
  await expect(
    page.getByRole('heading', { name: 'The Thirty Club' }),
  ).toBeVisible();
  const apiFailed = await page.evaluate(async () => {
    try {
      await fetch('/api/redemptions');
      return false;
    } catch {
      return true;
    }
  });
  expect(apiFailed).toBe(true);
  // Test Workbox's boundary without relying on Vite preview's permissive
  // online HTML fallback (preview is not a Netlify CDN emulator).
  for (const path of [
    '/api/redemptions',
    '/assets/missing',
    '/missing.svg',
    '/assets/missing.js',
    '/workbox-missing.js',
  ]) {
    // Keep the main cached page alive; Chromium's failed-navigation error
    // page can otherwise race a recovery navigation on the same tab.
    const missingPage = await context.newPage();
    await expect(missingPage.goto(path)).rejects.toThrow();
    await missingPage.close();
  }
  await context.setOffline(false);
});

test('the Members’ Lounge opens offline from the precache', async ({
  page,
  context,
}) => {
  test.setTimeout(150_000);
  await page.clock.setFixedTime(new Date(2026, 9, 24, 1, 0, 0));
  await page.goto('/');
  await expect(page.getByRole('status')).toContainText(
    'available offline on this device',
    { timeout: 30_000 },
  );
  await page.evaluate(() => {
    const seen = new Date(2026, 9, 24, 0, 0, 5).toISOString();
    localStorage.setItem(
      'thirty-club:entrance',
      JSON.stringify({ version: 1, unlockedAt: seen, ceremonySeenAt: seen }),
    );
    localStorage.setItem(
      'thirty-club:membership',
      JSON.stringify({ version: 1, inductedAt: seen, rooms: {} }),
    );
  });
  await context.setOffline(true);
  await page.reload();
  await expect(
    page.getByRole('heading', { name: 'The Members’ Lounge' }),
  ).toBeVisible();
  // The lounge chunk and its textures are served from the precache.
  await expect(page.locator('.lounge')).toHaveAttribute(
    'data-render',
    /fading|scene/,
    { timeout: 90_000 },
  );
  await context.setOffline(false);
});

test('production build ships no developer menu or preview bypass', async ({
  page,
}) => {
  await page.clock.setFixedTime(new Date(2026, 9, 17, 20, 0, 0));
  await page.goto('/?preview=lounge');
  await expect(
    page.getByRole('heading', { name: 'The Thirty Club' }),
  ).toBeVisible();
  await expect(page.getByTestId('dev-menu')).toHaveCount(0);
  await expect(page.getByLabel('Developer navigation')).toHaveCount(0);
  await expect(page.getByLabel('Development preview')).toHaveCount(0);
  // The preview parameter must not unlock anything in production.
  await expect(
    page.getByText('Alise, your table is being prepared.'),
  ).toBeVisible();
  await page.goto('/rooms/screening-room?preview=evening');
  // The journey's gate refuses and names nothing (ADR-020).
  await expect(
    page.getByRole('heading', { name: 'Not this way, Madam.' }),
  ).toBeVisible();
  await expect(page.getByText('Screening Room')).toHaveCount(0);
});
