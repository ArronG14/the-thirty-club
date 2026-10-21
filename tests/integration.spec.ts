/**
 * The integrated club in TEST (playwright.rehearsal.config.ts): server-issued
 * Casino spins, a voucher won, requested in the Lounge, fulfilled by the
 * owner and seen fulfilled by Alise; and the communication hold enforced by
 * the (simulated) server. The real `/api/v1` handlers and every migration
 * run inside the tab; nothing reaches the preview server.
 */
import { mkdirSync } from 'node:fs';
import { expect, test, type Page, type Request } from '@playwright/test';

const SHOTS = process.env.REHEARSAL_SHOTS ?? 'docs/integration/screenshots';
mkdirSync(SHOTS, { recursive: true });

async function shot(page: Page, name: string) {
  await page.waitForTimeout(500);
  await page.screenshot({
    path: `${SHOTS}/${name}.jpg`,
    type: 'jpeg',
    quality: 80,
  });
}

function apiCalls(page: Page) {
  const calls: string[] = [];
  page.on('request', (request: Request) => {
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
  await page.getByRole('button', { name }).first().click();
  await page.waitForLoadState('load');
}

test('Casino: three server spins, Bring Me a Drink on the third, CLAIM, a drink request', async ({
  page,
}) => {
  await unlock(page);
  const calls = apiCalls(page);
  await launch(page, /^The Grand Casino/);
  // The real room: roulette on house tokens, the Machine plays her
  // complimentary spins, each decided by the simulated server first.
  await expect(page.locator('.casino[data-house="true"]')).toBeVisible({
    timeout: 60_000,
  });
  await page.getByRole('button', { name: /The Machine/ }).click();
  const count = page.locator('.panel--slots .panel__fine');
  await expect(count).toHaveText('3 complimentary spins at your pleasure', {
    timeout: 60_000,
  });
  await shot(page, '01-casino-three-spins');
  const lever = page.getByRole('button', { name: /Pull the lever/ });
  for (const left of ['2 complimentary spins', 'One complimentary spin']) {
    await lever.click();
    await expect(count).toHaveText(`${left} at your pleasure`, {
      timeout: 30_000,
    });
    await expect(page.locator('.house-prize')).toHaveCount(0);
  }
  // The third spin carries the story's prize, decided by the server.
  await lever.click();
  const prize = page.getByRole('dialog', {
    name: 'Bring Me a Drink — three times',
  });
  await expect(prize).toBeVisible({ timeout: 30_000 });
  await expect(count).toHaveText('0 complimentary spins at your pleasure');
  await shot(page, '02-casino-third-spin-prize');
  // Nothing is credited before her CLAIM; it survives a reload unclaimed.
  await page.reload();
  // Reloaded before dismissing it: the committed prize is presented again.
  await expect(prize).toBeVisible({ timeout: 60_000 });
  await prize.getByRole('button', { name: 'Return to the table' }).click();
  // Dismissed but unclaimed: it waits in the room.
  await page.getByRole('button', { name: /The Machine/ }).click();
  await page.getByRole('button', { name: 'A prize awaits your claim' }).click();
  await prize.getByRole('button', { name: 'Claim your 3 drinks' }).click();
  await expect(prize).toContainText('3 drinks are yours', {
    timeout: 30_000,
  });
  await prize.getByRole('button', { name: 'Return to the table' }).click();
  await expect(
    page.getByRole('button', { name: /Awaiting your next invitation/ }),
  ).toBeDisabled();
  await shot(page, '02-casino-spent');

  // Bring Me a Drink from the Lounge: one voucher, one SMS to the owner.
  await page.goto('/lounge');
  await page.getByRole('button', { name: /^Drinks/ }).click();
  const drinks = page.getByRole('dialog', { name: 'Drinks' });
  await expect(drinks).toContainText('Bring Me a Drink', { timeout: 30_000 });
  await drinks
    .getByLabel('What would you like brought to you?')
    .fill('A rum punch by the pool');
  await drinks.getByRole('button', { name: 'Bring me this drink' }).click();
  await expect(drinks).toContainText(
    'Your request is recorded. The notification to your husband is waiting to be sent.',
    { timeout: 30_000 },
  );
  await expect(drinks.locator('.drinks__history')).toContainText(
    'A rum punch by the pool',
  );
  await expect(drinks.getByLabel('2 of 3 drinks remaining')).toBeVisible();
  await shot(page, '03-bring-me-a-drink');
  // Every call stayed in the tab's simulated office.
  expect(calls).toEqual([]);
});

test('The communication hold: visible, enforced by the server, release not before 21 October', async ({
  page,
}) => {
  await unlock(page);
  const calls = apiCalls(page);
  // This gate needs a fixed instant before the release floor; the actual
  // calendar date must not change its expectation.
  await page.goto('/concierge/owner/test?section=rehearsal');
  await page.getByLabel('Date and time').fill('2026-10-20T23:00');
  await page.getByLabel('Time zone').selectOption('America/Jamaica');
  await page.getByRole('button', { name: 'Set the clock' }).click();
  await page.goto('/concierge/owner/test?section=office&tab=journey');
  await expect(page.getByText('Starting the simulated club office')).toBeHidden(
    { timeout: 90_000 },
  );
  const panel = page.locator('.cc-hold');
  // The TEST office starts released so rooms can be rehearsed.
  await expect(panel).toContainText('Communications to Alise: released', {
    timeout: 30_000,
  });
  page.on('dialog', (dialog) => void dialog.accept());
  await panel
    .getByRole('button', { name: 'Hold all communications again' })
    .click();
  await expect(panel).toContainText('Communications to Alise: ON HOLD');
  await expect(panel).toContainText('Earliest release');
  await expect(
    panel.getByRole('button', {
      name: 'Release is possible from 21 October (Jamaica)',
    }),
  ).toBeDisabled();
  // The journey tab disables what would reach her ...
  const casino = page
    .locator('.office-journey__milestone')
    .filter({ hasText: 'An Invitation of Considerable Importance' });
  await expect(
    casino.getByRole('button', { name: 'Trigger now' }),
  ).toBeDisabled({ timeout: 30_000 });
  await shot(page, '06-hold-in-control-centre');
  // ... and the server refuses it even when asked directly.
  const direct = await page.evaluate(async () => {
    const response = await fetch(
      '/api/v1/owner/journey/milestones/casino-opening/fire',
      {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-concierge-request': '1',
        },
        body: '{}',
      },
    );
    return { status: response.status, body: await response.json() };
  });
  expect(direct.status).toBe(409);
  expect(direct.body.error).toBe('on-hold');
  const release = await page.evaluate(async () => {
    const response = await fetch('/api/v1/owner/communications/release', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-concierge-request': '1',
      },
      body: JSON.stringify({ confirm: 'RELEASE' }),
    });
    return response.status;
  });
  // The rehearsal clock is still 20 October: too early.
  expect(release).toBe(403);
  expect(calls).toEqual([]);
});

