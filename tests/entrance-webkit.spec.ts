import { expect, test, type Page } from '@playwright/test';

// iPhone-profile WebKit, hardware WebGL: the failure this guards against
// (the 3D entrance dissolving back to the poster a few seconds after it
// rendered) only appears with real frame timing, so these use real clocks.
const VERIFIED = 'thirty-club:first-visit-verified';
const STABLE_MS = 30_000;

type Diag = {
  state: string;
  reason?: string;
  message?: string;
  tier?: number;
  contextLosses: number;
};

const diag = (page: Page) =>
  page.evaluate(
    () => (window as unknown as { __entranceDiag?: Diag }).__entranceDiag,
  );
const render = (page: Page) =>
  page.locator('.facade').getAttribute('data-render');

async function expectSceneStable(page: Page) {
  await expect(page.locator('.facade')).toHaveAttribute(
    'data-render',
    'scene',
    { timeout: 30_000 },
  );
  // Past the performance-governor windows and well beyond them.
  const until = Date.now() + STABLE_MS;
  while (Date.now() < until) {
    await page.waitForTimeout(2_000);
    expect(await render(page), JSON.stringify(await diag(page))).toBe('scene');
  }
  const final = await diag(page);
  expect(final?.state).toBe('running');
  expect(await page.locator('canvas.scene-canvas').count()).toBe(1);
}

const markVerified = (page: Page) =>
  page.addInitScript((key) => localStorage.setItem(key, 'x'), VERIFIED);

test('repeat visit: the 3D entrance stays active for 30 s', async ({
  page,
}) => {
  await markVerified(page);
  await page.goto('/');
  await expectSceneStable(page);
});

test('first visit: Enter the Club reveals a 3D entrance that stays active', async ({
  page,
}) => {
  await page.goto('/');
  await expect(page.locator('.fv')).toBeVisible();
  // The scene loads and plays beneath the overlay.
  await expect(page.locator('.facade')).toHaveAttribute(
    'data-render',
    'scene',
    { timeout: 30_000 },
  );
  const enter = page.getByRole('button', { name: 'Enter the Club' });
  await expect(enter).toBeVisible({ timeout: 45_000 });
  const canvas = await page.locator('canvas.scene-canvas').elementHandle();
  await enter.click();
  await expect(page.locator('.fv')).toHaveCount(0, { timeout: 15_000 });
  // The same canvas: nothing was remounted or recreated.
  expect(
    await page.evaluate(
      (el) => el === document.querySelector('canvas.scene-canvas'),
      canvas,
    ),
  ).toBe(true);
  await expectSceneStable(page);
});

test('owner replay: the existing scene stays stable', async ({ page }) => {
  await markVerified(page);
  await page.goto('/?verify=replay');
  await expect(page.locator('.fv')).toBeVisible();
  await page
    .getByRole('button', { name: 'Enter the Club' })
    .click({ timeout: 60_000 });
  await expect(page.locator('.fv')).toHaveCount(0, { timeout: 15_000 });
  await expectSceneStable(page);
});

test('a lost WebGL context that returns keeps the 3D scene', async ({
  page,
}) => {
  await markVerified(page);
  await page.goto('/');
  await expect(page.locator('.facade')).toHaveAttribute(
    'data-render',
    'scene',
    { timeout: 30_000 },
  );
  await page.evaluate(() => {
    const gl = document
      .querySelector<HTMLCanvasElement>('canvas.scene-canvas')!
      .getContext('webgl2')!;
    const ext = gl.getExtension('WEBGL_lose_context')!;
    ext.loseContext();
    setTimeout(() => ext.restoreContext(), 1_500);
  });
  await page.waitForTimeout(8_000);
  expect(await render(page)).toBe('scene');
  const d = await diag(page);
  expect(d?.contextLosses).toBe(1);
  expect(d?.state).toBe('running');
});

test('a context that never returns falls back, naming the cause', async ({
  page,
}) => {
  await markVerified(page);
  await page.goto('/');
  await expect(page.locator('.facade')).toHaveAttribute(
    'data-render',
    'scene',
    { timeout: 30_000 },
  );
  await page.evaluate(() => {
    document
      .querySelector<HTMLCanvasElement>('canvas.scene-canvas')!
      .getContext('webgl2')!
      .getExtension('WEBGL_lose_context')!
      .loseContext();
  });
  await expect(page.locator('.facade')).toHaveAttribute(
    'data-render',
    'poster',
    { timeout: 15_000 },
  );
  expect((await diag(page))?.reason).toBe('context-lost');
});

test('a genuine initialisation failure still shows the poster', async ({
  page,
}) => {
  await markVerified(page);
  // The capability probe succeeds; creating the real renderer then fails.
  await page.addInitScript(() => {
    const original = HTMLCanvasElement.prototype.getContext;
    let calls = 0;
    HTMLCanvasElement.prototype.getContext = function (
      this: HTMLCanvasElement,
      ...args: Parameters<typeof original>
    ) {
      if (String(args[0]).startsWith('webgl') && ++calls > 1) return null;
      return original.apply(this, args);
    } as typeof original;
  });
  await page.goto('/?entrance-diag=1');
  await expect(page.locator('.facade')).toHaveAttribute(
    'data-render',
    'poster',
    { timeout: 30_000 },
  );
  const d = await diag(page);
  expect(d?.state).toBe('fallback');
  expect(d?.reason).toBe('error');
  await expect(page.getByRole('status').first()).toContainText('3D fallback');
  await expect(
    page.getByRole('button', { name: 'Ring for service' }),
  ).toBeVisible();
});
