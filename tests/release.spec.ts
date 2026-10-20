/**
 * The 21 October release in TEST (playwright.rehearsal.config.ts): the
 * early admission at 19:00 UK, SMS operations with an owner rehearsal, and
 * a rehearsal SMS link opening the matching TEST rehearsal. The real
 * handlers and migrations run inside the tab; nothing reaches the server.
 */
import { mkdirSync } from 'node:fs';
import { expect, test, type Page, type Request } from '@playwright/test';

const SHOTS = process.env.REHEARSAL_SHOTS ?? 'docs/release/screenshots';
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

async function scenario(page: Page, name: string) {
  await page.getByRole('button', { name: 'Open Dev Mode' }).click();
  await page.getByRole('button', { name }).first().click();
  await page.waitForLoadState('load');
}

test('Early admission at 19:00 UK: the hold at ten seconds, the final ten, the doors, the membership', async ({
  page,
}) => {
  test.setTimeout(240_000);
  await unlock(page);
  const calls = apiCalls(page);
  await scenario(page, 'Early admission: after the 16:00 teaser');
  const club = page.locator('.club');
  await expect(club).toHaveAttribute('data-stage', 'locked');
  await expect(
    page.getByText('Alise, your admission has been brought forward.'),
  ).toBeVisible({ timeout: 60_000 });
  await expect(page.getByRole('timer')).toContainText('2 hours, 58 minutes');
  await shot(page, '01-after-the-teaser');

  await scenario(page, 'Early admission: 19:00 UK, card already presented');
  await expect(page.getByRole('timer')).toContainText('0 minutes, 10 seconds', {
    timeout: 60_000,
  });
  await shot(page, '02-holding-at-ten-seconds');
  // 19:00 passes; the server agrees; the final ten seconds; the doors.
  await expect(club).toHaveAttribute('data-stage', /unlocking|opening|foyer/, {
    timeout: 60_000,
  });
  await expect(
    page.getByRole('heading', { name: 'The Members’ Lounge' }),
  ).toBeVisible({ timeout: 30_000 });
  await shot(page, '03-the-membership-ceremony');
  // The Butler's induction and the membership card ("documentation").
  for (let i = 0; i < 3; i++)
    await page.getByRole('button', { name: 'Continue', exact: true }).click();
  await page.getByRole('button', { name: 'Accept your membership' }).click();
  await page.getByRole('button', { name: 'Members’ Directory' }).click();
  const directory = page.getByRole('dialog', { name: 'Members’ Directory' });
  await expect(directory).not.toContainText('Grand Casino');
  await expect(directory).not.toContainText('Screening Room');
  await expect(directory).not.toContainText('Gift Vault');
  await shot(page, '04-lounge-directory');
  await directory.getByRole('button', { name: 'Close' }).click();
  // A reload keeps the membership: no second ceremony.
  await page.reload();
  await expect(
    page.getByRole('heading', { name: 'The Members’ Lounge' }),
  ).toBeVisible({ timeout: 30_000 });
  await expect(
    page.getByRole('button', { name: 'Accept your membership' }),
  ).toHaveCount(0);
  await page.goto('/rooms/casino');
  await expect(
    page.getByRole('heading', { name: 'Not this way, Madam.' }),
  ).toBeVisible();
  expect(calls).toEqual([]);
});

test('SMS operations in TEST: modes, the teaser rehearsed to the owner’s number', async ({
  page,
}) => {
  await unlock(page);
  const calls = apiCalls(page);
  await page.goto('/concierge/owner/test?section=sms');
  await expect(page.getByText('Starting the simulated club office')).toBeHidden(
    { timeout: 90_000 },
  );
  const ops = page.locator('.sms-ops');
  await expect(ops).toContainText('Owner test number: configured', {
    timeout: 60_000,
  });
  await ops.getByRole('button', { name: 'REHEARSAL' }).click();
  await expect(ops.locator('.sms-ops__mode')).toContainText('REHEARSAL');
  const teaser = ops
    .locator('.sms-ops__list li')
    .filter({ hasText: 'Butler · early-access teaser' });
  await expect(teaser).toContainText('Draft — not approved');
  await teaser.getByRole('button', { name: 'Rehearse to my phone' }).click();
  await expect(ops.getByRole('status')).toContainText(
    'Sent to your verified test number',
  );
  const log = ops.locator('.sms-ops__list li[data-state="accepted"]').first();
  await expect(log).toContainText(
    '[REHEARSAL — This message will be sent to Alise]',
  );
  await expect(log).toContainText(
    '/rehearse?path=%2F&scenario=early-admission-teaser',
  );
  await expect(teaser).toContainText('Draft — not approved');
  await shot(page, '05-sms-operations-rehearsal');
  // LIVE needs the typed word.
  await ops.getByRole('button', { name: 'LIVE…' }).click();
  await expect(
    ops.getByRole('button', { name: 'Switch to LIVE' }),
  ).toBeDisabled();
  expect(calls).toEqual([]);
});

