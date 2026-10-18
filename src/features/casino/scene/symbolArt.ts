/**
 * The slot symbols as vector art on a 100 × 100 grid. One description feeds
 * both the reel textures (drawn on a canvas) and the interface (inline SVG),
 * so a symbol is identical on the machine, in the paytable and in the result.
 * No emoji anywhere.
 */
import type { SlotSymbol } from '../domain/slots';

export interface ArtLayer {
  /** SVG path data. */
  d?: string;
  circle?: readonly [cx: number, cy: number, r: number];
  text?: string;
  fill?: string;
  stroke?: string;
  width?: number;
  /** Degrees about the centre (50, 50). */
  rotate?: number;
}

const GOLD = '#d9b469';
const GOLD_HI = '#f6e3a8';
const GOLD_LO = '#7a5a22';
const WINE = '#4a1424';
const INK = '#1a0d0a';

const ticks: ArtLayer[] = Array.from({ length: 8 }, (_, i) => ({
  d: 'M50 12 V19',
  stroke: GOLD_HI,
  width: 2.4,
  rotate: i * 45,
}));
const petals: ArtLayer[] = Array.from({ length: 5 }, (_, i) => ({
  d: 'M50 52 C35 46 33 27 50 17 C67 27 65 46 50 52 Z',
  fill: i % 2 ? '#a3122d' : '#b8173a',
  stroke: '#5e0a1f',
  width: 1.8,
  rotate: i * 72,
}));

export const SYMBOL_ART: Record<SlotSymbol, readonly ArtLayer[]> = {
  diamond: [
    {
      d: 'M18 36 L33 14 H67 L82 36 L50 88 Z',
      fill: '#bfe3ff',
      stroke: GOLD_LO,
      width: 3,
    },
    { d: 'M33 14 H50 L42 36 H18 Z', fill: 'rgba(255,255,255,0.6)' },
    {
      d: 'M18 36 H82 M33 14 L42 36 L50 14 L58 36 L67 14 M42 36 L50 88 L58 36',
      stroke: '#6f9cc4',
      width: 1.8,
    },
  ],
  crown: [
    {
      d: 'M16 72 L9 30 L32 50 L50 18 L68 50 L91 30 L84 72 Z',
      fill: GOLD,
      stroke: GOLD_LO,
      width: 3,
    },
    { d: 'M16 72 H84 V86 H16 Z', fill: GOLD_HI, stroke: GOLD_LO, width: 3 },
    { circle: [9, 30, 5], fill: '#b8173a', stroke: GOLD_LO, width: 2 },
    { circle: [50, 18, 5.5], fill: '#b8173a', stroke: GOLD_LO, width: 2 },
    { circle: [91, 30, 5], fill: '#b8173a', stroke: GOLD_LO, width: 2 },
    { circle: [50, 62, 5.5], fill: '#0f7a44', stroke: GOLD_LO, width: 2 },
    { circle: [30, 62, 3.5], fill: '#bfe3ff', stroke: GOLD_LO, width: 1.6 },
    { circle: [70, 62, 3.5], fill: '#bfe3ff', stroke: GOLD_LO, width: 1.6 },
  ],
  key: [
    { circle: [50, 27, 15], stroke: GOLD, width: 9 },
    { circle: [50, 27, 15], stroke: GOLD_LO, width: 1.4 },
    { d: 'M41 44 H59 V52 H41 Z', fill: GOLD_HI, stroke: GOLD_LO, width: 2 },
    { d: 'M46 52 H54 V88 H46 Z', fill: GOLD, stroke: GOLD_LO, width: 2.2 },
    {
      d: 'M54 68 H67 V76 H54 Z M54 80 H63 V88 H54 Z',
      fill: GOLD,
      stroke: GOLD_LO,
      width: 2,
    },
  ],
  champagne: [
    {
      d: 'M43 8 H57 V32 C57 43 69 48 69 62 V87 C69 90 67 92 64 92 H36 C33 92 31 90 31 87 V62 C31 48 43 43 43 32 Z',
      fill: '#1d3a2c',
      stroke: GOLD_LO,
      width: 2.4,
    },
    { d: 'M43 8 H57 V27 H43 Z', fill: GOLD, stroke: GOLD_LO, width: 2 },
    { d: 'M35 62 H65 V82 H35 Z', fill: '#f1e6cf', stroke: GOLD_LO, width: 1.6 },
    {
      d: 'M50 66 L52 71 L57 71 L53 74 L55 79 L50 76 L45 79 L47 74 L43 71 L48 71 Z',
      fill: '#b8173a',
    },
    { d: 'M38 56 V86', stroke: 'rgba(255,255,255,0.35)', width: 3 },
    { circle: [77, 30, 3], stroke: GOLD_HI, width: 1.6 },
    { circle: [83, 46, 2], stroke: GOLD_HI, width: 1.4 },
    { circle: [22, 38, 2.6], stroke: GOLD_HI, width: 1.5 },
  ],
  rose: [
    ...petals,
    { circle: [50, 50, 10], fill: '#d92a52', stroke: '#5e0a1f', width: 1.8 },
    { d: 'M45 50 A5 5 0 1 1 52 55', stroke: '#5e0a1f', width: 1.8 },
  ],
  emblem: [
    { circle: [50, 50, 40], fill: WINE, stroke: GOLD, width: 4 },
    { circle: [50, 50, 32], stroke: GOLD_HI, width: 1.4 },
    ...ticks,
    {
      d: 'M50 22 L56 44 L78 50 L56 56 L50 78 L44 56 L22 50 L44 44 Z',
      fill: GOLD,
      stroke: GOLD_LO,
      width: 1.6,
    },
    { circle: [50, 50, 4], fill: INK },
  ],
  thirty: [
    { circle: [50, 50, 40], fill: INK, stroke: GOLD, width: 4 },
    { circle: [50, 50, 33], stroke: GOLD_LO, width: 1.4 },
    { text: '30', fill: GOLD_HI },
  ],
};

export const DISPLAY_FONT = '"Bodoni Moda", "Bodoni 72", Didot, Georgia, serif';

/** Draws a symbol centred at (0, 0), `size` px across, onto a canvas. */
export function drawSymbol(
  ctx: CanvasRenderingContext2D,
  symbol: SlotSymbol,
  size: number,
) {
  const k = size / 100;
  ctx.save();
  ctx.scale(k, k);
  ctx.translate(-50, -50);
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  for (const layer of SYMBOL_ART[symbol]) {
    ctx.save();
    if (layer.rotate) {
      ctx.translate(50, 50);
      ctx.rotate((layer.rotate * Math.PI) / 180);
      ctx.translate(-50, -50);
    }
    if (layer.text) {
      ctx.font = `600 44px ${DISPLAY_FONT}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = layer.fill ?? GOLD;
      ctx.fillText(layer.text, 50, 53);
      ctx.restore();
      continue;
    }
    const path = new Path2D();
    if (layer.d) path.addPath(new Path2D(layer.d));
    if (layer.circle) {
      const [cx, cy, r] = layer.circle;
      path.moveTo(cx + r, cy);
      path.arc(cx, cy, r, 0, Math.PI * 2);
    }
    if (layer.fill) {
      ctx.fillStyle = layer.fill;
      ctx.fill(path);
    }
    if (layer.stroke) {
      ctx.strokeStyle = layer.stroke;
      ctx.lineWidth = layer.width ?? 2;
      ctx.stroke(path);
    }
    ctx.restore();
  }
  ctx.restore();
}
