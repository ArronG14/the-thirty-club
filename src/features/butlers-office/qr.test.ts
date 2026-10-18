import { describe, expect, it } from 'vitest';
import {
  alignmentPositions,
  dataCapacity,
  encodeQr,
  internals,
  MASKS,
  rsDivisor,
  rsRemainder,
  zigzag,
} from './qr';

/** Reads a symbol back: format, mask, codewords, error correction, text. */
function decode(text: string) {
  const qr = encodeQr(text);
  const { size, modules: m } = qr;
  // First copy of the format bits, as placed by drawFormat.
  let bits = 0;
  const read = (y: number, x: number, i: number) => {
    if (m[y]![x]) bits |= 1 << i;
  };
  for (let i = 0; i <= 5; i += 1) read(i, 8, i);
  read(7, 8, 6);
  read(8, 8, 7);
  read(8, 7, 8);
  for (let i = 9; i < 15; i += 1) read(8, 14 - i, i);
  const mask = ((bits ^ 0x5412) >>> 10) & 7;
  expect(internals.formatBits(mask)).toBe(bits);
  expect(((bits ^ 0x5412) >>> 13) & 3).toBe(0); // level M
  const { fixed } = internals.functionModules(qr.version);
  const order = zigzag(size, fixed);
  const words: number[] = [];
  order.forEach(([x, y], i) => {
    const bit = m[y]![x] !== MASKS[mask]!(x, y);
    if (i % 8 === 0) words.push(0);
    words[words.length - 1] = (words[words.length - 1]! << 1) | (bit ? 1 : 0);
  });
  // Remainder bits after the last whole codeword are not data.
  return { qr, words: words.slice(0, Math.floor(order.length / 8)) };
}

describe('QR encoder', () => {
  it('matches the standard capacities for level M', () => {
    expect(dataCapacity(1)).toBe(16);
    expect(dataCapacity(4)).toBe(64);
    expect(dataCapacity(5)).toBe(86);
    expect(dataCapacity(7)).toBe(124);
    expect(dataCapacity(10)).toBe(216);
  });

  it('places alignment patterns where the standard does', () => {
    expect(alignmentPositions(1)).toEqual([]);
    expect(alignmentPositions(5)).toEqual([6, 30]);
    expect(alignmentPositions(7)).toEqual([6, 22, 38]);
    expect(alignmentPositions(10)).toEqual([6, 28, 50]);
  });

  it('produces standard format information', () => {
    expect(internals.formatBits(0)).toBe(0b101010000010010);
    expect(internals.formatBits(1)).toBe(0b101000100100101);
    expect(internals.formatBits(7)).toBe(0b100101010100000);
  });

  it('round-trips an NFC URL through format, mask, codewords and error correction', () => {
    const url =
      'https://30.ag14.co/v/Q2b9yG-x_0kL3mN8pR4sT6uV1wX5yZ7aB9cD2eF4gH6';
    const { qr, words } = decode(url);
    expect(qr.version).toBe(5);
    expect(qr.size).toBe(37);
    // Version 5-M: two blocks of 43 data + 24 ECC codewords, interleaved.
    const blocks = [0, 1].map((b) => words.filter((_, i) => i % 2 === b));
    const divisor = rsDivisor(24);
    for (const block of blocks) {
      expect(block).toHaveLength(67);
      expect(rsRemainder(block.slice(0, 43), divisor)).toEqual(block.slice(43));
    }
    const data = [...blocks[0]!.slice(0, 43), ...blocks[1]!.slice(0, 43)];
    const bits = data.flatMap((b) =>
      [7, 6, 5, 4, 3, 2, 1, 0].map((i) => (b >>> i) & 1),
    );
    const take = (from: number, n: number) =>
      bits.slice(from, from + n).reduce((a, b) => (a << 1) | b, 0);
    expect(take(0, 4)).toBe(0b0100);
    const length = take(4, 8);
    expect(length).toBe(url.length);
    const bytes = Array.from({ length }, (_, i) => take(12 + i * 8, 8));
    expect(new TextDecoder().decode(new Uint8Array(bytes))).toBe(url);
  });

  it('draws finder patterns in three corners', () => {
    const { modules: m, size } = encodeQr('https://30.ag14.co');
    for (const [x, y] of [
      [0, 0],
      [size - 7, 0],
      [0, size - 7],
    ] as const) {
      expect(m[y]![x]).toBe(true);
      expect(m[y + 1]![x + 1]).toBe(false);
      expect(m[y + 3]![x + 3]).toBe(true);
    }
  });
});
