import { resolve, sep } from 'node:path';
import { posix } from 'node:path';

export function normalizeProjectFilePath(value: string): string {
  const normalized = posix.normalize(String(value).replaceAll('\\', '/'));
  if (
    !normalized ||
    normalized === '.' ||
    normalized === '..' ||
    normalized.startsWith('../') ||
    normalized.startsWith('/') ||
    /^[a-zA-Z]:/.test(value)
  ) {
    throw new Error(`Unsafe project file path: ${value}`);
  }

  return normalized;
}

export function assertInsideDirectory(rootDir: string, targetPath: string): string {
  const root = resolve(rootDir);
  const target = resolve(targetPath);
  const relative = target.slice(root.length);
  if (!target.startsWith(root) || (relative && !relative.startsWith(sep))) {
    throw new Error(`Path escapes launcher directory: ${targetPath}`);
  }

  return target;
}
