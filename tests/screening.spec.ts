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
  // Not admitted (ADR-020): refused, and the room is not named.
  await expect(
    page.getByRole('heading', { name: 'Not this way, Madam.' }),
  ).toBeVisible();
  await expect(page.getByText(/Screening Room/)).toHaveCount(0);
  await page.evaluate((stamp) => {
    // The admission the office confirmed, as the device remembers it (the
    // preview server has no journey office).
    localStorage.setItem(
      'thirty-club:journey',
      JSON.stringify({ version: 1, admitted: ['screening-room'], pending: [] }),
    );
    localStorage.setItem(
      'thirty-club:membership',
      JSON.stringify({ version: 1, inductedAt: stamp, rooms: {} }),
    );
    localStorage.setItem(
      'thirty-club:entrance',
      JSON.stringify({ version: 1, unlockedAt: stamp, ceremonySeenAt: stamp }),
    );
  }, seen);
  // LIVE, the film protected (ADR-026): with no member session the server
  // refuses the ticket (this preview has no office, so it answers as the
  // real one does). Honest, nothing to play, never the test film.
  let tickets = 0;
  await page.route('**/api/v1/media/birthday-film', (route) => {
    tickets++;
    return route.fulfill({
      status: 401,
      contentType: 'application/json',
      body: JSON.stringify({ error: 'unauthorised' }),
    });
  });
  await page.reload();
  await expect(
    page.getByText('Please present your membership card to watch this film.'),
  ).toBeVisible();
  expect(tickets).toBeGreaterThan(0);
  await expect(page.locator('canvas')).toHaveCount(0);
  await expect(page.locator('video')).not.toHaveAttribute('src');
  await expect(page.getByText(/test film/i)).toHaveCount(0);
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
  await expect(
    page.getByRole('heading', { name: 'Thirty Years of Alise' }),
  ).toBeVisible({ timeout: 10000 });
  await expect(page.locator('video')).not.toHaveAttribute('src');
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
