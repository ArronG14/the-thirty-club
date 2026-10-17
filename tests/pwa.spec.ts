import { expect, test } from '@playwright/test';

test('production shell precaches and supports offline navigation', async ({
  page,
  context,
}) => {
  await page.goto('/');
  await expect(
    page.getByRole('heading', { name: 'The Thirty Club' }),
  ).toBeVisible();
  await expect(page.getByRole('status')).toContainText(
    'available offline on this device',
  );
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  const manifest = await page.request.get('/manifest.webmanifest');
  expect(manifest.ok()).toBeTruthy();
  const config = await manifest.json();
  expect(config.display).toBe('standalone');
  expect(config.icons).toHaveLength(3);
  for (const icon of config.icons as { src: string }[]) {
    expect((await page.request.get(icon.src)).ok()).toBeTruthy();
  }
  await context.setOffline(true);
  await page.reload();
  expect(
    await page.evaluate(() => navigator.serviceWorker.controller !== null),
  ).toBe(true);
  await expect(
    page.getByRole('heading', { name: 'The Thirty Club' }),
  ).toBeVisible();
  await expect(page.getByRole('status')).toContainText('You are offline.');
  await page.goto('/missing-room');
  await expect(
    page.getByRole('heading', { name: 'This room does not exist.' }),
  ).toBeVisible();
  await page.getByRole('link', { name: 'Return to the entrance' }).click();
  await expect(
    page.getByRole('heading', { name: 'The Thirty Club' }),
  ).toBeVisible();
  const apiFailed = await page.evaluate(async () => {
    try {
      await fetch('/api/redemptions');
      return false;
    } catch {
      return true;
    }
  });
  expect(apiFailed).toBe(true);
  await context.setOffline(false);
});
