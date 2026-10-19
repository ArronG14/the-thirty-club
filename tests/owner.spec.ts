import { expect, test, type Page } from '@playwright/test';

test.use({
  viewport: { width: 390, height: 844 },
  hasTouch: true,
  isMobile: true,
  reducedMotion: 'reduce',
});

async function poster(page: Page) {
  await page.addInitScript(() => {
    Object.defineProperty(window, 'WebGL2RenderingContext', {
      value: undefined,
    });
  });
}
async function unlock(page: Page, target = '.timepiece') {
  for (let i = 0; i < 5; i++) await page.locator(target).tap();
  await expect(
    page.getByRole('dialog', { name: 'A private appointment' }),
  ).toBeVisible();
  await page.getByLabel('Private access code').fill('1414');
  await page.getByRole('button', { name: 'Unlock private office' }).click();
  await expect(
    page.getByRole('button', { name: 'Dev Mode: open rehearsal controls' }),
  ).toBeVisible();
}
async function panel(page: Page) {
  await page.getByRole('button', { name: 'Dev Mode: open rehearsal controls' }).click();
}

test('mobile activation, incorrect PIN, room navigation, test rewards, reset and exit', async ({
  page,
  context,
}) => {
  await poster(page);
  await page.clock.setFixedTime(new Date(2026, 9, 18));
  await page.goto('/?preview=evening');
  await expect(page.locator('.club')).toHaveAttribute('data-stage', 'locked');
  await expect(
    page.getByRole('button', { name: 'Dev Mode: open rehearsal controls' }),
  ).toHaveCount(0);
  for (let i = 0; i < 4; i++) await page.locator('.timepiece').tap();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.locator('.timepiece').tap();
  await page.getByLabel('Private access code').fill('0000');
  await page.getByRole('button', { name: 'Unlock private office' }).click();
  await expect(page.getByRole('alert')).toHaveText(
    'Access not granted. Please try again.',
  );
  await page.getByLabel('Private access code').fill('1414');
  await page.getByRole('button', { name: 'Unlock private office' }).click();
  await panel(page);
  await page.screenshot({ path: 'test-results/owner-panel-mobile.png' });
  await page.getByRole('button', { name: 'Enter Club', exact: true }).click();
  await expect(page.locator('.lounge')).toBeVisible();
  await panel(page);
  await page
    .getByRole('button', { name: 'The Private Screening Room', exact: true })
    .click();
  await expect(page.locator('.cinema')).toBeVisible();
  await panel(page);
  await page
    .getByRole('button', { name: 'The Grand Casino', exact: true })
    .click();
  await expect(page.locator('.casino')).toBeVisible();
  const guestBefore = await page.evaluate(() => JSON.stringify(localStorage));
  await page.getByRole('button', { name: 'Casino test controls' }).click();
  await page
    .getByRole('button', { name: 'Completed state', exact: true })
    .click();
  const testLedger = await page.evaluate(() =>
    sessionStorage.getItem('thirty-club:owner:thirty-club:prizes'),
  );
  expect(testLedger).toContain('claimed');
  expect(await page.evaluate(() => JSON.stringify(localStorage))).toBe(
    guestBefore,
  );
  await page.reload();
  await expect(
    page.getByRole('button', { name: 'Casino test controls' }),
  ).toBeVisible();
  expect(
    await page.evaluate(() =>
      sessionStorage.getItem('thirty-club:owner:thirty-club:prizes'),
    ),
  ).toBe(testLedger);
  // An independent tab has no owner authorization, even on the same origin.
  const guest = await context.newPage();
  await poster(guest);
  await guest.clock.setFixedTime(new Date(2026, 9, 18));
  await guest.goto('/rooms/casino');
  await expect(
    guest.getByText('This room is not open yet.', { exact: false }),
  ).toBeVisible();
  await expect(
    guest.getByRole('button', { name: 'Casino test controls' }),
  ).toHaveCount(0);
  await guest.close();
  await panel(page);
  await page.getByRole('button', { name: 'Reset test progress' }).click();
  await expect(page.locator('.club')).toHaveAttribute('data-stage', 'locked');
  expect(
    await page.evaluate(() =>
      sessionStorage.getItem('thirty-club:owner:thirty-club:prizes'),
    ),
  ).toBeNull();
  await panel(page);
  await page.getByRole('button', { name: 'Exit owner mode' }).click();
  await expect(
    page.getByRole('button', { name: 'Dev Mode: open rehearsal controls' }),
  ).toHaveCount(0);
  await expect(page.locator('.club')).toHaveAttribute('data-stage', 'locked');
  expect(
    await page.evaluate(() => localStorage.getItem('thirty-club:prizes')),
  ).toBeNull();
});

