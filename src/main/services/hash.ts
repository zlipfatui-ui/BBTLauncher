import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';

export function sha256Buffer(buffer: Buffer | Uint8Array): string {
  return createHash('sha256').update(buffer).digest('hex').toUpperCase();
}

export async function sha256File(filePath: string): Promise<string> {
  return sha256Buffer(await readFile(filePath));
}
