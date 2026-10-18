/* global document, MediaRecorder, setInterval, setTimeout, clearInterval, Blob, Buffer */
// Synthetic technical films only. Recreate with: node tools/create-screening-fixtures.mjs
import { chromium } from 'playwright';
import { writeFile, mkdir } from 'node:fs/promises';
const browser = await chromium.launch();
const page = await browser.newPage();
await mkdir('tests/fixtures', { recursive: true });
for (const [name, width, height] of [
  ['landscape', 640, 360],
  ['portrait', 360, 640],
]) {
  const bytes = await page.evaluate(
    async ({ width, height }) => {
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const context = canvas.getContext('2d');
      const stream = canvas.captureStream(24);
      const recorder = new MediaRecorder(stream, {
        mimeType: 'video/mp4;codecs=avc1.42001E',
        videoBitsPerSecond: 180000,
      });
      const chunks = [];
      recorder.ondataavailable = (event) => chunks.push(event.data);
      const finished = new Promise((resolve) => (recorder.onstop = resolve));
      let frame = 0;
      const paint = () => {
        context.fillStyle = '#43202b';
        context.fillRect(0, 0, width, height);
        context.fillStyle = '#c7aa70';
        context.fillRect((frame * 3) % width, 0, 24, height);
        context.fillStyle = '#f4ebdd';
        context.font = '24px sans-serif';
        context.fillText('TECHNICAL TEST', 30, height / 2);
        frame++;
      };
      paint();
      recorder.start();
      const interval = setInterval(paint, 1000 / 24);
      await new Promise((resolve) => setTimeout(resolve, 6000));
      recorder.stop();
      clearInterval(interval);
      await finished;
      stream.getTracks().forEach((track) => track.stop());
      return Array.from(
        new Uint8Array(
          await new Blob(chunks, { type: recorder.mimeType }).arrayBuffer(),
        ),
      );
    },
    { width, height },
  );
  await writeFile(`tests/fixtures/screening-${name}.mp4`, Buffer.from(bytes));
}
await browser.close();
