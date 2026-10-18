import { expect, test } from '@playwright/test';

// The config's storage state marks the visitor as already verified; these
// tests start from a genuinely fresh browser.
test.use({ storageState: { cookies: [], origins: [] } });
// Two full sequences, each slowed by the software-rendered 3D scene beneath.
test.setTimeout(120_000);

test('first visit holds on the final screen until Enter the Club is pressed', async ({
  page,
}) => {
  await page.goto('/');
  await expect(page.locator('.fv')).toBeVisible();
  await expect(page.getByText('Identity confirmed')).toBeVisible({
    timeout: 45_000,
  });
  await expect(page.getByText(/We’ve been expecting you/)).toBeVisible({
    timeout: 45_000,
  });
  await expect(
    page.getByRole('button', { name: 'Enter the Club' }),
  ).toBeFocused({ timeout: 45_000 });
  // Refreshing before choosing to enter replays the verification.
  await page.reload();
  await expect(page.locator('.fv')).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Enter the Club' }),
  ).toBeVisible({
    timeout: 45_000,
  });
  await page.getByRole('button', { name: 'Enter the Club' }).press('Enter');
  await expect(page.locator('.fv')).toHaveCount(0, { timeout: 15_000 });
  await expect(page.locator('.club')).toBeVisible();
  await page.reload();
  await expect(page.locator('.fv')).toHaveCount(0);
  await expect(page.locator('.club')).toBeVisible();
});
