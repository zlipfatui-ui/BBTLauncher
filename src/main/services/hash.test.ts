import { mkdtemp, rm, utimes, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { afterEach, describe, expect, it } from 'vitest';
import { clearHashCache, sha256File } from './hash';

const expected = (text: string) => createHash('sha256').update(text).digest('hex').toUpperCase();

describe('sha256File', () => {
  afterEach(() => clearHashCache());

  it('hashes files and re-hashes only when size or mtime changes', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'bbt-hash-'));
    const file = join(dir, 'mod.jar');
    try {
      await writeFile(file, 'aaaa');
      await utimes(file, 1000, 1000);
      expect(await sha256File(file)).toBe(expected('aaaa'));

      // Same size and mtime: served from cache (proves no re-read).
      await writeFile(file, 'bbbb');
      await utimes(file, 1000, 1000);
      expect(await sha256File(file)).toBe(expected('aaaa'));

      // Any real edit moves mtime and is picked up.
      await utimes(file, 2000, 2000);
      expect(await sha256File(file)).toBe(expected('bbbb'));

      await writeFile(file, 'longer content');
      expect(await sha256File(file)).toBe(expected('longer content'));
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('streams large files to the same digest', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'bbt-hash-'));
    const file = join(dir, 'big.bin');
    const content = 'x'.repeat(3 * 1024 * 1024 + 7);
    try {
      await writeFile(file, content);
      expect(await sha256File(file)).toBe(expected(content));
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
