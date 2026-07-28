import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ensureProjectContentDirectory } from './project-content';

describe('project content roots', () => {
  it('isolates SaiNam content under its own project directory', async () => {
    const root = await mkdtemp(join(tmpdir(), 'bbt-project-content-'));
    try {
      await expect(
        ensureProjectContentDirectory(root, 'sainam', 'mods')
      ).resolves.toBe(resolve(root, 'projects', 'sainam', 'mods'));
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('rejects content roots for unknown projects', async () => {
    const root = await mkdtemp(join(tmpdir(), 'bbt-project-content-'));
    try {
      await expect(
        ensureProjectContentDirectory(root, 'unknown', 'mods')
      ).rejects.toThrow(/not supported/i);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
