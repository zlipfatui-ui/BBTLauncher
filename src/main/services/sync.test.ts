import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { syncProject } from './sync';
import type { LauncherManifest } from '../../shared/types';

function sha256(input: string): string {
  return createHash('sha256').update(input).digest('hex').toUpperCase();
}

function makeManifest(body: string): LauncherManifest {
  return {
    schemaVersion: 1,
    generatedAt: '2026-07-05T00:00:00.000Z',
    projects: [
      {
        id: 'northvale',
        title: 'Northvale',
        statusText: 'UP TO DATE',
        minecraft: {
          version: '1.20.1',
          loader: 'forge',
          loaderVersion: '47.4.20',
          javaMajor: 17
        },
        artwork: {
          cover: '/assets/images/logos/ss0-cover.jpg',
          gallery: []
        },
        files: [
          {
            path: 'mods/test.jar',
            url: '/files/test.jar',
            sha256: sha256(body),
            size: Buffer.byteLength(body),
            required: true
          }
        ]
      }
    ]
  };
}

function makeTwoFileManifest(cleanBody: string, dirtyBody: string): LauncherManifest {
  return {
    schemaVersion: 1,
    generatedAt: '2026-07-05T00:00:00.000Z',
    projects: [
      {
        id: 'northvale',
        title: 'Northvale',
        statusText: 'UP TO DATE',
        minecraft: {
          version: '1.20.1',
          loader: 'forge',
          loaderVersion: '47.4.20',
          javaMajor: 17
        },
        artwork: {
          cover: '/assets/images/logos/ss0-cover.jpg',
          gallery: []
        },
        files: [
          {
            path: 'mods/clean.jar',
            url: '/files/clean.jar',
            sha256: sha256(cleanBody),
            size: Buffer.byteLength(cleanBody),
            required: true
          },
          {
            path: 'mods/dirty.jar',
            url: '/files/dirty.jar',
            sha256: sha256(dirtyBody),
            size: Buffer.byteLength(dirtyBody),
            required: true
          }
        ]
      }
    ]
  };
}

describe('project sync', () => {
  it('downloads changed files, verifies hash, and skips clean files on the next run', async () => {
    const root = await mkdtemp(join(tmpdir(), 'bbt-sync-'));
    const body = 'northvale mod bytes';
    let fetchCount = 0;

    try {
      const first = await syncProject({
        rootDir: root,
        projectId: 'northvale',
        manifest: makeManifest(body),
        baseUrl: 'https://bbt.example',
        fetchImpl: async () => {
          fetchCount += 1;
          return new Response(body);
        }
      });

      expect(first.downloaded).toBe(1);
      expect(first.skipped).toBe(0);
      await expect(readFile(join(root, 'projects', 'northvale', 'mods', 'test.jar'), 'utf8')).resolves.toBe(body);

      const second = await syncProject({
        rootDir: root,
        projectId: 'northvale',
        manifest: makeManifest(body),
        baseUrl: 'https://bbt.example',
        fetchImpl: async () => {
          fetchCount += 1;
          return new Response(body);
        }
      });

      expect(second.downloaded).toBe(0);
      expect(second.skipped).toBe(1);
      expect(fetchCount).toBe(1);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('blocks a bad SHA256 download and leaves the existing file untouched', async () => {
    const root = await mkdtemp(join(tmpdir(), 'bbt-sync-'));
    try {
      const existingPath = join(root, 'projects', 'northvale', 'mods');
      await import('node:fs/promises').then(({ mkdir }) => mkdir(existingPath, { recursive: true }));
      await writeFile(join(existingPath, 'test.jar'), 'old');

      const manifest = makeManifest('expected');

      await expect(
        syncProject({
          rootDir: root,
          projectId: 'northvale',
          manifest,
          baseUrl: 'https://bbt.example',
          fetchImpl: async () => new Response('wrong')
        })
      ).rejects.toThrow(/sha256/i);

      await expect(readFile(join(existingPath, 'test.jar'), 'utf8')).resolves.toBe('old');
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('replaces a local file when the manifest hash changes', async () => {
    const root = await mkdtemp(join(tmpdir(), 'bbt-sync-'));
    const projectMods = join(root, 'projects', 'northvale', 'mods');

    try {
      await mkdir(projectMods, { recursive: true });
      await writeFile(join(projectMods, 'test.jar'), 'old bytes');

      const manifest = makeManifest('new bytes');
      const result = await syncProject({
        rootDir: root,
        projectId: 'northvale',
        manifest,
        baseUrl: 'https://bbt.example',
        fetchImpl: async () => new Response('new bytes')
      });

      expect(result.downloaded).toBe(1);
      await expect(readFile(join(projectMods, 'test.jar'), 'utf8')).resolves.toBe('new bytes');
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('reports progress against files that actually need downloading', async () => {
    const root = await mkdtemp(join(tmpdir(), 'bbt-sync-'));
    const projectMods = join(root, 'projects', 'northvale', 'mods');
    const progress: Array<{ file: string; downloadedBytes: number; totalBytes: number }> = [];

    try {
      await mkdir(projectMods, { recursive: true });
      await writeFile(join(projectMods, 'clean.jar'), 'already clean');

      await syncProject({
        rootDir: root,
        projectId: 'northvale',
        manifest: makeTwoFileManifest('already clean', 'new dirty bytes'),
        baseUrl: 'https://bbt.example',
        fetchImpl: async () => new Response('new dirty bytes'),
        onProgress: (event) => progress.push(event)
      });

      expect(progress).toEqual([
        {
          file: 'mods/dirty.jar',
          downloadedBytes: Buffer.byteLength('new dirty bytes'),
          totalBytes: Buffer.byteLength('new dirty bytes')
        }
      ]);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('removes stale launcher-owned files after sync without touching saves', async () => {
    const root = await mkdtemp(join(tmpdir(), 'bbt-sync-'));
    const projectRoot = join(root, 'projects', 'northvale');
    const body = 'northvale mod bytes';

    try {
      await mkdir(join(projectRoot, 'mods'), { recursive: true });
      await mkdir(join(projectRoot, 'saves', 'world'), { recursive: true });
      await writeFile(join(projectRoot, 'mods', 'test.jar'), body);
      await writeFile(join(projectRoot, 'mods', 'old.jar'), 'old');
      await writeFile(join(projectRoot, 'saves', 'world', 'level.dat'), 'save data');

      const result = await syncProject({
        rootDir: root,
        projectId: 'northvale',
        manifest: makeManifest(body),
        baseUrl: 'https://bbt.example',
        fetchImpl: async () => {
          throw new Error('clean file should not be downloaded');
        }
      });

      expect(result.downloaded).toBe(0);
      expect(result.skipped).toBe(1);
      await expect(readFile(join(projectRoot, 'mods', 'test.jar'), 'utf8')).resolves.toBe(body);
      await expect(readFile(join(projectRoot, 'mods', 'old.jar'), 'utf8')).rejects.toThrow();
      await expect(readFile(join(projectRoot, 'saves', 'world', 'level.dat'), 'utf8')).resolves.toBe('save data');
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
