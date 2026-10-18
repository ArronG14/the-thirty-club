/**
 * Textures drawn at load: brass draw lines, glass, glows and every piece of
 * lettering (which must use the self-hosted fonts, so it cannot be baked).
 * Scanned wood, stone and marble live in ./assets.
 */
import * as THREE from 'three';

export function mulberry32(seed: number) {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Tileable value noise on an integer lattice of the given period. */
export function makeNoise(seed: number, period: number) {
  const rand = mulberry32(seed);
  const grid = new Float32Array(period * period).map(() => rand());
  const at = (x: number, y: number) =>
    grid[
      (((y % period) + period) % period) * period +
        (((x % period) + period) % period)
    ]!;
  return (x: number, y: number) => {
    const xi = Math.floor(x);
    const yi = Math.floor(y);
    const xf = x - xi;
    const yf = y - yi;
    const u = xf * xf * (3 - 2 * xf);
    const v = yf * yf * (3 - 2 * yf);
    const a = at(xi, yi);
    const b = at(xi + 1, yi);
    const c = at(xi, yi + 1);
    const d = at(xi + 1, yi + 1);
    return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
  };
}

export function canvas(width: number, height: number) {
  const c = document.createElement('canvas');
  c.width = width;
  c.height = height;
  return [c, c.getContext('2d')!] as const;
}

export function paint(
  width: number,
  height: number,
  pixel: (x: number, y: number) => [number, number, number],
) {
  const [c, ctx] = canvas(width, height);
  const image = ctx.createImageData(width, height);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const [r, g, b] = pixel(x, y);
      const i = (y * width + x) * 4;
      image.data[i] = r;
      image.data[i + 1] = g;
      image.data[i + 2] = b;
      image.data[i + 3] = 255;
    }
  }
  ctx.putImageData(image, 0, 0);
  return c;
}

export function toTexture(
  source: HTMLCanvasElement,
  colour: boolean,
  repeat = true,
) {
  const tex = new THREE.CanvasTexture(source);
  if (repeat) {
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
  }
  if (colour) tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

/** Brushed brass: horizontal draw lines drive roughness. */
export function brushedBrassRoughness() {
  const n = makeNoise(7, 256);
  const rows = Array.from({ length: 256 }, (_, y) => n(0, y * 0.9));
  return toTexture(
    paint(256, 256, (x, y) => {
      const v = 70 + rows[y]! * 50 + n(x / 40, y) * 20;
      return [v, v, v];
    }),
    false,
  );
}

/** Reeded amber glass lit from behind: brightest low and centre. */
export function reededGlass() {
  const W = 512;
  const H = 256;
  const n = makeNoise(13, 128);
  return toTexture(
    paint(W, H, (x, y) => {
      const dx = (x - W / 2) / (W / 2);
      const dy = (H - y) / H;
      const falloff = clamp01(1 - Math.sqrt(dx * dx * 0.7 + dy * dy * 1.1));
      const reed = 0.82 + 0.18 * Math.sin((x / W) * Math.PI * 2 * 70);
      const mottle = 0.85 + n(x / 6, y / 6) * 0.3;
      const v = (0.1 + falloff * 0.9) * reed * mottle;
      return [
        255 * clamp01(v),
        255 * clamp01(v * 0.66),
        255 * clamp01(v * 0.32),
      ];
    }),
    true,
    false,
  );
}

/** Soft radial sprite for halos and light pools. */
export function glowTexture(
  inner = 'rgba(255,214,150,1)',
  mid = 'rgba(255,214,150,0.45)',
  outer = 'rgba(255,170,90,0)',
) {
  const [c, ctx] = canvas(256, 256);
  const g = ctx.createRadialGradient(128, 128, 0, 128, 128, 128);
  g.addColorStop(0, inner);
  g.addColorStop(0.25, mid);
  g.addColorStop(1, outer);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 256, 256);
  return toTexture(c, true, false);
}

