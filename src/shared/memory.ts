import type { SystemMemoryInfo } from './types.js';

export function getMemoryRange(info: SystemMemoryInfo, legacyMemoryMb?: number) {
  const legacyMin = Number.isInteger(legacyMemoryMb) && legacyMemoryMb! >= 64 && legacyMemoryMb! < 2048
    ? legacyMemoryMb! : 2048;
  const minMb = Math.min(legacyMin, info.maxMb);
  return {
    minMb,
    maxMb: info.maxMb,
    stepMb: 64,
    defaultMb: Math.max(minMb, Math.min(info.maxMb, 8192, Math.floor(info.totalMb / 128) * 64))
  };
}

export function clampMemoryMb(value: number, info: SystemMemoryInfo, legacyMemoryMb?: number): number {
  const range = getMemoryRange(info, legacyMemoryMb);
  return Number.isFinite(value) && value > 0
    ? Math.min(range.maxMb, Math.max(range.minMb, Math.floor(value)))
    : range.defaultMb;
}
