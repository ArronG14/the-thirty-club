/**
 * Textures drawn at load for the Members' Lounge: the parquet is cut from
 * the scanned walnut; marble, rug, silk, brass inlay and lettering are
 * procedural so nothing new needs downloading.
 */
import * as THREE from 'three';
import {
  canvas,
  makeNoise,
  mulberry32,
  paint,
  toTexture,
} from '../../entrance/scene/canvasTextures';

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

function imagePixels(image: CanvasImageSource, size: number) {
  const [, ctx] = canvas(size, size);
  ctx.drawImage(image, 0, 0, size, size);
  return ctx.getImageData(0, 0, size, size).data;
}

/**
 * Point de Hongrie (chevron) parquet in walnut. One tile spans 1.2 m: four
 * 0.3 m columns of 75 mm boards meeting at 45°. Each board takes its own
 * cut of the scan and its own tone, so the floor never repeats visibly.
 */
export function parquetTexture(walnut: CanvasImageSource) {
  const SIZE = 1024;
  const SRC = 512;
  const src = imagePixels(walnut, SRC);
  const column = SIZE / 4;
  const board = 64;
  const rand = mulberry32(31);
  const tones = Array.from({ length: 4 * 64 }, () => ({
    tone: 0.72 + rand() * 0.42,
    warm: rand() * 0.12,
    du: Math.floor(rand() * SRC),
    dv: Math.floor(rand() * SRC),
  }));
  const map = paint(SIZE, SIZE, (x, y) => {
    const col = Math.floor(x / column);
    const local = x - col * column;
    const dir = col % 2 === 0 ? 1 : -1;
    const s = y + dir * (local - column / 2);
    const index = Math.floor(s / board);
    const across = s - index * board;
    const along = local * Math.SQRT2;
    const plank =
      tones[
        (((col * 64 + index) % tones.length) + tones.length) % tones.length
      ]!;
    const u = (Math.floor(across * 1.4) + plank.du) % SRC;
    const v = (Math.floor(along * 1.6) + plank.dv) % SRC;
    const i = (((v + SRC) % SRC) * SRC + ((u + SRC) % SRC)) * 4;
    // Fine dark joints along each board and at the column seams.
    const joint =
      across < 1.6 || local < 1.4 || local > column - 1.4 ? 0.35 : 1;
    const k = plank.tone * joint;
    return [
      Math.min(255, src[i]! * k * (1 + plank.warm)),
      Math.min(255, src[i + 1]! * k),
      Math.min(255, src[i + 2]! * k * (1 - plank.warm)),
    ];
  });
  return toTexture(map, true);
}

/** Nero Marquina: black stone with fine white veins. Tileable. */
export function marbleTexture() {
  const SIZE = 512;
  const a = makeNoise(5, 8);
  const b = makeNoise(9, 32);
  const c = makeNoise(17, 64);
  return toTexture(
    paint(SIZE, SIZE, (x, y) => {
      const u = (x / SIZE) * 8;
      const v = (y / SIZE) * 8;
      const warp = a(u, v) * 3 + b(u * 4, v * 4) * 0.8;
      const vein = Math.abs(Math.sin((u * 0.9 + v * 0.55 + warp) * Math.PI));
      const fine = Math.pow(1 - vein, 28) * 0.9;
      const hair =
        Math.pow(
          1 - Math.abs(Math.sin((u * 1.7 - v + warp * 1.6) * Math.PI)),
          60,
        ) * 0.5;
      const cloud = c(u * 8, v * 8) * 0.06;
      const base = 0.05 + cloud;
      const w = clamp01(base + fine + hair);
      return [255 * w, 255 * w * 0.98, 255 * w * 0.96];
    }),
    true,
  );
}

/**
 * The hearth rug: a deep claret wool field, an ink border and a restrained
 * Art Deco fan at each end, in faded gold thread rather than bright gilt.
 */
