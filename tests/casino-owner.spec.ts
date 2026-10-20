import { expect, test } from '@playwright/test';

test('owner issues selected prizes from the mobile Control Centre', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const prize = {
    id: '11111111-1111-4111-8111-111111111111',
    title: 'Two cocktails',
    description: 'A birthday toast',
    presentation: 'With our compliments',
    kind: 'VOUCHER',
    imageUrl: null,
    instructions: '',
    validUntil: null,
    active: true,
    ownerNotes: '',
    vaultId: null,
  };
  let issued: unknown = null;
  await page.route('**/api/v1/owner/**', async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === '/api/v1/owner/casino/prizes')
      return route.fulfill({ json: { prizes: [prize] } });
    if (
      path === '/api/v1/owner/casino/batches' &&
      route.request().method() === 'GET'
    )
      return route.fulfill({ json: { batches: [] } });
    if (path === '/api/v1/owner/vouchers')
      return route.fulfill({ json: { entitlements: [], requests: [] } });
    if (
      path === '/api/v1/owner/casino/batches' &&
      route.request().method() === 'POST'
    ) {
      issued = route.request().postDataJSON();
      return route.fulfill({
        status: 201,
        json: {
          batchId: crypto.randomUUID(),
          quantity: 3,
          remaining: 3,
          status: 'active',
        },
      });
    }
    return route.fulfill({
      status: 404,
      json: { error: 'not-found', message: 'Unavailable' },
    });
  });
  await page.goto('/concierge/owner?section=casino');
  await expect(
    page.getByRole('heading', { name: 'Casino & rewards' }),
  ).toBeVisible();
  await page.screenshot({
    path: 'test-results/casino-owner-mobile.png',
    fullPage: true,
  });
  await page.getByRole('checkbox', { name: /Two cocktails/ }).check();
  await page.getByRole('button', { name: 'Issue spins now' }).click();
  await expect
    .poll(() => issued)
    .toMatchObject({ quantity: 3, prizeIds: [prize.id], announce: true });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
});
