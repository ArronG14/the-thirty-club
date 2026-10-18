/* global document, getComputedStyle, Image */
import { chromium } from 'playwright';
import { mkdir } from 'node:fs/promises';
const browser = await chromium.launch();
await mkdir('docs/screening', { recursive: true });
for (const [name, width, height, deviceScaleFactor] of [
  ['mobile', 390, 844, 1],
  ['mobile-3x', 390, 844, 3],
  ['desktop', 1440, 900, 1],
  ['landscape', 844, 390, 1],
]) {
  const context = await browser.newContext({
    viewport: { width, height },
    deviceScaleFactor,
    reducedMotion: 'reduce',
  });
  const page = await context.newPage();
  await page.goto('http://127.0.0.1:5185/?preview=screening-endframe');
  await page.locator('.screening-endframe').waitFor();
  await page.screenshot({ path: `docs/screening/endframe-${name}.png` });
  await page.goto('http://127.0.0.1:5185/?preview=screening-arrival');
  await page.locator('.cinema__screen--blank').waitFor();
  await page.evaluate(async () => {
    await document.fonts.ready;
    const bg = getComputedStyle(
      document.querySelector('.cinema__architecture'),
    ).backgroundImage.slice(5, -2);
    const image = new Image();
    image.src = bg;
    await image.decode();
  });
  await page.screenshot({ path: `docs/screening/arrival-${name}.png` });
  if (name === 'mobile') {
    await page.goto('http://127.0.0.1:5185/?preview=screening-demo');
    await page.getByRole('button', { name: 'Begin screening' }).waitFor();
    await page.screenshot({ path: 'docs/screening/premiere-mobile.png' });
    await page.getByRole('button', { name: 'Begin screening' }).click();
    await page.waitForFunction(
      () => document.querySelector('video').currentTime > 0.2,
    );
    await page.getByRole('button', { name: 'Pause', exact: true }).click();
    await page.getByRole('button', { name: 'Play', exact: true }).waitFor();
    await page.screenshot({
      path: 'docs/screening/player-mobile.png',
      fullPage: true,
    });
    await page.setViewportSize({ width: 844, height: 390 });
    await page.screenshot({ path: 'docs/screening/player-landscape.png' });
    await page.getByRole('slider').fill('5.8');
    await page.getByRole('button', { name: 'Play', exact: true }).click();
    await page
      .getByRole('button', { name: /Watch next message from/ })
      .waitFor();
    await page.screenshot({
      path: 'docs/screening/message-ended-landscape.png',
    });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.screenshot({ path: 'docs/screening/message-ended-mobile.png' });
    await page.getByRole('button', { name: /Watch next message from/ }).click();
    await page.waitForFunction(
      () => document.querySelector('video').videoHeight === 640,
    );
    await page.getByRole('button', { name: 'Pause', exact: true }).click();
    await page.getByRole('button', { name: 'Play', exact: true }).waitFor();
    await page.screenshot({
      path: 'docs/screening/portrait-source-landscape.png',
    });
    await page.setViewportSize({ width: 844, height: 390 });
    await page.screenshot({
      path: 'docs/screening/portrait-source-landscape.png',
    });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.screenshot({
      path: 'docs/screening/portrait-source-mobile.png',
      fullPage: true,
    });
    await page
      .getByRole('button', { name: 'Browse messages', exact: true })
      .click();
    await page.screenshot({ path: 'docs/screening/collection-mobile.png' });
  }
  await context.close();
}
await browser.close();
