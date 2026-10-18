/**
 * Textures painted at load for the Grand Casino: velvet damask, the black
 * marble floor with its brass inlay, the felt layout, the wheel head, the
 * reel strips, the ceiling and the placeholder wall art. Everything is
 * procedural so nothing needs downloading and nothing has unclear licensing;
 * bespoke artwork replaces the wall art and marquee through casinoAssets.
 */
import * as THREE from 'three';
import {
  canvas,
  makeNoise,
  mulberry32,
  paint,
  toTexture,
} from '../../entrance/scene/canvasTextures';
import { colourOf, WHEEL_ORDER } from '../domain/roulette';
import { REEL_LENGTH, STRIPS } from '../domain/slots';
import { POCKET_STEP } from './casinoMath';
import { DISPLAY_FONT, drawSymbol } from './symbolArt';

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
const TAU = Math.PI * 2;
const GOLD = '#c9a663';
const GOLD_HI = '#ecd699';

/** Oxblood velvet with a tone-on-tone Art Deco fan (scale) pattern. */
export function velvetWallTexture() {
  const SIZE = 512;
  const noise = makeNoise(21, 64);
  const base = paint(SIZE, SIZE, (x, y) => {
    const n = noise(x / 5, y / 5) * 0.5 + noise(x / 1.7, y / 1.7) * 0.5;
    const k = 0.78 + n * 0.4;
    return [74 * k, 20 * k, 36 * k];
  });
  const ctx = base.getContext('2d')!;
  const S = SIZE / 4;
  ctx.lineWidth = 2;
  for (let row = -2; row < 10; row += 1) {
    for (let col = -1; col < 5; col += 1) {
      const cx = (col + (row % 2 === 0 ? 0 : 0.5)) * S;
      const cy = row * (S / 2);
      for (const [r, a] of [
        [S * 0.5, 0.34],
        [S * 0.39, 0.26],
        [S * 0.28, 0.2],
        [S * 0.17, 0.16],
      ] as const) {
        ctx.strokeStyle = `rgba(214,172,104,${a})`;
        ctx.beginPath();
        ctx.arc(cx, cy, r, Math.PI, TAU);
        ctx.stroke();
      }
    }
  }
  return toTexture(base, true);
}

/**
 * Floor, 8 m × 10.6 m: black marble with pale veining, and a brass inlay
 * (border lines and a compass-star medallion) under the room's centre.
 */
export function floorTexture() {
  const W = 1024;
  const H = 1344;
  const n1 = makeNoise(5, 48);
  const n2 = makeNoise(9, 96);
  const marble = paint(W, H, (x, y) => {
    const warp = n1(x / 150, y / 150) * 6 + n2(x / 60, y / 60) * 1.6;
    const ridge = 1 - Math.abs(Math.sin(x / 95 + y / 140 + warp));
    const vein = Math.pow(ridge, 22);
    const fine = Math.pow(
      1 - Math.abs(Math.sin(x / 31 - y / 47 + warp * 1.7)),
      30,
    );
    const cloud = n2(x / 28, y / 28) * 10;
    const v = 12 + cloud + vein * 78 + fine * 30;
    return [v * 1.02, v * 0.98, v * 0.97];
  });
  const ctx = marble.getContext('2d')!;
  const pxm = W / 8;
  const stroke = (width: number, alpha = 1) => {
    ctx.lineWidth = width;
    ctx.strokeStyle = `rgba(201,166,99,${alpha})`;
  };
  // Border lines, 0.5 m and 0.62 m in from the walls.
  for (const [inset, width] of [
    [0.5, 6],
    [0.64, 2.5],
  ] as const) {
    stroke(width);
    ctx.strokeRect(
      inset * pxm,
      inset * pxm,
      W - 2 * inset * pxm,
      H - 2 * inset * pxm,
    );
  }
  // Medallion under the middle of the room.
  const cx = W / 2;
  const cy = ((-0.9 + 5) / 10.6) * H;
  const R = 1.9 * pxm;
  ctx.save();
  ctx.translate(cx, cy);
  const wine = ctx.createRadialGradient(0, 0, R * 0.2, 0, 0, R);
  wine.addColorStop(0, 'rgba(74,20,36,0.0)');
  wine.addColorStop(0.75, 'rgba(74,20,36,0.55)');
  wine.addColorStop(1, 'rgba(74,20,36,0.0)');
  ctx.fillStyle = wine;
  ctx.beginPath();
  ctx.arc(0, 0, R, 0, TAU);
  ctx.fill();
  for (const [r, w] of [
    [R, 5],
    [R * 0.93, 1.8],
    [R * 0.62, 3.5],
    [R * 0.3, 2.5],
  ] as const) {
    stroke(w);
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, TAU);
    ctx.stroke();
  }
  // Sixteen-point compass star.
  stroke(2.4, 0.95);
  ctx.fillStyle = 'rgba(201,166,99,0.22)';
  for (let i = 0; i < 16; i += 1) {
    const a = (i / 16) * TAU;
    const long = i % 4 === 0;
    const len = R * (long ? 0.93 : i % 2 === 0 ? 0.74 : 0.55);
    const half = (TAU / 16) * (long ? 0.45 : 0.4);
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(
      Math.sin(a - half) * len * 0.22,
      -Math.cos(a - half) * len * 0.22,
    );
    ctx.lineTo(Math.sin(a) * len, -Math.cos(a) * len);
    ctx.lineTo(
      Math.sin(a + half) * len * 0.22,
      -Math.cos(a + half) * len * 0.22,
    );
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  }
  ctx.restore();
  return toTexture(marble, true, false);
}