test('birthday preview runs the ceremony and returns to a locked rehearsal', async ({
  page,
}) => {
  await poster(page);
  await page.goto('/');
  await unlock(page);
  await panel(page);
  await page.getByRole('button', { name: 'Preview birthday unlock' }).click();
  await expect(page.locator('.club')).toHaveAttribute(
    'data-stage',
    'final-minute',
  );
  await expect(page.locator('.club')).toHaveAttribute('data-stage', 'foyer', {
    timeout: 15000,
  });
  expect(
    await page.evaluate(() => localStorage.getItem('thirty-club:entrance')),
  ).toBeNull();
  await panel(page);
  await page.getByRole('button', { name: 'Return to locked entrance' }).click();
  await expect(page.locator('.club')).toHaveAttribute('data-stage', 'locked');
});

test('owner menu previews the Departure Lounge through silent NFC rehearsal', async ({
  page,
  request,
  browser,
}) => {
  await request.post('/api/__local/reset');
  await request.post('/api/__local/clock', { data: { now: null } });
  await poster(page);
  await page.goto('/');
  await unlock(page);
  await panel(page);
  await page.getByRole('button', { name: 'The Departure Lounge' }).click();
  await expect(page).toHaveURL(/\/concierge\/owner\?start=departure$/);
  await page.getByLabel('Owner key').fill('test-owner-key-0001');
  await page.getByRole('button', { name: 'Open the console' }).click();
  await expect(page).toHaveURL(/\/departure$/);
  await expect(page.getByLabel('Rehearsal')).toBeVisible();
  await expect(page.locator('.departure')).toHaveAttribute(
    'data-phase',
    'credential',
  );

  // Opening the same URL as a physical tag exercises the real activation route.
  await page.goto('/c/departure-test-token-0001');
  await expect(page).toHaveURL(/\/departure$/);
  await expect(
    page.getByText('Your travel credentials are in order'),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Enter the lounge' }).click();
  await page
    .getByRole('button', { name: 'Break the seal: Duty-Free Indulgence' })
    .click();
  await page.getByRole('button', { name: 'Inform Arron' }).click();
  await expect(
    page.getByText('Rehearsal recorded. No notification was sent.'),
  ).toBeVisible();
  const outbox = await request.get('/api/__local/outbox');
  expect(await outbox.json()).toEqual([]);

  const live = await request.get('/api/owner/overview?realm=live', {
    headers: { 'x-owner-key': 'test-owner-key-0001' },
  });
  expect((await live.json()).redemptions).toEqual([]);
  const guest = await browser.newContext();
  const guestPage = await guest.newPage();
  await guestPage.goto('/departure');
  await expect(guestPage.locator('.departure')).toHaveAttribute(
    'data-phase',
    'closed',
  );
  await guest.close();
});

test('five actual touch taps work over the projected Three.js clock', async ({
  page,
}) => {
  test.setTimeout(90000);
  await page.clock.setFixedTime(new Date(2026, 9, 18));
  await page.goto('/');
  await expect(page.locator('.facade')).toHaveAttribute(
    'data-render',
    'scene',
    { timeout: 60000 },
  );
  await expect(page.locator('canvas.scene-canvas')).toHaveCount(1);
  await page.screenshot({ path: 'test-results/owner-clock-3d.png' });
  await unlock(page, '.owner-clock-target');
});

test('closing the owner tab ends authentication', async ({ context }) => {
  const owner = await context.newPage();
  await poster(owner);
  await owner.goto('/');
  await unlock(owner);
  await owner.close();
  const fresh = await context.newPage();
  await poster(fresh);
  await fresh.clock.setFixedTime(new Date(2026, 9, 18));
  await fresh.goto('/');
  await expect(fresh.locator('.club')).toHaveAttribute('data-stage', 'locked');
  await expect(
    fresh.getByRole('button', { name: 'Dev Mode: open rehearsal controls' }),
  ).toHaveCount(0);
});
