import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { LauncherManifest } from '../../shared/types';
import { ensureProjectContentDirectory, listProjectContent } from './project-content';

function sainamManifest(): LauncherManifest {
  return {
    schemaVersion: 1,
    generatedAt: '2026-07-29T00:00:00.000Z',
    projects: [{
      id: 'sainam',
      title: 'SaiNam',
      statusText: 'UP TO DATE',
      minecraft: {
        version: '1.20.1',
        loader: 'forge',
        loaderVersion: '47.4.10',
        javaMajor: 17
      },
      artwork: { cover: '', gallery: [] },
      files: [{
        path: 'mods/managed.jar',
        url: 'https://example.invalid/managed.jar',
        sha256: 'a'.repeat(64),
        size: 7
      }]
    }]
  };
}

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

  it('shows a new-filename SaiNam mod as user content', async () => {
    const root = await mkdtemp(join(tmpdir(), 'bbt-project-content-'));
    try {
      const mods = join(root, 'projects', 'sainam', 'mods');
      await mkdir(mods, { recursive: true });
      await writeFile(join(mods, 'managed.jar'), 'managed');
      await writeFile(join(mods, 'player-extra.jar'), 'extra');

      const result = await listProjectContent({
        rootDir: root,
        projectId: 'sainam',
        kind: 'mods',
        manifest: sainamManifest()
      });

      expect(result.classificationAvailable).toBe(true);
      expect(result.entries.map((entry) => entry.name)).toEqual(['player-extra.jar']);
      expect(result.entries[0]).toMatchObject({
        source: 'user',
        canDelete: true,
        enabled: true
      });
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('hides a same-name SaiNam manifest mod from user content', async () => {
    const root = await mkdtemp(join(tmpdir(), 'bbt-project-content-'));
    try {
      const mods = join(root, 'projects', 'sainam', 'mods');
      await mkdir(mods, { recursive: true });
      await writeFile(join(mods, 'managed.jar'), 'changed');

      await expect(listProjectContent({
        rootDir: root,
        projectId: 'sainam',
        kind: 'mods',
        manifest: sainamManifest()
      })).resolves.toEqual({
        entries: [],
        classificationAvailable: true
      });
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
