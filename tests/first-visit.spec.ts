import { expect, test } from '@playwright/test';

// The config's storage state marks the visitor as already verified; these
// tests start from a genuinely fresh browser.
test.use({ storageState: { cookies: [], origins: [] } });

test('first visit plays the verification, then reveals the entrance once', async ({
  page,
}) => {
  await page.goto('/');
  await expect(page.locator('.fv')).toBeVisible();
  await expect(page.getByText('Identity confirmed')).toBeVisible({
    timeout: 15_000,
  });
  await expect(page.getByText(/We’ve been expecting you/)).toBeVisible();
  await expect(page.locator('.fv')).toHaveCount(0, { timeout: 15_000 });
  await expect(page.locator('.club')).toBeVisible();
  await page.reload();
  await expect(page.locator('.fv')).toHaveCount(0);
  await expect(page.locator('.club')).toBeVisible();
});
