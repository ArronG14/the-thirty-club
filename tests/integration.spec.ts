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

test('Casino to voucher: server spins, a win, the Lounge wallet, owner fulfilment', async ({
  page,
}) => {
  await unlock(page);
  const calls = apiCalls(page);
  await launch(page, /^The Grand Casino/);
  const count = page.locator('.casino-live__count');
  await expect(count).toHaveText('3 spins at your pleasure', {
    timeout: 60_000,
  });
  await shot(page, '01-casino-three-spins');
  const spinButton = page.getByRole('button', { name: 'Spin the wheel' });
  const results: string[] = [];
  for (const left of ['2 spins', '1 spin', '0 spins']) {
    await spinButton.click();
    await expect(count).toHaveText(`${left} at your pleasure`, {
      timeout: 30_000,
    });
    const result = page.locator('.casino-live__result h2');
    await expect(result).toBeVisible({ timeout: 30_000 });
    results.push((await result.textContent()) ?? '');
  }
  // The batch held exactly one prize, decided by the server.
  expect(
    results.filter((r) => r === 'Rehearsal voucher · two cocktails'),
  ).toHaveLength(1);
  await expect(
    page.getByRole('button', { name: 'Awaiting your next invitation' }),
  ).toBeDisabled();
  await shot(page, '02-casino-spent');

  // The voucher in the Lounge wallet; Alise asks the Butler to redeem it.
  await page.goto('/lounge');
  await page.getByRole('button', { name: 'Your Casino vouchers' }).click();
  const wallet = page.getByRole('dialog', { name: 'Your vouchers' });
  await expect(wallet).toContainText('Rehearsal voucher · two cocktails', {
    timeout: 30_000,
  });
  await wallet
    .getByRole('button', { name: 'Ask the Butler to redeem this' })
    .click();
  await expect(wallet).toContainText('Requested · awaiting arrangement');
  await shot(page, '03-wallet-requested');

  // The owner sees the request and fulfils it.
  await page.goto('/concierge/owner/test?section=casino');
  await expect(page.getByText('Starting the simulated club office')).toBeHidden(
    { timeout: 90_000 },
  );
  const fulfil = page.getByRole('button', { name: 'Mark fulfilled' });
  await expect(fulfil).toBeVisible({ timeout: 30_000 });
  await shot(page, '04-owner-request');
  await fulfil.click();
  await expect(fulfil).toHaveCount(0, { timeout: 15_000 });

  // She sees it fulfilled.
  await page.goto('/lounge');
  await page.getByRole('button', { name: 'Your Casino vouchers' }).click();
  await expect(
    page.getByRole('dialog', { name: 'Your vouchers' }),
  ).toContainText('Fulfilled', { timeout: 30_000 });
  await shot(page, '05-wallet-fulfilled');
  expect(calls).toEqual([]);
});

test('The communication hold: visible, enforced by the server, release not before 21 October', async ({
  page,
}) => {
  await unlock(page);
  const calls = apiCalls(page);
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
    .filter({ hasText: 'The Grand Casino opens' });
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