test('Scenario: two airport drinks after security; a request reaches the owner’s desk', async ({
  page,
}) => {
  await unlock(page);
  const calls = apiCalls(page);
  await page.getByRole('button', { name: 'Open Dev Mode' }).click();
  await page
    .getByRole('button', { name: /^Airport: two drinks after security/ })
    .click();
  await page.waitForURL('**/lounge');
  const dock = page.getByRole('button', { name: /^Drinks/ });
  await expect(dock).toBeVisible({ timeout: 60_000 });
  await dock.click();
  const sheet = page.getByRole('dialog', { name: 'Drinks' });
  await expect(sheet).toContainText('Two drinks before the flight', {
    timeout: 30_000,
  });
  await expect(sheet.getByLabel('2 of 2 drinks remaining')).toBeVisible();
  await sheet.getByLabel('What may I bring you?').fill('A glass of Ruinart');
  await sheet.getByRole('button', { name: 'Request this drink' }).click();
  await expect(sheet).toContainText('Your request is recorded.', {
    timeout: 30_000,
  });
  await expect(sheet.getByLabel('1 of 2 drinks remaining')).toBeVisible();
  await shot(page, '04-airport-drink-requested');
  await page.goto('/concierge/owner/test?section=drinks');
  await expect(page.getByText('Starting the simulated club office')).toBeHidden(
    { timeout: 90_000 },
  );
  await expect(page.getByText('A glass of Ruinart')).toBeVisible({
    timeout: 30_000,
  });
  await shot(page, '05-owner-drinks-desk');
  expect(calls).toEqual([]);
});

