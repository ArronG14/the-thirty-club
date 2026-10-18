/**
 * A small QR Code encoder (ISO/IEC 18004): byte mode, error correction
 * level M, versions 1–10 (up to 213 bytes). Enough for an NFC test URL, so
 * the office needs no QR dependency. Verified by a round-trip decode test.
 */

const ECC_PER_BLOCK_M = [0, 10, 16, 26, 18, 24, 16, 18, 22, 22, 26];
const BLOCKS_M = [0, 1, 1, 1, 2, 2, 4, 4, 4, 5, 5];
const MAX_VERSION = 10;

export interface QrMatrix {
  size: number;
  version: number;
  mask: number;
  /** modules[y][x]: true is dark. */
  modules: boolean[][];
}

export function rawDataModules(version: number): number {
  let result = (16 * version + 128) * version + 64;
  if (version >= 2) {
    const align = Math.floor(version / 7) + 2;
    result -= (25 * align - 10) * align - 55;
    if (version >= 7) result -= 36;
  }
  return result;
}

export function dataCapacity(version: number): number {
  return (
    Math.floor(rawDataModules(version) / 8) -
    ECC_PER_BLOCK_M[version]! * BLOCKS_M[version]!
  );
}

export function alignmentPositions(version: number): number[] {
  if (version === 1) return [];
  const count = Math.floor(version / 7) + 2;
  const size = version * 4 + 17;
  const step = Math.ceil((version * 4 + 4) / (count * 2 - 2)) * 2;
  const result = [6];
  for (let pos = size - 7; result.length < count; pos -= step)
    result.splice(1, 0, pos);
  return result;
}

/* GF(256) with the QR polynomial x^8 + x^4 + x^3 + x^2 + 1. */
function gfMul(x: number, y: number): number {
  let z = 0;
  for (let i = 7; i >= 0; i -= 1) {
    z = (z << 1) ^ ((z >>> 7) * 0x11d);
    z ^= ((y >>> i) & 1) * x;
  }
  return z & 0xff;
}

export function rsDivisor(degree: number): number[] {
  const result = new Array<number>(degree).fill(0);
  result[degree - 1] = 1;
  let root = 1;
  for (let i = 0; i < degree; i += 1) {
    for (let j = 0; j < degree; j += 1) {
      result[j] = gfMul(result[j]!, root);
      if (j + 1 < degree) result[j] = result[j]! ^ result[j + 1]!;
    }
    root = gfMul(root, 0x02);
  }
  return result;
}

export function rsRemainder(
  data: readonly number[],
  divisor: readonly number[],
) {
  const result = new Array<number>(divisor.length).fill(0);
  for (const b of data) {
    const factor = b ^ result.shift()!;
    result.push(0);
    divisor.forEach(
      (coef, i) => (result[i] = result[i]! ^ gfMul(coef, factor)),
    );
  }
  return result;
}

function formatBits(mask: number): number {
  const data = (0 << 3) | mask; // level M = 00
  let rem = data;
  for (let i = 0; i < 10; i += 1) rem = (rem << 1) ^ ((rem >>> 9) * 0x537);
  return ((data << 10) | rem) ^ 0x5412;
}

function versionBits(version: number): number {
  let rem = version;
  for (let i = 0; i < 12; i += 1) rem = (rem << 1) ^ ((rem >>> 11) * 0x1f25);
  return (version << 12) | rem;
}

