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
    page.getByRole('button', { name: 'Open Dev Mode' }),
  ).toBeVisible();
}
async function panel(page: Page) {
  await page.getByRole('button', { name: 'Open Dev Mode' }).click();
}

async function launch(page: Page, name: RegExp) {
  await panel(page);
  await page.getByRole('button', { name }).first().click();
  await page.waitForLoadState('load');
}

test('mobile activation, incorrect PIN, room launches, test rewards, reset and exit', async ({
  page,
  context,
}) => {
  await poster(page);
  await page.clock.setFixedTime(new Date(2026, 9, 18));
  await page.goto('/');
  await expect(page.locator('.club')).toHaveAttribute('data-stage', 'locked');
  await expect(page.getByRole('button', { name: 'Open Dev Mode' })).toHaveCount(
    0,
  );
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
  await expect(page.getByTestId('rehearsal-indicator')).toBeAttached();
  await panel(page);
  await page.screenshot({ path: 'test-results/owner-panel-mobile.png' });
  await page.getByRole('button', { name: 'Close' }).click();
  await launch(page, /^The Members’ Lounge/);
  await expect(page.locator('.lounge')).toBeVisible();
  await launch(page, /^The Private Screening Room/);
  await expect(page.locator('.cinema').first()).toBeVisible();
  await launch(page, /^The Grand Casino/);
  // The real room with the house's prizes (ADR-024): a rehearsal batch of
  // three spins issued by the simulated server, never by the browser.
  await page.getByRole('button', { name: /The Machine/ }).click();
  const count = page.locator('.panel--slots .panel__fine');
  await expect(count).toHaveText('3 complimentary spins at your pleasure', {
    timeout: 60_000,
  });
  const guestBefore = await page.evaluate(() => JSON.stringify(localStorage));
  await page.getByRole('button', { name: /Pull the lever/ }).click();
  await expect(count).toHaveText('2 complimentary spins at your pleasure', {
    timeout: 30_000,
  });
  // The spin is the simulated server's record; Alise's real device records
  // are untouched. (Persistence across pages is covered by
  // tests/integration.spec.ts: under this test's frozen clock the simulated
  // database does not flush to IndexedDB, docs/REHEARSAL.md.)
  expect(await page.evaluate(() => JSON.stringify(localStorage))).toBe(
    guestBefore,
  );
  // An independent tab has no owner authorization, even on the same origin.
  const guest = await context.newPage();
  await poster(guest);
  await guest.clock.setFixedTime(new Date(2026, 9, 18));
  await guest.goto('/rooms/casino');
  // LIVE: not admitted, so the gate refuses and names nothing (ADR-020).
  await expect(
    guest.getByRole('heading', { name: 'Not this way, Madam.' }),
  ).toBeVisible();
  await expect(guest.getByText(/Casino/)).toHaveCount(0);
  await expect(
    guest.getByRole('button', { name: 'Casino test controls' }),
  ).toHaveCount(0);
  await guest.close();
  await panel(page);
  await page
    .getByRole('button', { name: 'Reset the entire rehearsal' })
    .click();
  await expect(page.locator('.club')).toHaveAttribute('data-stage', 'locked');
  expect(
    await page.evaluate(() =>
      sessionStorage.getItem('thirty-club:owner:thirty-club:prizes'),
    ),
  ).toBeNull();
  await panel(page);
  await page.getByRole('button', { name: /^Exit Dev Mode/ }).click();
  await expect(page.getByRole('button', { name: 'Open Dev Mode' })).toHaveCount(
    0,
  );
  await expect(page.locator('.club')).toHaveAttribute('data-stage', 'locked');
  expect(
    await page.evaluate(() => localStorage.getItem('thirty-club:prizes')),
  ).toBeNull();
});

test('the 19:00 card scenario runs the ceremony; a reset returns to the locked doors', async ({
  page,
}) => {
  test.setTimeout(120_000);
  await poster(page);
  await page.goto('/');
  await unlock(page);
  await panel(page);
  await page
    // Renamed with the NFC-before-door fix: the TEST card is presented
    // explicitly after the invitation (a retained session cannot start it).
    .getByRole('button', {
      name: /^Early admission: 19:00 UK, card presented after invitation/,
    })
    .click();
  await expect(page.locator('.club')).toHaveAttribute(
    'data-stage',
    /locked|final-minute/,
  );
  await expect(page.locator('.club')).toHaveAttribute('data-stage', 'foyer', {
    timeout: 60000,
  });
  expect(
    await page.evaluate(() => localStorage.getItem('thirty-club:entrance')),
  ).toBeNull();
  await panel(page);
  await page.getByRole('button', { name: /^Before departure/ }).click();
  await expect(page.locator('.club')).toHaveAttribute('data-stage', 'locked');
});

test('Dev Mode rehearses the Departure Lounge in the simulated concierge', async ({
  page,
  request,
  browser,
}) => {
  await request.post('/api/__local/reset');
  await poster(page);
  await page.goto('/');
  await unlock(page);
  const calls: string[] = [];
  page.on('request', (r) => {
    if (new URL(r.url()).pathname.startsWith('/api/')) calls.push(r.url());
  });
  await launch(page, /^The Departure Lounge \(find the credential\)/);
  await expect(page).toHaveURL(/\/departure$/);
  await expect(page.getByLabel('Rehearsal')).toBeVisible();
  await expect(page.locator('.departure')).toHaveAttribute(
    'data-phase',
    'credential',
  );

  // Opening the same URL as a physical tag exercises the activation route.
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
  // Nothing reached the server at all: the concierge was simulated.
  expect(calls).toEqual([]);
  const outbox = await request.get('/api/__local/outbox');
  expect(await outbox.json()).toEqual([]);
  const live = await request.get('/api/owner/overview?realm=live', {
    headers: { 'x-owner-key': 'test-owner-key-0001' },
  });
  expect((await live.json()).redemptions).toEqual([]);
  const guest = await browser.newContext();
  const guestPage = await guest.newPage();
  await guestPage.goto('/departure');
  await expect(guestPage.locator('.departure')).not.toHaveAttribute(
    'data-phase',
    'lounge',
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
    fresh.getByRole('button', { name: 'Open Dev Mode' }),
  ).toHaveCount(0);
});