/**
 * The roulette felt, 1.25 m × 3.0 m (512 px per metre). Canvas top is the
 * wheel end. The layout is decorative; betting happens on the interface.
 */
export function feltTexture() {
  const W = 640;
  const H = 1536;
  const n = makeNoise(17, 64);
  const felt = paint(W, H, (x, y) => {
    const k = 0.84 + n(x / 3, y / 3) * 0.26 + n(x / 40, y / 40) * 0.12;
    return [10 * k, 74 * k, 50 * k];
  });
  const ctx = felt.getContext('2d')!;
  ctx.strokeStyle = GOLD;
  ctx.fillStyle = GOLD;
  ctx.lineWidth = 3;
  ctx.strokeRect(24, 24, W - 48, H - 48);
  ctx.lineWidth = 1.2;
  ctx.strokeRect(34, 34, W - 68, H - 68);

  const x0 = 95;
  const cell = 150;
  const row = 54;
  const top = 720;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  // Zero.
  ctx.fillStyle = '#0c6b3e';
  ctx.fillRect(x0, top - 56, cell * 3, 54);
  ctx.strokeStyle = GOLD;
  ctx.lineWidth = 2;
  ctx.strokeRect(x0, top - 56, cell * 3, 54);
  ctx.fillStyle = '#f4ebdd';
  ctx.font = `600 34px ${DISPLAY_FONT}`;
  ctx.fillText('0', x0 + cell * 1.5, top - 28);
  // 1…36 in twelve rows of three.
  for (let r = 0; r < 12; r += 1) {
    for (let c = 0; c < 3; c += 1) {
      const num = r * 3 + c + 1;
      const x = x0 + c * cell;
      const y = top + r * row;
      ctx.fillStyle = colourOf(num) === 'red' ? '#9d1228' : '#0b0b0c';
      ctx.fillRect(x + 4, y + 4, cell - 8, row - 8);
      ctx.strokeStyle = GOLD;
      ctx.lineWidth = 2;
      ctx.strokeRect(x, y, cell, row);
      ctx.fillStyle = '#f4ebdd';
      ctx.font = `600 30px ${DISPLAY_FONT}`;
      ctx.fillText(String(num), x + cell / 2, y + row / 2 + 2);
    }
  }
  // Dozens and even-money bands.
  const dozensY = top + 12 * row + 6;
  ctx.font = `500 22px ${DISPLAY_FONT}`;
  ['1st 12', '2nd 12', '3rd 12'].forEach((label, i) => {
    ctx.strokeStyle = GOLD;
    ctx.strokeRect(x0 + i * cell, dozensY, cell, 46);
    ctx.fillStyle = GOLD_HI;
    ctx.fillText(label, x0 + i * cell + cell / 2, dozensY + 24);
  });
  const outsideY = dozensY + 52;
  ['1–18', 'EVEN', '◆', '◆', 'ODD', '19–36'].forEach((label, i) => {
    const w = (cell * 3) / 6;
    ctx.strokeStyle = GOLD;
    ctx.strokeRect(x0 + i * w, outsideY, w, 46);
    if (label === '◆') {
      ctx.fillStyle = i === 2 ? '#9d1228' : '#0b0b0c';
      ctx.beginPath();
      const cx = x0 + i * w + w / 2;
      ctx.moveTo(cx, outsideY + 6);
      ctx.lineTo(cx + 16, outsideY + 23);
      ctx.lineTo(cx, outsideY + 40);
      ctx.lineTo(cx - 16, outsideY + 23);
      ctx.closePath();
      ctx.fill();
    } else {
      ctx.fillStyle = GOLD_HI;
      ctx.font = `500 17px ${DISPLAY_FONT}`;
      ctx.fillText(label, x0 + i * w + w / 2, outsideY + 24);
    }
  });
  ctx.fillStyle = 'rgba(236,214,153,0.8)';
  ctx.font = `600 30px ${DISPLAY_FONT}`;
  ctx.letterSpacing = '8px';
  ctx.fillText('THE THIRTY CLUB', W / 2, 676);
  return toTexture(felt, true, false);
}

