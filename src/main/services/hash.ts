import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';

export function sha256Buffer(buffer: Buffer | Uint8Array): string {
  return createHash('sha256').update(buffer).digest('hex').toUpperCase();
}

interface CachedHash {
  size: number;
  mtimeMs: number;
  hash: string;
}

/**
 * Hashes keyed by path, invalidated by size or mtime. Project state is re-checked on startup,
 * project switches and every manifest publish; without this each check re-read ~1 GB of mods.
 */
const hashCache = new Map<string, CachedHash>();
const MAX_CACHED = 20_000;

/** Streams in 1 MB chunks so hashing a large mod never blocks the main process event loop. */
function streamSha256(filePath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = createHash('sha256');
    createReadStream(filePath, { highWaterMark: 1024 * 1024 })
      .on('data', (chunk) => hash.update(chunk))
      .on('error', reject)
      .on('end', () => resolve(hash.digest('hex').toUpperCase()));
  });
}

export async function sha256File(filePath: string): Promise<string> {
  const info = await stat(filePath);
  const cached = hashCache.get(filePath);
  if (cached && cached.size === info.size && cached.mtimeMs === info.mtimeMs) return cached.hash;

  const hash = await streamSha256(filePath);
  if (hashCache.size >= MAX_CACHED) hashCache.clear();
  hashCache.set(filePath, { size: info.size, mtimeMs: info.mtimeMs, hash });
  return hash;
}

/** Test hook. */
export function clearHashCache(): void {
  hashCache.clear();
}