export function rugTexture() {
  const W = 768;
  const H = 1024;
  const n = makeNoise(23, 128);
  const [c, ctx] = canvas(W, H);
  const field = ctx.createImageData(W, H);
  for (let y = 0; y < H; y += 1) {
    for (let x = 0; x < W; x += 1) {
      const wool = 0.86 + n(x / 3, y / 3) * 0.2 + n(x / 40, y / 40) * 0.1;
      const i = (y * W + x) * 4;
      field.data[i] = 44 * wool;
      field.data[i + 1] = 14 * wool;
      field.data[i + 2] = 20 * wool;
      field.data[i + 3] = 255;
    }
  }
  ctx.putImageData(field, 0, 0);
  ctx.globalCompositeOperation = 'multiply';
  // Ink border with a thread line either side.
  ctx.lineWidth = 46;
  ctx.strokeStyle = '#2a1416';
  ctx.strokeRect(23, 23, W - 46, H - 46);
  ctx.globalCompositeOperation = 'source-over';
  ctx.strokeStyle = 'rgba(196,160,104,0.55)';
  ctx.lineWidth = 3;
  ctx.strokeRect(50, 50, W - 100, H - 100);
  ctx.lineWidth = 1.5;
  ctx.strokeRect(8, 8, W - 16, H - 16);
  ctx.strokeRect(62, 62, W - 124, H - 124);
  // A stepped Deco frame and fans at the top and bottom.
  ctx.strokeStyle = 'rgba(196,160,104,0.4)';
  ctx.lineWidth = 2;
  for (const [inset, alpha] of [
    [110, 0.4],
    [126, 0.25],
  ] as const) {
    ctx.strokeStyle = `rgba(196,160,104,${alpha})`;
    ctx.beginPath();
    ctx.moveTo(inset, inset + 60);
    ctx.lineTo(inset + 60, inset);
    ctx.lineTo(W - inset - 60, inset);
    ctx.lineTo(W - inset, inset + 60);
    ctx.lineTo(W - inset, H - inset - 60);
    ctx.lineTo(W - inset - 60, H - inset);
    ctx.lineTo(inset + 60, H - inset);
    ctx.lineTo(inset, H - inset - 60);
    ctx.closePath();
    ctx.stroke();
  }
  for (const [cy, flip] of [
    [150, 1],
    [H - 150, -1],
  ] as const) {
    ctx.save();
    ctx.translate(W / 2, cy);
    ctx.scale(1, flip);
    ctx.strokeStyle = 'rgba(206,170,112,0.5)';
    ctx.lineWidth = 2;
    for (let r = 40; r <= 120; r += 26) {
      ctx.beginPath();
      ctx.arc(0, 0, r, 0, Math.PI);
      ctx.stroke();
    }
    for (let k = 0; k <= 12; k += 1) {
      const a = (k / 12) * Math.PI;
      ctx.beginPath();
      ctx.moveTo(Math.cos(a) * 40, Math.sin(a) * 40);
      ctx.lineTo(Math.cos(a) * 120, Math.sin(a) * 120);
      ctx.stroke();
    }
    ctx.restore();
  }
  // Central lozenge.
  ctx.strokeStyle = 'rgba(206,170,112,0.45)';
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.moveTo(W / 2, H / 2 - 130);
  ctx.lineTo(W / 2 + 90, H / 2);
  ctx.lineTo(W / 2, H / 2 + 130);
  ctx.lineTo(W / 2 - 90, H / 2);
  ctx.closePath();
  ctx.stroke();
  // Wear: the centre is a touch lighter where the pile has been walked flat.
  const wear = ctx.createRadialGradient(W / 2, H / 2, 0, W / 2, H / 2, H / 2);
  wear.addColorStop(0, 'rgba(255,220,200,0.08)');
  wear.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = wear;
  ctx.fillRect(0, 0, W, H);
  return toTexture(c, true, false);
}

/** Silk wall covering: a faint moiré stripe that catches grazing light. */
export function silkRoughness() {
  const n = makeNoise(41, 64);
  return toTexture(
    paint(256, 256, (x, y) => {
      const stripe = Math.sin((x / 256) * Math.PI * 2 * 12) * 0.5 + 0.5;
      const moire = n(x / 16, y / 6) * 0.3;
      const v = 150 + (stripe * 0.6 + moire) * 70;
      return [v, v, v];
    }),
    false,
  );
}

/**
 * The overmantel inlay: a brass rising sun around a "30" medallion, the
 * same emblem as the entrance doors. White is brass; black is walnut.
 */
export function sunburstAlpha() {
  const W = 512;
  const H = 640;
  const [c, ctx] = canvas(W, H);
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, W, H);
  ctx.strokeStyle = '#fff';
  ctx.fillStyle = '#fff';
  const cx = W / 2;
  const cy = H * 0.58;
  ctx.lineWidth = 3;
  for (let k = 0; k <= 22; k += 1) {
    const a = Math.PI + (k / 22) * Math.PI;
    ctx.beginPath();
    ctx.moveTo(cx + Math.cos(a) * 70, cy + Math.sin(a) * 70);
    ctx.lineTo(cx + Math.cos(a) * 420, cy + Math.sin(a) * 420);
    ctx.stroke();
  }
  for (const r of [70, 86, 150, 156]) {
    ctx.beginPath();
    ctx.arc(cx, cy, r, Math.PI, Math.PI * 2);
    ctx.lineWidth = r === 86 || r === 156 ? 1.5 : 4;
    ctx.stroke();
  }
  // Frame lines and a stepped base.
  ctx.lineWidth = 5;
  ctx.strokeRect(14, 14, W - 28, H - 28);
  ctx.lineWidth = 2;
  ctx.strokeRect(28, 28, W - 56, H - 56);
  ctx.fillRect(28, cy - 2, W - 56, 4);
  ctx.fillRect(cx - 110, cy + 30, 220, 3);
  ctx.fillRect(cx - 70, cy + 48, 140, 3);
  ctx.fillRect(cx - 30, cy + 66, 60, 3);
  // Medallion.
  ctx.beginPath();
  ctx.arc(cx, cy, 60, Math.PI, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#000';
  ctx.font = '500 50px "Bodoni Moda"';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  ctx.fillText('30', cx, cy - 10);
  return toTexture(c, false, false);
}

