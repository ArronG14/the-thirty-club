/**
 * Textures drawn at load for the Gift Vault: engraved number plates, the
 * combination dial, leather lining and the envelope. Lettering waits for
 * the self-hosted fonts (loadSceneFonts). Nothing here names a present.
 */
import * as THREE from 'three';
import {
  canvas,
  makeNoise,
  paint,
  toTexture,
} from '../../entrance/scene/canvasTextures';

const DISPLAY = '"Bodoni Moda", "Bodoni 72", Didot, Georgia, serif';
const CAPS = 'Jost, Futura, "Avenir Next", sans-serif';

function brassGradient(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
): CanvasGradient {
  const g = ctx.createLinearGradient(0, 0, w, h);
  g.addColorStop(0, '#f1d9a0');
  g.addColorStop(0.35, '#c9a061');
  g.addColorStop(0.55, '#e8c98a');
  g.addColorStop(1, '#8f6a34');
  return g;
}

function engrave(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
) {
  // Cut letters: a dark fill with a light lower lip where the cut catches light.
  ctx.fillStyle = 'rgba(255,240,205,0.55)';
  ctx.fillText(text, x, y + 2);
  ctx.fillStyle = '#2a1c0d';
  ctx.fillText(text, x, y);
}

/** The engraved oval plate on one of Alise's compartments. */
export function numberPlate(n: number) {
  const [c, ctx] = canvas(512, 256);
  ctx.fillStyle = brassGradient(ctx, 512, 256);
  ctx.beginPath();
  ctx.ellipse(256, 128, 246, 118, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = 'rgba(60,40,15,0.75)';
  ctx.lineWidth = 6;
  ctx.beginPath();
  ctx.ellipse(256, 128, 226, 100, 0, 0, Math.PI * 2);
  ctx.stroke();
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = `600 30px ${CAPS}`;
  engrave(ctx, 'N O .', 256, 66);
  ctx.font = `500 112px ${DISPLAY}`;
  engrave(ctx, String(n).padStart(3, '0'), 256, 146);
  const tex = toTexture(c, true, false);
  tex.anisotropy = 4;
  return tex;
}

/** Small brass plates for the other members' boxes, in one atlas. */
export const ATLAS = { columns: 10, rows: 7 } as const;
export function plateAtlas(first: number) {
  const cw = 128;
  const ch = 56;
  const [c, ctx] = canvas(cw * ATLAS.columns, ch * ATLAS.rows);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = `500 34px ${DISPLAY}`;
  for (let i = 0; i < ATLAS.columns * ATLAS.rows; i += 1) {
    const x = (i % ATLAS.columns) * cw;
    const y = Math.floor(i / ATLAS.columns) * ch;
    ctx.fillStyle = brassGradient(ctx, cw, ch);
    ctx.fillRect(x, y, cw, ch);
    ctx.strokeStyle = 'rgba(50,32,12,0.6)';
    ctx.lineWidth = 3;
    ctx.strokeRect(x + 5, y + 5, cw - 10, ch - 10);
    engrave(ctx, String(first + i), x + cw / 2, y + ch / 2 + 1);
  }
  return toTexture(c, true, false);
}

/** The face of the combination dial: graduations and figures. */
export function dialFace() {
  const [c, ctx] = canvas(256, 256);
  const g = ctx.createRadialGradient(118, 110, 10, 128, 128, 128);
  g.addColorStop(0, '#f3dda8');
  g.addColorStop(0.7, '#c49b5c');
  g.addColorStop(1, '#7b5a2c');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 256, 256);
  ctx.translate(128, 128);
  for (let i = 0; i < 60; i += 1) {
    const major = i % 5 === 0;
    ctx.save();
    ctx.rotate((i / 60) * Math.PI * 2);
    ctx.fillStyle = '#2a1c0d';
    ctx.fillRect(-1.5, -122, 3, major ? 18 : 9);
    ctx.restore();
  }
  ctx.font = `600 18px ${CAPS}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#2a1c0d';
  for (let i = 0; i < 12; i += 1) {
    const a = (i / 12) * Math.PI * 2;
    ctx.fillText(String(i * 5), Math.sin(a) * 88, -Math.cos(a) * 88);
  }
  ctx.beginPath();
  ctx.arc(0, 0, 40, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(40,25,10,0.35)';
  ctx.fill();
  return toTexture(c, true, false);
}

/** Oxblood leather lining: pebbled grain. */
export function leatherTexture() {
  const n = makeNoise(41, 64);
  const fine = makeNoise(43, 128);
  const tex = toTexture(
    paint(256, 256, (x, y) => {
      const pebble = Math.abs(n(x / 5, y / 5) - 0.5) * 2;
      const v = 0.75 + pebble * 0.25 + (fine(x / 2, y / 2) - 0.5) * 0.12;
      return [70 * v, 20 * v, 22 * v];
    }),
    true,
  );
  tex.repeat.set(3, 3);
  return tex;
}

/** The envelope inside a compartment: cream laid paper and a wax seal. */
export function envelopeTexture() {
  const W = 640;
  const H = 420;
  const n = makeNoise(51, 128);
  const base = paint(W, H, (x, y) => {
    const laid = 0.985 + 0.015 * Math.sin(y * 1.9);
    const v = (0.92 + n(x / 9, y / 9) * 0.08) * laid;
    return [244 * v, 234 * v, 214 * v];
  });
  const ctx = base.getContext('2d')!;
  // The flap.
  ctx.strokeStyle = 'rgba(120,96,60,0.35)';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(10, 14);
  ctx.lineTo(W / 2, H * 0.58);
  ctx.lineTo(W - 10, 14);
  ctx.stroke();
  // The seal.
  const sx = W / 2;
  const sy = H * 0.58;
  const seal = ctx.createRadialGradient(sx - 12, sy - 14, 4, sx, sy, 62);
  seal.addColorStop(0, '#b0303a');
  seal.addColorStop(0.7, '#7d1620');
  seal.addColorStop(1, '#4f0b12');
  ctx.fillStyle = seal;
  ctx.beginPath();
  for (let i = 0; i <= 28; i += 1) {
    const a = (i / 28) * Math.PI * 2;
    const r = 56 + (i % 2 ? 4 : -2);
    ctx.lineTo(sx + Math.cos(a) * r, sy + Math.sin(a) * r);
  }
  ctx.fill();
  ctx.fillStyle = 'rgba(40,4,8,0.55)';
  ctx.font = `500 54px ${DISPLAY}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('30', sx, sy + 3);
  ctx.fillStyle = 'rgba(80,60,35,0.75)';
  ctx.font = `600 20px ${CAPS}`;
  ctx.fillText('T H E   T H I R T Y   C L U B', W / 2, H - 46);
  const tex = toTexture(base, true, false);
  tex.anisotropy = 4;
  return tex;
}

/** UV rectangle of one plate in the atlas, for baking into merged geometry. */
export function atlasRect(index: number) {
  const i = index % (ATLAS.columns * ATLAS.rows);
  const u0 = (i % ATLAS.columns) / ATLAS.columns;
  const v1 = 1 - Math.floor(i / ATLAS.columns) / ATLAS.rows;
  return {
    u0,
    u1: u0 + 1 / ATLAS.columns,
    v0: v1 - 1 / ATLAS.rows,
    v1,
  };
}

export function setPlaneUv(
  geometry: THREE.PlaneGeometry,
  rect: { u0: number; u1: number; v0: number; v1: number },
) {
  const uv = geometry.attributes.uv as THREE.BufferAttribute;
  // PlaneGeometry vertex order: top-left, top-right, bottom-left, bottom-right.
  uv.setXY(0, rect.u0, rect.v1);
  uv.setXY(1, rect.u1, rect.v1);
  uv.setXY(2, rect.u0, rect.v0);
  uv.setXY(3, rect.u1, rect.v0);
  uv.needsUpdate = true;
}
