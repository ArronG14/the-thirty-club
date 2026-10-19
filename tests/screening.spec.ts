import { expect, test } from '@playwright/test';
const seen = '2026-10-24T05:00:00.000Z';
test('production gate, no-WebGL screening and lounge round trip', async ({
  page,
}) => {
  await page.clock.setFixedTime(new Date('2026-10-24T06:00:00Z'));
  await page.addInitScript(() => {
    HTMLCanvasElement.prototype.getContext = (() =>
      null) as typeof HTMLCanvasElement.prototype.getContext;
  });
  await page.goto('/rooms/screening-room');
  await expect(page.getByText(/opens once your membership/)).toBeVisible();
  await page.evaluate((stamp) => {
    localStorage.setItem(
      'thirty-club:membership',
      JSON.stringify({ version: 1, inductedAt: stamp, rooms: {} }),
    );
    localStorage.setItem(
      'thirty-club:entrance',
      JSON.stringify({ version: 1, unlockedAt: stamp, ceremonySeenAt: stamp }),
    );
  }, seen);
  await page.reload();
  // LIVE before the birthday film is configured: honest, nothing to play.
  await expect(
    page.getByText('Your screening is being prepared.'),
  ).toBeVisible();
  await expect(page.locator('canvas, video')).toHaveCount(0);
  await page
    .getByRole('link', { name: 'Return to the Members’ Lounge' })
    .click();
  await expect(page.locator('.lounge')).toBeVisible();
  await page.getByRole('button', { name: 'Members’ Directory' }).click();
  await page
    .getByRole('button', { name: 'Enter: The Private Screening Room' })
    .click();
  // The Butler's escort, then the room.
  await expect(
    page.getByText('This way, Madam. Your seat is ready.'),
  ).toBeVisible();
  await expect(page.getByText('Your screening is being prepared.')).toBeVisible(
    { timeout: 10000 },
  );
  const completed = await page.evaluate(
    () =>
      JSON.parse(localStorage.getItem('thirty-club:membership')!).rooms[
        'screening-room'
      ].completedAt,
  );
  expect(completed).toBeUndefined();
});
test('production strips screening previews; the film is a normal MP4, never precached', async ({
  page,
}) => {
  await page.goto('/?preview=screening-endframe');
  await expect(page.locator('.cinema')).toHaveCount(0);
  await page.goto('/?preview=screening-demo');
  await expect(page.locator('.cinema')).toHaveCount(0);
  const worker = await page.request.get('/sw.js');
  expect(await worker.text()).not.toMatch(/\.mp4/);
  // Served as a file with byte ranges (iOS Safari requires them).
  const film = await page.request.get(
    '/media/screening/screening-test-5s.mp4',
    {
      headers: { range: 'bytes=0-1' },
    },
  );
  expect(film.status()).toBe(206);
  expect(film.headers()['content-type']).toMatch(/video\/mp4/);
});