test('Scenario: the private birthday card, sealed and unfolded', async ({
  page,
}) => {
  await unlock(page);
  const calls = apiCalls(page);
  await page.getByRole('button', { name: 'Open Dev Mode' }).click();
  await page
    .getByRole('button', { name: /^Birthday: the private card/ })
    .click();
  await page.waitForURL('**/birthdaycard');
  await page
    .getByRole('button', { name: 'Break the seal' })
    .click({ timeout: 60_000 });
  await expect(page.getByRole('region', { name: 'The card' })).toContainText(
    'Rehearsal card.',
    { timeout: 10_000 },
  );
  await page.waitForTimeout(1600);
  await shot(page, '06-birthday-card');
  expect(calls).toEqual([]);
});

test('Scenario: Nyla’s film on the third spin, replayable from the Lounge', async ({
  page,
}) => {
  await unlock(page);
  const calls = apiCalls(page);
  await page.getByRole('button', { name: 'Open Dev Mode' }).click();
  await page
    .getByRole('button', { name: /^Casino afternoon: Nyla’s film/ })
    .click();
  await page.waitForURL('**/rooms/casino');
  await expect(page.locator('.casino[data-house="true"]')).toBeVisible({
    timeout: 60_000,
  });
  await page.getByRole('button', { name: /The Machine/ }).click();
  const lever = page.getByRole('button', { name: /Pull the lever/ });
  const count = page.locator('.panel--slots .panel__fine');
  await expect(count).toHaveText('3 complimentary spins at your pleasure', {
    timeout: 60_000,
  });
  await lever.click();
  await expect(count).toHaveText('2 complimentary spins at your pleasure', {
    timeout: 30_000,
  });
  await lever.click();
  await expect(count).toHaveText('One complimentary spin at your pleasure', {
    timeout: 30_000,
  });
  await lever.click();
  const film = page.getByRole('dialog', { name: 'A Rather Personal Delivery' });
  await expect(film).toBeVisible({ timeout: 30_000 });
  // The prize holds only the protected reference (ADR-026); the TEST office
  // grants the ticket because she won it, with the five-second test film.
  await expect(film.locator('video')).toHaveAttribute(
    'src',
    /^\/media\/screening\/screening-test-5s\.mp4\?ticket=/,
    { timeout: 15_000 },
  );
  await expect(
    film.getByText(
      'Rehearsal · the five-second test film stands in for this film.',
    ),
  ).toBeVisible();
  await film.getByRole('button', { name: 'Watch' }).click();
  await expect
    .poll(() =>
      film.locator('video').evaluate((v: HTMLVideoElement) => v.currentTime),
    )
    .toBeGreaterThan(0.5);
  await shot(page, '07-film-prize');
  await page.evaluate(() => document.querySelector('video')?.pause());
  await film.getByRole('button', { name: 'Return to the table' }).click();
  await expect(count).toHaveText(/No complimentary spins|0 complimentary/, {
    timeout: 15_000,
  });
  await page.goto('/lounge');
  await page.getByRole('button', { name: 'Your Casino vouchers' }).click();
  const wallet = page.getByRole('dialog', { name: 'Your vouchers' });
  const again = wallet.getByRole('button', { name: 'Watch again' });
  await expect(again).toBeEnabled({ timeout: 30_000 });
  await again.click();
  await expect
    .poll(() =>
      wallet.locator('video').evaluate((v: HTMLVideoElement) => v.currentTime),
    )
    .toBeGreaterThan(0.5);
  // Watching again spent nothing.
  await page.goto('/rooms/casino');
  await page.getByRole('button', { name: /The Machine/ }).click();
  await expect(count).toHaveText(/No complimentary spins|0 complimentary/, {
    timeout: 30_000,
  });
  expect(calls).toEqual([]);
});
