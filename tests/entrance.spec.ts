import { expect, test } from '@playwright/test';

// Real-browser checks of the production build: no preview bypass, and the
// real-time entrance dissolving in over its poster. Fake-clock ceremony
// tests run against the poster (see entrance-poster.spec.ts).

test('production ignores development preview parameters', async ({ page }) => {
  await page.clock.setFixedTime(new Date(2026, 9, 17, 20, 0, 0));
  for (const mode of ['foyer', 'arrival', 'midnight']) {
    await page.goto(`/?preview=${mode}`);
    await expect(page.locator('.club')).toHaveAttribute('data-stage', 'locked');
    await expect(
      page.getByText('Alise, your table is being prepared.'),
    ).toBeVisible();
    await expect(
      page.getByRole('navigation', { name: 'Development preview' }),
    ).toHaveCount(0);
  }
});

test.describe('real-time entrance', () => {
  test('dissolves from the poster into the 3D scene, with a working bell', async ({
    page,
  }) => {
    // Headless Chromium renders WebGL in software (SwiftShader); first-frame
    // timings here say nothing about a phone's GPU.
    test.setTimeout(90_000);
    await page.clock.setFixedTime(new Date(2026, 9, 20, 21, 0, 0));
    await page.goto('/');
    const facade = page.locator('.facade');
    await expect(facade).toHaveAttribute('data-render', /loading|fading|scene/);
    await expect(facade).toHaveAttribute('data-render', 'scene', {
      timeout: 60_000,
    });
    await expect(page.locator('canvas.scene-canvas')).toHaveCount(1);
    // Poster art is gone; the accessible structure remains.
    await expect(page.locator('.portal')).toBeHidden();
    await expect(
      page.getByRole('heading', { name: 'The Thirty Club' }),
    ).toBeAttached();
    await expect(page.getByRole('timer')).toContainText('days');

    const bell = page.getByRole('button', { name: 'Ring for service' });
    await expect(bell).toBeVisible();
    await bell.click();
    await expect(
      page.getByText(/Good evening, Alise\. Your membership has been approved/),
    ).toBeVisible();
  });
});