/**
 * The rotating wheel head, 0.355 m radius across 1024 px. Pockets are
 * drawn clockwise from the top in `WHEEL_ORDER`, matching `pocketAngle`.
 */
export function wheelHeadTexture() {
  const SIZE = 1024;
  const [c, ctx] = canvas(SIZE, SIZE);
  const R = SIZE / 2;
  const m = R / 0.355; // pixels per metre
  ctx.translate(R, R);
  // Dark lacquer under everything.
  ctx.fillStyle = '#120807';
  ctx.beginPath();
  ctx.arc(0, 0, R, 0, TAU);
  ctx.fill();
  const inner = 0.19 * m;
  const pocketOuter = 0.3 * m;
  const numberOuter = 0.352 * m;
  const fills = { red: '#a3122d', black: '#0e0e10', green: '#0c6b3e' };
  for (let i = 0; i < WHEEL_ORDER.length; i += 1) {
    const number = WHEEL_ORDER[i]!;
    const mid = i * POCKET_STEP;
    const a0 = mid - POCKET_STEP / 2 - Math.PI / 2;
    const a1 = mid + POCKET_STEP / 2 - Math.PI / 2;
    const colour = fills[colourOf(number)];
    // Pocket floor and the number band share the pocket's colour.
    ctx.fillStyle = colour;
    ctx.beginPath();
    ctx.arc(0, 0, numberOuter, a0, a1);
    ctx.arc(0, 0, inner, a1, a0, true);
    ctx.closePath();
    ctx.fill();
    // A darker pocket floor sunk beneath the number band.
    ctx.fillStyle = 'rgba(0,0,0,0.28)';
    ctx.beginPath();
    ctx.arc(0, 0, pocketOuter - 0.012 * m, a0 + 0.012, a1 - 0.012);
    ctx.arc(0, 0, inner + 0.012 * m, a1 - 0.012, a0 + 0.012, true);
    ctx.closePath();
    ctx.fill();
    // Number, upright when read from the rim, at the outer band.
    ctx.save();
    ctx.rotate(mid);
    ctx.translate(0, -(pocketOuter + numberOuter) / 2);
    ctx.fillStyle = '#f4ebdd';
    ctx.font = `600 ${0.027 * m}px ${DISPLAY_FONT}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(String(number), 0, 2);
    ctx.restore();
    // Fret between pockets.
    ctx.save();
    ctx.rotate(mid + POCKET_STEP / 2);
    ctx.fillStyle = GOLD;
    ctx.fillRect(-1.4, -pocketOuter, 2.8, pocketOuter - inner);
    ctx.restore();
  }
  for (const [r, w] of [
    [pocketOuter, 5],
    [inner, 4],
    [numberOuter, 6],
  ] as const) {
    ctx.strokeStyle = GOLD;
    ctx.lineWidth = w;
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, TAU);
    ctx.stroke();
  }
  // The area under the cone.
  ctx.fillStyle = '#2a140c';
  ctx.beginPath();
  ctx.arc(0, 0, inner, 0, TAU);
  ctx.fill();
  return toTexture(c, true, false);
}

/** A reel strip: twelve symbols round the cylinder, one per 128 px cell. */
export function reelTexture(reel: number) {
  const CELL_W = 128;
  const CELL_H = 160;
  const [c, ctx] = canvas(CELL_W * REEL_LENGTH, CELL_H);
  const strip = STRIPS[reel]!;
  for (let i = 0; i < REEL_LENGTH; i += 1) {
    const g = ctx.createLinearGradient(i * CELL_W, 0, (i + 1) * CELL_W, 0);
    g.addColorStop(0, '#d8c9a4');
    g.addColorStop(0.5, '#f4ebd6');
    g.addColorStop(1, '#d8c9a4');
    ctx.fillStyle = g;
    ctx.fillRect(i * CELL_W, 0, CELL_W, CELL_H);
    ctx.fillStyle = 'rgba(122,90,34,0.5)';
    ctx.fillRect(i * CELL_W, 0, 2, CELL_H);
    ctx.save();
    // On the cylinder, canvas +x runs up the reel and +y runs rightwards.
    ctx.translate(i * CELL_W + CELL_W / 2, CELL_H / 2);
    ctx.rotate(Math.PI / 2);
    drawSymbol(ctx, strip[i]!, 108);
    ctx.restore();
  }
  const tex = toTexture(c, true, false);
  tex.wrapS = THREE.RepeatWrapping;
  tex.anisotropy = 4;
  return tex;
}

/** The backlit slot marquee. Used unless a bespoke image replaces it. */
export function marqueeTexture() {
  const [c, ctx] = canvas(1536, 384);
  const g = ctx.createLinearGradient(0, 0, 0, 384);
  g.addColorStop(0, '#5a1124');
  g.addColorStop(1, '#2c0912');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 1536, 384);
  ctx.strokeStyle = GOLD;
  ctx.lineWidth = 6;
  ctx.strokeRect(18, 18, 1500, 348);
  ctx.lineWidth = 2;
  ctx.strokeRect(34, 34, 1468, 316);
  // Fan motifs at each end.
  for (const cx of [150, 1386]) {
    for (let r = 28; r <= 112; r += 28) {
      ctx.beginPath();
      ctx.arc(cx, 330, r, Math.PI, TAU);
      ctx.stroke();
    }
  }
  ctx.fillStyle = GOLD_HI;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = `600 150px ${DISPLAY_FONT}`;
  ctx.letterSpacing = '26px';
  ctx.fillText('THIRTY', 768, 160);
  ctx.font = '500 40px Jost, sans-serif';
  ctx.letterSpacing = '24px';
  ctx.fillText('THE THIRTY CLUB  ·  EST. MMXXVI', 768, 292);
  return toTexture(c, true, false);
}

/** Ceiling, 8 m × 10.6 m: black-cherry lacquer with a gilt octagon. */
export function ceilingTexture() {
  const W = 512;
  const H = 680;
  const n = makeNoise(33, 32);
  const lacquer = paint(W, H, (x, y) => {
    const k = 0.8 + n(x / 40, y / 40) * 0.5;
    return [34 * k, 11 * k, 16 * k];
  });
  const ctx = lacquer.getContext('2d')!;
  const pxm = W / 8;
  const cx = W / 2;
  const cy = ((-1.4 + 5) / 10.6) * H;
  ctx.translate(cx, cy);
  ctx.strokeStyle = 'rgba(201,166,99,0.85)';
  for (const [r, w] of [
    [2.9, 3],
    [2.55, 1.2],
    [1.9, 2.2],
    [0.9, 1.6],
  ] as const) {
    ctx.lineWidth = w;
    ctx.beginPath();
    for (let i = 0; i <= 8; i += 1) {
      const a = (i / 8) * TAU + TAU / 16;
      const x = Math.cos(a) * r * pxm;
      const y = Math.sin(a) * r * pxm * 0.93;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
  ctx.lineWidth = 1;
  for (let i = 0; i < 32; i += 1) {
    const a = (i / 32) * TAU;
    ctx.beginPath();
    ctx.moveTo(Math.cos(a) * 0.9 * pxm, Math.sin(a) * 0.9 * pxm);
    ctx.lineTo(Math.cos(a) * 2.55 * pxm, Math.sin(a) * 2.55 * pxm * 0.93);
    ctx.stroke();
  }
  return toTexture(lacquer, true, false);
}

/** Placeholder Art Deco wall art; the real pieces come from the registry. */
export function artTexture(variant: 0 | 1 | 2) {
  const W = 512;
  const H = 768;
  const [c, ctx] = canvas(W, H);
  const rand = mulberry32(40 + variant);
  const bg = ctx.createLinearGradient(0, 0, 0, H);
  const palettes = [
    ['#2c0912', '#6b1a2c'],
    ['#10231c', '#1f4a38'],
    ['#1a1020', '#4a2a52'],
  ] as const;
  bg.addColorStop(0, palettes[variant][0]);
  bg.addColorStop(1, palettes[variant][1]);
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);
  ctx.strokeStyle = 'rgba(214,172,104,0.9)';
  ctx.lineWidth = 3;
  const cx = W / 2;
  if (variant === 0) {
    // Sunburst over a skyline.
    for (let i = 0; i < 36; i += 1) {
      const a = Math.PI + (i / 35) * Math.PI;
      ctx.beginPath();
      ctx.moveTo(cx, 470);
      ctx.lineTo(cx + Math.cos(a) * 420, 470 + Math.sin(a) * 420);
      ctx.stroke();
    }
    ctx.fillStyle = '#12060a';
    for (let x = 0; x < W; x += 36) {
      const h = 90 + rand() * 190;
      ctx.fillRect(x, 520 - h + 250, 30, h + 40);
    }
  } else if (variant === 1) {
    // Concentric arches.
    for (let r = 40; r < 340; r += 34) {
      ctx.beginPath();
      ctx.arc(cx, 520, r, Math.PI, TAU);
      ctx.moveTo(cx - r, 520);
      ctx.lineTo(cx - r, 700);
      ctx.moveTo(cx + r, 520);
      ctx.lineTo(cx + r, 700);
      ctx.stroke();
    }
  } else {
    // A fan of petals.
    for (let i = 0; i < 9; i += 1) {
      const a = Math.PI + 0.15 + (i / 8) * (Math.PI - 0.3);
      ctx.beginPath();
      ctx.ellipse(
        cx + Math.cos(a) * 130,
        470 + Math.sin(a) * 130,
        130,
        46,
        a,
        0,
        TAU,
      );
      ctx.stroke();
    }
    ctx.beginPath();
    ctx.arc(cx, 470, 24, 0, TAU);
    ctx.stroke();
  }
  ctx.fillStyle = 'rgba(236,214,153,0.85)';
  ctx.textAlign = 'center';
  ctx.font = `500 34px ${DISPLAY_FONT}`;
  ctx.letterSpacing = '12px';
  ctx.fillText(['MMXXVI', 'SALON', 'ROYALE'][variant]!, cx, H - 64);
  return toTexture(c, true, false);
}

/** Radial glow for hover pools and halos (re-exported for the scene). */
export { glowTexture } from '../../entrance/scene/canvasTextures';

export const clampUnit = clamp01;