test('A rehearsal SMS link opens the matching TEST rehearsal only after the private code', async ({
  page,
}) => {
  await page.goto('/rehearse?path=%2F&scenario=early-admission-teaser');
  await expect(
    page.getByRole('heading', { name: 'A rehearsal link' }),
  ).toBeVisible();
  await expect(page.locator('.club')).toHaveCount(0);
  await page
    .getByRole('button', { name: 'Enter the private access code' })
    .click();
  await page.getByLabel('Private access code').fill('1414');
  await page.getByRole('button', { name: 'Unlock private office' }).click();
  await expect(
    page.getByText('Alise, your admission has been brought forward.'),
  ).toBeVisible({ timeout: 90_000 });
  await expect(page.getByTestId('rehearsal-indicator')).toBeAttached();
});

test('19:00 without the card: the clock holds at ten seconds; the letter, then the card, then the doors', async ({
  page,
}) => {
  test.setTimeout(240_000);
  await unlock(page);
  const calls = apiCalls(page);
  await scenario(page, 'Early admission: 19:00 UK, waiting for the card');
  const club = page.locator('.club');
  await expect(page.getByRole('timer')).toContainText('0 minutes, 10 seconds', {
    timeout: 60_000,
  });
  await expect(
    page.getByText(
      'Alise, the club is ready to receive you. Your membership card, if you please.',
    ),
  ).toBeVisible({ timeout: 60_000 });
  // 19:00 alone opens nothing.
  await page.waitForTimeout(12_000);
  await expect(club).toHaveAttribute('data-stage', 'final-minute');
  await expect(page.getByRole('timer')).toContainText('0 minutes, 10 seconds');
  // The Butler's letter (the TEST office's rehearsal clue).
  await page.getByRole('button', { name: 'Your early admission' }).click();
  await expect(page.getByText('beneath the second cushion')).toBeVisible();
  await shot(page, '06-the-letter-and-the-clue');
  await page.getByRole('button', { name: 'Close' }).click();
  // The printed number by hand (the fallback to scanning).
  await page.getByRole('button', { name: 'Present the card by hand' }).click();
  await page
    .getByLabel('The number on your membership card')
    .fill('TC-3010-2410');
  await page.getByRole('button', { name: 'Present membership' }).click();
  await expect(club).toHaveAttribute('data-stage', /unlocking|opening|foyer/, {
    timeout: 30_000,
  });
  await expect(
    page.getByRole('heading', { name: 'The Members’ Lounge' }),
  ).toBeVisible({ timeout: 30_000 });
  for (let i = 0; i < 3; i++)
    await page.getByRole('button', { name: 'Continue', exact: true }).click();
  await page.getByRole('button', { name: 'Accept your membership' }).click();
  await page.reload();
  await expect(
    page.getByRole('heading', { name: 'The Members’ Lounge' }),
  ).toBeVisible({ timeout: 30_000 });
  await expect(
    page.getByRole('button', { name: 'Accept your membership' }),
  ).toHaveCount(0);
  expect(calls).toEqual([]);
});

test('The card scanned with NFC: a new tab, the final ten seconds, the doors and the Lounge', async ({
  context,
  page,
}) => {
  test.setTimeout(240_000);
  // What a spare TEST card carries; iPhone opens it in a new Safari tab.
  const tab = await context.newPage();
  const calls = apiCalls(tab);
  await tab.goto('/rehearse?scenario=early-admission-card-scan');
  await tab
    .getByRole('button', { name: 'Enter the private access code' })
    .click();
  await tab.getByLabel('Private access code').fill('1414');
  await tab.getByRole('button', { name: 'Unlock private office' }).click();
  const club = tab.locator('.club');
  await expect(club).toHaveAttribute('data-stage', /final-minute|unlocking/, {
    timeout: 90_000,
  });
  await expect(club).toHaveAttribute('data-stage', /unlocking|opening|foyer/, {
    timeout: 30_000,
  });
  await expect(
    tab.getByRole('heading', { name: 'The Members’ Lounge' }),
  ).toBeVisible({ timeout: 30_000 });
  await shot(tab, '07-after-the-card-scan');
  for (let i = 0; i < 3; i++)
    await tab.getByRole('button', { name: 'Continue', exact: true }).click();
  await tab.getByRole('button', { name: 'Accept your membership' }).click();
  // A reload (or backgrounding) of that tab: no second ceremony.
  await tab.reload();
  await expect(
    tab.getByRole('heading', { name: 'The Members’ Lounge' }),
  ).toBeVisible({ timeout: 30_000 });
  await expect(
    tab.getByRole('button', { name: 'Accept your membership' }),
  ).toHaveCount(0);
  expect(calls).toEqual([]);
  await page.close();
});
