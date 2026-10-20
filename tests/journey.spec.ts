/**
 * The birthday journey's admission ceremony (ADR-020), rehearsed end to end
 * on an iPhone profile through the Dev Menu: the real `/api/v1` handlers and
 * migrations answer inside the tab (PGlite), and no request reaches the
 * server. Run with playwright.rehearsal.config.ts.
 */
import { mkdirSync } from 'node:fs';
import { expect, test, type Page, type Request } from '@playwright/test';

const SHOTS = process.env.REHEARSAL_SHOTS ?? 'docs/journey/screenshots';
mkdirSync(SHOTS, { recursive: true });

async function shot(page: Page, name: string) {
  await page.waitForTimeout(600);
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

async function launch(page: Page, name: string) {
  await page.getByRole('button', { name: 'Open Dev Mode' }).click();
  await page.getByRole('button', { name }).first().click();
  await page.waitForLoadState('load');
}

test('Casino admission: summons at the doors, Letter of Admission in the Lounge, escort, Directory, return link', async ({
  page,
}) => {
  await unlock(page);
  const calls = apiCalls(page);
  const guestBefore = await page.evaluate(() => JSON.stringify(localStorage));

  // Before admission a direct link names nothing.
  await launch(page, 'Admission ceremony: the Grand Casino');
  await expect(page.locator('.club')).toHaveAttribute('data-stage', 'locked');

  // The Butler's summons waits at the locked doors (Friday morning).
  const envelope = page.getByRole('button', {
    name: /Open your new letter: Your presence is requested in the Lounge/,
  });
  await expect(envelope).toBeVisible({ timeout: 60_000 });
  await envelope.click();
  await page
    .getByRole('button', { name: /Break the seal and open the letter/ })
    .first()
    .click();
  const toLounge = page.getByRole('link', {
    name: 'ENTER THE MEMBERS’ LOUNGE',
  });
  await expect(toLounge).toBeVisible({ timeout: 15_000 });
  await shot(page, '01-summons-at-the-doors');
  await toLounge.click();

  // The Lounge (before the birthday doors) presents the Letter of Admission.
  await expect(page).toHaveURL(/\/lounge\?admission=casino$/);
  const letter = page.getByRole('dialog', { name: 'The Grand Casino' });
  await expect(letter).toBeVisible({ timeout: 30_000 });
  await expect(letter).toContainText('Letter of Admission');
  await shot(page, '02-letter-of-admission');

  // Still hidden while invited: "Keep it for later" shows the Directory.
  await letter.getByRole('button', { name: 'Keep it for later' }).click();
  await page.getByRole('button', { name: /Members’ Directory/ }).click();
  const directory = page.getByRole('dialog', { name: 'Members’ Directory' });
  await expect(directory).not.toContainText('Grand Casino');
  await directory.getByRole('button', { name: 'Close' }).click();
  await page.getByRole('button', { name: 'Read your letter' }).click();

  // Accept: admitted once, then escorted in.
  await page
    .getByRole('dialog', { name: 'The Grand Casino' })
    .getByRole('button', { name: 'ENTER THE GRAND CASINO' })
    .click();
  await expect(page).toHaveURL(/\/rooms\/casino$/, { timeout: 15_000 });
  await expect(page.locator('.casino-live')).toBeVisible({ timeout: 60_000 });
  await shot(page, '03-escorted-into-the-casino');

  // Admitted: a direct link opens it, and it is in the Directory.
  await page.goto('/rooms/casino');
  await expect(page.locator('.casino-live')).toBeVisible({ timeout: 60_000 });
  await page.goto('/lounge');
  await expect(
    page.getByRole('dialog', { name: 'The Grand Casino' }),
  ).toHaveCount(0);
  await page.getByRole('button', { name: /Members’ Directory/ }).click();
  await expect(
    page.getByRole('dialog', { name: 'Members’ Directory' }),
  ).toContainText('The Grand Casino');
  await shot(page, '04-directory-after-admission');

  // Everything stayed in the tab; Alise's real device records are untouched.
  expect(calls).toEqual([]);
  expect(await page.evaluate(() => JSON.stringify(localStorage))).toBe(
    guestBefore,
  );
});

test('Owner journey tab in TEST: timeline in Jamaica time, hold and trigger, room states', async ({
  page,
}) => {
  await unlock(page);
  const calls = apiCalls(page);
  await page.goto('/concierge/owner/test?section=office&tab=journey');
  await expect(page.getByText('Starting the simulated club office')).toBeHidden(
    { timeout: 90_000 },
  );
  const journeyTab = page.getByRole('button', { name: 'journey' });
  if (await journeyTab.isVisible()) await journeyTab.click();
  await expect(
    page.getByRole('heading', { name: 'Birthday journey' }),
  ).toBeVisible({ timeout: 60_000 });
  const casino = page
    .locator('.office-journey__milestone')
    .filter({ hasText: 'The Grand Casino opens' });
  // Chromium writes "Fri 23 Oct, 09:00", Safari "Fri 23 Oct at 09:00".
  await expect(casino).toContainText(/Fri 23 Oct(,| at) 09:00 Jamaica/);
  page.on('dialog', (dialog) => void dialog.accept());
  await casino.getByRole('button', { name: 'Hold' }).click();
  await expect(casino).toContainText('Held');
  await casino.getByRole('button', { name: 'Trigger now' }).click();
  await expect(casino).toContainText('Delivered (in-app)');
  const room = page.locator('.office-journey__rooms [data-room="casino"]');
  await expect(room).toContainText('Invited — letter waiting');
  await shot(page, '05-owner-journey-tab');
  expect(calls).toEqual([]);
});
