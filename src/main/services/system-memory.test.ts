import { describe, expect, it } from 'vitest';
import { readSystemMemoryInfo } from './system-memory';
import { clampMemoryMb, getMemoryRange } from '../../shared/memory';

describe('hardware memory policy', () => {
  it.each([
    [4096, 4096, 2048], [8192, 8192, 4096], [16384, 16384, 8192],
    [32768, 32768, 8192], [65536, 65536, 8192], [8091, 8064, 4032]
  ])('uses all %i MB of installed RAM without a reserve or fixed cap', (total, max, defaultMb) => {
    const info = readSystemMemoryInfo(() => total * 1024 * 1024);
    expect(info).toEqual({ totalMb: total, maxMb: max });
    expect(getMemoryRange(info)).toEqual({ minMb: 2048, maxMb: max, stepMb: 64, defaultMb });
    expect(clampMemoryMb(999999, info)).toBe(max);
  });

  it('preserves a valid legacy value without rounding it and extends its lower range', () => {
    const info = { totalMb: 8192, maxMb: 8192 };
    expect(getMemoryRange(info, 1537).minMb).toBe(1537);
    expect(clampMemoryMb(1537, info, 1537)).toBe(1537);
    expect(clampMemoryMb(6145, info, 6145)).toBe(6145);
    expect(clampMemoryMb(1024, info)).toBe(2048);
  });

  it.each([0, -1, NaN, Infinity, 63 * 1024 * 1024])('reports invalid hardware readings (%s) explicitly', (bytes) => {
    expect(() => readSystemMemoryInfo(() => bytes)).toThrow(/memory/i);
  });

  it('reports unavailable hardware without an invented limit', () => {
    expect(() => readSystemMemoryInfo(() => { throw new Error('unavailable'); })).toThrow(/memory/i);
  });
});