/** The room beyond the doors: warm chandelier light over oxblood. */
export function interiorTexture() {
  const [c, ctx] = canvas(512, 512);
  const base = ctx.createLinearGradient(0, 0, 0, 512);
  base.addColorStop(0, '#5a1a26');
  base.addColorStop(0.55, '#7a2a2a');
  base.addColorStop(1, '#2a0c12');
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, 512, 512);
  // Panelled bays and an arch, softly lit.
  ctx.strokeStyle = 'rgba(232,200,140,0.35)';
  ctx.lineWidth = 3;
  for (const x of [96, 416]) {
    ctx.strokeRect(x - 36, 150, 72, 300);
  }
  ctx.beginPath();
  ctx.moveTo(176, 470);
  ctx.lineTo(176, 230);
  ctx.arc(256, 230, 80, Math.PI, 0);
  ctx.lineTo(336, 470);
  ctx.stroke();
  const light = ctx.createRadialGradient(256, 70, 0, 256, 70, 300);
  light.addColorStop(0, 'rgba(255,244,214,1)');
  light.addColorStop(0.22, 'rgba(255,214,150,0.75)');
  light.addColorStop(1, 'rgba(255,170,90,0)');
  ctx.fillStyle = light;
  ctx.fillRect(0, 0, 512, 512);
  const floor = ctx.createLinearGradient(0, 430, 0, 512);
  floor.addColorStop(0, 'rgba(240,220,190,0)');
  floor.addColorStop(1, 'rgba(240,220,190,0.35)');
  ctx.fillStyle = floor;
  ctx.fillRect(0, 430, 512, 82);
  return toTexture(c, true, false);
}

/** Counter drum strip: 0–9 stacked, ivory on black enamel. */
export function drumStrip() {
  const cell = 160;
  const [c, ctx] = canvas(128, cell * 10);
  ctx.fillStyle = '#0e0b0b';
  ctx.fillRect(0, 0, c.width, c.height);
  ctx.fillStyle = '#f4ebdd';
  ctx.font = '500 132px "Bodoni Moda"';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  for (let d = 0; d < 10; d += 1) {
    ctx.fillText(String(d), 64, d * cell + cell / 2 + 6);
  }
  const t = toTexture(c, true, false);
  t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(1, 0.1);
  return t;
}

/** Cylinder shading fixed in front of each drum window. */
export function drumShade() {
  const [c, ctx] = canvas(4, 128);
  const g = ctx.createLinearGradient(0, 0, 0, 128);
  g.addColorStop(0, 'rgba(0,0,0,0.92)');
  g.addColorStop(0.3, 'rgba(0,0,0,0.05)');
  g.addColorStop(0.5, 'rgba(255,240,210,0.06)');
  g.addColorStop(0.7, 'rgba(0,0,0,0.05)');
  g.addColorStop(1, 'rgba(0,0,0,0.92)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 4, 128);
  return toTexture(c, false, false);
}

export function medallionTexture() {
  const [c, ctx] = canvas(512, 512);
  ctx.fillStyle = '#c9a663';
  ctx.fillRect(0, 0, 512, 512);
  ctx.beginPath();
  ctx.arc(256, 256, 196, 0, Math.PI * 2);
  ctx.fillStyle = '#0d0a0b';
  ctx.fill();
  ctx.lineWidth = 6;
  ctx.strokeStyle = '#e6cf94';
  ctx.beginPath();
  ctx.arc(256, 256, 180, 0, Math.PI * 2);
  ctx.stroke();
  ctx.fillStyle = '#e6cf94';
  ctx.font = '500 230px "Bodoni Moda"';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('30', 256, 270);
  return toTexture(c, true, false);
}

export function letteringTexture() {
  const [c, ctx] = canvas(2048, 320);
  ctx.fillStyle = '#d8bc80';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = '500 150px "Bodoni Moda"';
  ctx.letterSpacing = '38px';
  ctx.fillText('THE THIRTY CLUB', 1043, 130);
  ctx.font = '400 46px Jost';
  ctx.letterSpacing = '30px';
  ctx.fillText('EST. MMXXVI', 1039, 268);
  return toTexture(c, true, false);
}

/** Wait for the faces the canvases draw with (served from the precache). */
export async function loadSceneFonts() {
  if (!('fonts' in document)) return;
  await Promise.all([
    document.fonts.load('500 132px "Bodoni Moda"'),
    document.fonts.load('600 44px Jost'),
  ]);
}
