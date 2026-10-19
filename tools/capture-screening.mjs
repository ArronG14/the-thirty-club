/* global document, getComputedStyle, Image, localStorage */
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
  await page.locator('.cinema__poster--blank').waitFor();
  const settle = () =>
    page.evaluate(async () => {
      await document.fonts.ready;
      const bg = getComputedStyle(
        document.querySelector('.cinema__architecture'),
      ).backgroundImage.slice(5, -2);
      const image = new Image();
      image.src = bg;
      await image.decode();
    });
  await settle();
  await page.screenshot({ path: `docs/screening/arrival-${name}.png` });
  // Seated with the poster and the Butler's introduction (test film).
  await page.goto('http://127.0.0.1:5185/?preview=screening-demo');
  await page.evaluate(() => localStorage.removeItem('thirty-club:screening'));
  await page.reload();
  await page.getByRole('button', { name: 'Watch Movie' }).waitFor();
  await page.locator('.cinema__words').waitFor();
  await settle();
  await page.screenshot({ path: `docs/screening/seated-${name}.png` });
  await context.close();
}
await browser.close();
