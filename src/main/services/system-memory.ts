import { totalmem } from 'node:os';
import type { SystemMemoryInfo } from '../../shared/types.js';
import { AuthServiceError } from './auth.js';

export function readSystemMemoryInfo(readTotalBytes: () => number = totalmem): SystemMemoryInfo {
  try {
    const bytes = readTotalBytes();
    const totalMb = Math.floor(bytes / (1024 * 1024));
    const maxMb = Math.floor(totalMb / 64) * 64;
    if (!Number.isFinite(bytes) || maxMb < 64) throw new Error('Invalid hardware memory reading');
    return { totalMb, maxMb };
  } catch {
    throw new AuthServiceError('SYSTEM_MEMORY_UNAVAILABLE', 'System memory could not be read. Retry before changing RAM or launching Minecraft.');
  }
}