/**
 * Engraved brass directory. Only room names already public in the brief
 * appear; nothing hints at what is inside them.
 */
export function directoryTexture(names: readonly string[]) {
  const W = 512;
  const H = 768;
  const [c, ctx] = canvas(W, H);
  ctx.fillStyle = '#b89356';
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = 'rgba(30,18,10,0.92)';
  ctx.strokeStyle = 'rgba(30,18,10,0.85)';
  ctx.lineWidth = 3;
  ctx.strokeRect(20, 20, W - 40, H - 40);
  ctx.lineWidth = 1.5;
  ctx.strokeRect(32, 32, W - 64, H - 64);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = '500 26px Jost';
  ctx.letterSpacing = '9px';
  ctx.fillText('THE THIRTY CLUB', W / 2, 92);
  ctx.font = '500 40px "Bodoni Moda"';
  ctx.letterSpacing = '2px';
  ctx.fillText('Directory', W / 2, 146);
  ctx.fillRect(W / 2 - 60, 186, 120, 2);
  ctx.font = '400 25px Jost';
  ctx.letterSpacing = '5px';
  names.forEach((name, i) => {
    const y = 250 + i * 76;
    ctx.fillText(name.toUpperCase(), W / 2, y);
    ctx.fillRect(W / 2 - 18, y + 34, 36, 1);
  });
  return toTexture(c, true, false);
}

/** Engraved plate over the screening-room doorway. */
export function plaqueTexture(text: string) {
  const [c, ctx] = canvas(512, 96);
  ctx.fillStyle = '#b89356';
  ctx.fillRect(0, 0, 512, 96);
  ctx.strokeStyle = 'rgba(30,18,10,0.8)';
  ctx.lineWidth = 2;
  ctx.strokeRect(8, 8, 496, 80);
  ctx.fillStyle = 'rgba(30,18,10,0.92)';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = '500 30px Jost';
  ctx.letterSpacing = '8px';
  ctx.fillText(text.toUpperCase(), 260, 50);
  return toTexture(c, true, false);
}

/** The screening room glimpsed through the doorway: a dim, warm corridor. */
export function corridorTexture() {
  const [c, ctx] = canvas(256, 512);
  const g = ctx.createLinearGradient(0, 0, 0, 512);
  g.addColorStop(0, '#1a0a0c');
  g.addColorStop(0.5, '#3a1418');
  g.addColorStop(1, '#120607');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 256, 512);
  const glow = ctx.createRadialGradient(128, 230, 0, 128, 230, 200);
  glow.addColorStop(0, 'rgba(255,214,160,0.9)');
  glow.addColorStop(0.35, 'rgba(220,140,90,0.35)');
  glow.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, 256, 512);
  // Far doors: a pair of padded leaves with a seam of light.
  ctx.fillStyle = 'rgba(40,10,14,0.85)';
  ctx.fillRect(70, 150, 116, 260);
  ctx.fillStyle = 'rgba(255,220,170,0.8)';
  ctx.fillRect(127, 150, 2, 260);
  ctx.strokeStyle = 'rgba(210,170,110,0.5)';
  ctx.strokeRect(70, 150, 116, 260);
  return toTexture(c, true, false);
}

/** Flickering flames: layered noise in a tapering envelope, additive. */
export function flameMaterial() {
  return new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
    uniforms: { time: { value: 0 }, strength: { value: 1 } },
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
    `,
    fragmentShader: /* glsl */ `
      uniform float time;
      uniform float strength;
      varying vec2 vUv;
      float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float noise(vec2 p) {
        vec2 i = floor(p); vec2 f = fract(p);
        vec2 u = f * f * (3.0 - 2.0 * f);
        return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x),
                   mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
      }
      float fbm(vec2 p) {
        float v = 0.0; float a = 0.5;
        for (int i = 0; i < 4; i++) { v += a * noise(p); p *= 2.03; a *= 0.5; }
        return v;
      }
      void main() {
        vec2 uv = vUv;
        float rise = time * 1.6;
        float n = fbm(vec2(uv.x * 5.0, uv.y * 3.0 - rise));
        float tongues = fbm(vec2(uv.x * 11.0 + 3.0, uv.y * 2.0 - rise * 1.4));
        float width = 0.5 - abs(uv.x - 0.5);
        float body = smoothstep(0.0, 0.35, width) * (1.0 - uv.y);
        float f = body * (n * 1.4 + tongues * 0.6) - uv.y * 0.55;
        f = smoothstep(0.08, 0.6, f);
        vec3 col = mix(vec3(0.85, 0.14, 0.02), vec3(1.0, 0.48, 0.1), smoothstep(0.1, 0.6, f));
        col = mix(col, vec3(1.0, 0.72, 0.36), smoothstep(0.7, 1.0, f));
        gl_FragColor = vec4(col * f * 0.55 * strength, f);
      }
    `,
  });
}