export const MASKS: ((x: number, y: number) => boolean)[] = [
  (x, y) => (x + y) % 2 === 0,
  (_x, y) => y % 2 === 0,
  (x) => x % 3 === 0,
  (x, y) => (x + y) % 3 === 0,
  (x, y) => (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0,
  (x, y) => ((x * y) % 2) + ((x * y) % 3) === 0,
  (x, y) => (((x * y) % 2) + ((x * y) % 3)) % 2 === 0,
  (x, y) => (((x + y) % 2) + ((x * y) % 3)) % 2 === 0,
];

/** Data and error-correction codewords, interleaved as the symbol stores them. */
export function codewords(bytes: readonly number[], version: number): number[] {
  const capacity = dataCapacity(version);
  const bits: number[] = [];
  const put = (value: number, length: number) => {
    for (let i = length - 1; i >= 0; i -= 1) bits.push((value >>> i) & 1);
  };
  put(0b0100, 4);
  put(bytes.length, version <= 9 ? 8 : 16);
  bytes.forEach((b) => put(b, 8));
  put(0, Math.min(4, capacity * 8 - bits.length));
  put(0, (8 - (bits.length % 8)) % 8);
  const data: number[] = [];
  for (let i = 0; i < bits.length; i += 8)
    data.push(bits.slice(i, i + 8).reduce((a, b) => (a << 1) | b, 0));
  for (let pad = 0xec; data.length < capacity; pad ^= 0xec ^ 0x11)
    data.push(pad);

  const blocks = BLOCKS_M[version]!;
  const eccLen = ECC_PER_BLOCK_M[version]!;
  const raw = Math.floor(rawDataModules(version) / 8);
  const shortBlocks = blocks - (raw % blocks);
  const shortLen = Math.floor(raw / blocks);
  const divisor = rsDivisor(eccLen);
  const split: number[][] = [];
  for (let i = 0, k = 0; i < blocks; i += 1) {
    const len = shortLen - eccLen + (i < shortBlocks ? 0 : 1);
    const dat = data.slice(k, k + len);
    k += len;
    const ecc = rsRemainder(dat, divisor);
    if (i < shortBlocks) dat.push(-1);
    split.push([...dat, ...ecc]);
  }
  const out: number[] = [];
  for (let i = 0; i < split[0]!.length; i += 1)
    for (const block of split) if (block[i] !== -1) out.push(block[i]!);
  return out;
}

function functionModules(version: number) {
  const size = version * 4 + 17;
  const dark = Array.from({ length: size }, () =>
    new Array<boolean>(size).fill(false),
  );
  const fixed = Array.from({ length: size }, () =>
    new Array<boolean>(size).fill(false),
  );
  const set = (x: number, y: number, on: boolean) => {
    if (x < 0 || y < 0 || x >= size || y >= size) return;
    dark[y]![x] = on;
    fixed[y]![x] = true;
  };
  for (let i = 0; i < size; i += 1) {
    set(6, i, i % 2 === 0);
    set(i, 6, i % 2 === 0);
  }
  for (const [cx, cy] of [
    [3, 3],
    [size - 4, 3],
    [3, size - 4],
  ] as const)
    for (let dy = -4; dy <= 4; dy += 1)
      for (let dx = -4; dx <= 4; dx += 1) {
        const d = Math.max(Math.abs(dx), Math.abs(dy));
        set(cx + dx, cy + dy, d !== 2 && d !== 4);
      }
  const align = alignmentPositions(version);
  align.forEach((ay, i) =>
    align.forEach((ax, j) => {
      if (
        (i === 0 && j === 0) ||
        (i === 0 && j === align.length - 1) ||
        (i === align.length - 1 && j === 0)
      )
        return;
      for (let dy = -2; dy <= 2; dy += 1)
        for (let dx = -2; dx <= 2; dx += 1)
          set(ax + dx, ay + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1);
    }),
  );
  // Reserve format areas (drawn per mask) and the dark module.
  for (let i = 0; i < 9; i += 1) {
    set(8, i, false);
    set(i, 8, false);
  }
  for (let i = 0; i < 8; i += 1) {
    set(size - 1 - i, 8, false);
    set(8, size - 1 - i, false);
  }
  set(8, size - 8, true);
  if (version >= 7) {
    const bits = versionBits(version);
    for (let i = 0; i < 18; i += 1) {
      const on = ((bits >>> i) & 1) === 1;
      const a = size - 11 + (i % 3);
      const b = Math.floor(i / 3);
      set(a, b, on);
      set(b, a, on);
    }
  }
  return { size, dark, fixed };
}

/** Coordinates of data modules in placement order. */
export function zigzag(size: number, fixed: boolean[][]): [number, number][] {
  const order: [number, number][] = [];
  for (let right = size - 1; right >= 1; right -= 2) {
    if (right === 6) right = 5;
    for (let vert = 0; vert < size; vert += 1)
      for (let j = 0; j < 2; j += 1) {
        const x = right - j;
        const upward = ((right + 1) & 2) === 0;
        const y = upward ? size - 1 - vert : vert;
        if (!fixed[y]![x]) order.push([x, y]);
      }
  }
  return order;
}

export function drawFormat(dark: boolean[][], size: number, mask: number) {
  const bits = formatBits(mask);
  const bit = (i: number) => ((bits >>> i) & 1) === 1;
  for (let i = 0; i <= 5; i += 1) dark[i]![8] = bit(i);
  dark[7]![8] = bit(6);
  dark[8]![8] = bit(7);
  dark[8]![7] = bit(8);
  for (let i = 9; i < 15; i += 1) dark[8]![14 - i] = bit(i);
  for (let i = 0; i < 8; i += 1) dark[8]![size - 1 - i] = bit(i);
  for (let i = 8; i < 15; i += 1) dark[size - 15 + i]![8] = bit(i);
}

function penalty(m: boolean[][]): number {
  const size = m.length;
  let score = 0;
  for (let pass = 0; pass < 2; pass += 1)
    for (let a = 0; a < size; a += 1) {
      let run = 1;
      for (let b = 1; b < size; b += 1) {
        const cur = pass ? m[b]![a] : m[a]![b];
        const prev = pass ? m[b - 1]![a] : m[a]![b - 1];
        if (cur === prev) run += 1;
        else {
          if (run >= 5) score += run - 2;
          run = 1;
        }
      }
      if (run >= 5) score += run - 2;
    }
  for (let y = 0; y < size - 1; y += 1)
    for (let x = 0; x < size - 1; x += 1) {
      const c = m[y]![x];
      if (c === m[y]![x + 1] && c === m[y + 1]![x] && c === m[y + 1]![x + 1])
        score += 3;
    }
  const darkCount = m.flat().filter(Boolean).length;
  const total = size * size;
  score += Math.floor(Math.abs(darkCount * 20 - total * 10) / total) * 10;
  return score;
}

export function encodeQr(text: string): QrMatrix {
  const bytes = [...new TextEncoder().encode(text)];
  let version = 1;
  while (
    version <= MAX_VERSION &&
    dataCapacity(version) * 8 < 4 + (version <= 9 ? 8 : 16) + bytes.length * 8
  )
    version += 1;
  if (version > MAX_VERSION) throw new Error('Too long for a QR code here.');
  const words = codewords(bytes, version);
  const { size, dark, fixed } = functionModules(version);
  const order = zigzag(size, fixed);
  let best: QrMatrix | null = null;
  let bestScore = Infinity;
  for (let mask = 0; mask < 8; mask += 1) {
    const m = dark.map((row) => [...row]);
    order.forEach(([x, y], i) => {
      const bit =
        i < words.length * 8
          ? ((words[i >>> 3]! >>> (7 - (i & 7))) & 1) === 1
          : false;
      m[y]![x] = bit !== MASKS[mask]!(x, y);
    });
    drawFormat(m, size, mask);
    const score = penalty(m);
    if (score < bestScore) {
      bestScore = score;
      best = { size, version, mask, modules: m };
    }
  }
  return best!;
}

/** An SVG path (one unit per module, quiet zone of 4). */
export function qrPath(qr: QrMatrix): string {
  let d = '';
  qr.modules.forEach((row, y) =>
    row.forEach((on, x) => {
      if (on) d += `M${x + 4} ${y + 4}h1v1h-1z`;
    }),
  );
  return d;
}

/** For tests: everything needed to read a symbol back. */
export const internals = { functionModules, formatBits };
