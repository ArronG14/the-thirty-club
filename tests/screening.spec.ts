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
  await expect(page.getByText('The messages are not ready yet.')).toBeVisible();
  await expect(page.locator('canvas, video')).toHaveCount(0);
  await page
    .getByRole('link', { name: 'Return to the Members’ Lounge' })
    .click();
  await expect(page.locator('.lounge')).toBeVisible();
  await page.getByRole('button', { name: 'Members’ Directory' }).click();
  await page
    .getByRole('button', { name: 'Enter: The Private Screening Room' })
    .click();
  await expect(page.getByText('The messages are not ready yet.')).toBeVisible();
  const completed = await page.evaluate(
    () =>
      JSON.parse(localStorage.getItem('thirty-club:membership')!).rooms[
        'screening-room'
      ].completedAt,
  );
  expect(completed).toBeUndefined();
});
test('production strips screening previews and synthetic media from precache', async ({
  page,
}) => {
  await page.goto('/?preview=screening-endframe');
  await expect(page.locator('.cinema')).toHaveCount(0);
  await page.goto('/?preview=screening-demo');
  await expect(page.locator('.cinema')).toHaveCount(0);
  const worker = await page.request.get('/sw.js');
  expect(await worker.text()).not.toMatch(
    /screening-(landscape|portrait)\.mp4|test-landscape|test-portrait/,
  );
});
