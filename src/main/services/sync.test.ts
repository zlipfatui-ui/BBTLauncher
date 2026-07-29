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

function makeFileManifest(path: string, body: string, syncMode?: 'required' | 'seed'): LauncherManifest {
  const manifest = makeManifest(body);
  manifest.projects[0].files = [
    {
      path,
      url: `/files/${path}`,
      sha256: sha256(body),
      size: Buffer.byteLength(body),
      required: true,
      ...(syncMode ? { syncMode } : {})
    }
  ];
  return manifest;
}

function asSaiNam(manifest: LauncherManifest): LauncherManifest {
  const project = manifest.projects[0];
  project.id = 'sainam';
  project.title = 'SaiNam';
  project.minecraft.loaderVersion = '47.4.10';
  return manifest;
}

async function writeManagedIndex(root: string, projectId: string, files: Array<{ path: string; syncMode: 'required' | 'seed' }>) {
  const metadataDir = join(root, 'metadata', projectId);
  await mkdir(metadataDir, { recursive: true });
  await writeFile(
    join(metadataDir, 'managed-files.json'),
    `${JSON.stringify({ version: 1, files }, null, 2)}\n`
  );
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

  it('does not delete extra player mods, resourcepacks, shaderpacks, or saves', async () => {
    const root = await mkdtemp(join(tmpdir(), 'bbt-sync-'));
    const projectRoot = join(root, 'projects', 'northvale');
    const body = 'northvale mod bytes';

    try {
      await mkdir(join(projectRoot, 'mods'), { recursive: true });
      await mkdir(join(projectRoot, 'resourcepacks'), { recursive: true });
      await mkdir(join(projectRoot, 'shaderpacks'), { recursive: true });
      await mkdir(join(projectRoot, 'saves', 'world'), { recursive: true });
      await writeFile(join(projectRoot, 'mods', 'test.jar'), body);
      await writeFile(join(projectRoot, 'mods', 'player-added.jar'), 'player mod');
      await writeFile(join(projectRoot, 'resourcepacks', 'player-pack.zip'), 'player resourcepack');
      await writeFile(join(projectRoot, 'shaderpacks', 'player-shader.zip'), 'player shader');
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
      await expect(readFile(join(projectRoot, 'mods', 'player-added.jar'), 'utf8')).resolves.toBe('player mod');
      await expect(readFile(join(projectRoot, 'resourcepacks', 'player-pack.zip'), 'utf8')).resolves.toBe('player resourcepack');
      await expect(readFile(join(projectRoot, 'shaderpacks', 'player-shader.zip'), 'utf8')).resolves.toBe('player shader');
      await expect(readFile(join(projectRoot, 'saves', 'world', 'level.dat'), 'utf8')).resolves.toBe('save data');
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('removes stale required files only when they were previously launcher-managed', async () => {
    const root = await mkdtemp(join(tmpdir(), 'bbt-sync-stale-'));
    const projectRoot = join(root, 'projects', 'northvale');
    const body = 'northvale mod bytes';

    try {
      await mkdir(join(projectRoot, 'mods'), { recursive: true });
      await writeFile(join(projectRoot, 'mods', 'test.jar'), body);
      await writeFile(join(projectRoot, 'mods', 'old-required.jar'), 'old required');
      await writeManagedIndex(root, 'northvale', [
        { path: 'mods/test.jar', syncMode: 'required' },
        { path: 'mods/old-required.jar', syncMode: 'required' }
      ]);

      await syncProject({
        rootDir: root,
        projectId: 'northvale',
        manifest: makeManifest(body),
        baseUrl: 'https://bbt.example',
        fetchImpl: async () => {
          throw new Error('clean file should not be downloaded');
        }
      });

      await expect(readFile(join(projectRoot, 'mods', 'test.jar'), 'utf8')).resolves.toBe(body);
      await expect(readFile(join(projectRoot, 'mods', 'old-required.jar'), 'utf8')).rejects.toThrow();
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('does not overwrite an existing seed file with local changes', async () => {
    const root = await mkdtemp(join(tmpdir(), 'bbt-sync-seed-'));
    const projectRoot = join(root, 'projects', 'northvale');

    try {
      await mkdir(join(projectRoot, 'config'), { recursive: true });
      await writeFile(join(projectRoot, 'config', 'oculus.properties'), 'player local shader choice');

      const result = await syncProject({
        rootDir: root,
        projectId: 'northvale',
        manifest: makeFileManifest('config/oculus.properties', 'pack shader disabled', 'seed'),
        baseUrl: 'https://bbt.example',
        fetchImpl: async () => {
          throw new Error('existing seed should not be downloaded');
        }
      });

      expect(result.downloaded).toBe(0);
      expect(result.skipped).toBe(1);
      await expect(readFile(join(projectRoot, 'config', 'oculus.properties'), 'utf8')).resolves.toBe(
        'player local shader choice'
      );
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('downloads a missing seed file and records it in the managed index', async () => {
    const root = await mkdtemp(join(tmpdir(), 'bbt-sync-seed-missing-'));
    const projectRoot = join(root, 'projects', 'northvale');

    try {
      const result = await syncProject({
        rootDir: root,
        projectId: 'northvale',
        manifest: makeFileManifest('config/oculus.properties', 'pack shader disabled', 'seed'),
        baseUrl: 'https://bbt.example',
        fetchImpl: async () => new Response('pack shader disabled')
      });

      expect(result.downloaded).toBe(1);
      await expect(readFile(join(projectRoot, 'config', 'oculus.properties'), 'utf8')).resolves.toBe(
        'pack shader disabled'
      );
      await expect(readFile(join(root, 'metadata', 'northvale', 'managed-files.json'), 'utf8')).resolves.toContain(
        '"syncMode": "seed"'
      );
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('lets pack authors keep local FancyMenu changes during sync', async () => {
    const root = await mkdtemp(join(tmpdir(), 'bbt-sync-author-'));
    const projectRoot = join(root, 'projects', 'northvale');

    try {
      await mkdir(join(projectRoot, 'config', 'fancymenu'), { recursive: true });
      await writeFile(join(projectRoot, 'config', 'fancymenu', 'customization.txt'), 'local menu work');
      await writeFile(join(root, '.bbt-pack-author'), '1');

      const result = await syncProject({
        rootDir: root,
        projectId: 'northvale',
        manifest: makeFileManifest('config/fancymenu/customization.txt', 'official menu', 'required'),
        baseUrl: 'https://bbt.example',
        fetchImpl: async () => {
          throw new Error('author FancyMenu changes should not be downloaded');
        }
      });

      expect(result.downloaded).toBe(0);
      expect(result.skipped).toBe(1);
      await expect(readFile(join(projectRoot, 'config', 'fancymenu', 'customization.txt'), 'utf8')).resolves.toBe(
        'local menu work'
      );
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('does not remove old required FancyMenu index entries for pack authors', async () => {
    const root = await mkdtemp(join(tmpdir(), 'bbt-sync-author-index-'));
    const projectRoot = join(root, 'projects', 'northvale');

    try {
      await mkdir(join(projectRoot, 'config', 'fancymenu'), { recursive: true });
      await writeFile(join(projectRoot, 'config', 'fancymenu', 'customization.txt'), 'local menu work');
      await writeFile(join(root, '.bbt-pack-author'), '1');
      await writeManagedIndex(root, 'northvale', [
        { path: 'config/fancymenu/customization.txt', syncMode: 'required' }
      ]);

      const result = await syncProject({
        rootDir: root,
        projectId: 'northvale',
        manifest: makeFileManifest('config/fancymenu/customization.txt', 'official menu', 'required'),
        baseUrl: 'https://bbt.example',
        fetchImpl: async () => {
          throw new Error('author FancyMenu changes should not be downloaded');
        }
      });

      expect(result.downloaded).toBe(0);
      expect(result.skipped).toBe(1);
      await expect(readFile(join(projectRoot, 'config', 'fancymenu', 'customization.txt'), 'utf8')).resolves.toBe(
        'local menu work'
      );
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('lets pack authors bypass manifest mods during sync', async () => {
    const root = await mkdtemp(join(tmpdir(), 'bbt-sync-author-mods-'));
    const projectRoot = join(root, 'projects', 'northvale');

    try {
      await mkdir(join(projectRoot, 'mods'), { recursive: true });
      await writeFile(join(projectRoot, 'mods', 'test.jar'), 'local mod work');
      await writeFile(join(projectRoot, 'mods', 'old-required.jar'), 'old required');
      await writeFile(join(root, '.bbt-pack-author'), '1');
      await writeManagedIndex(root, 'northvale', [
        { path: 'mods/test.jar', syncMode: 'required' },
        { path: 'mods/old-required.jar', syncMode: 'required' }
      ]);

      const result = await syncProject({
        rootDir: root,
        projectId: 'northvale',
        manifest: makeManifest('official mod'),
        baseUrl: 'https://bbt.example',
        fetchImpl: async () => {
          throw new Error('author mod bypass should not download manifest mods');
        }
      });

      expect(result).toEqual({
        status: 'ready',
        downloaded: 0,
        skipped: 0,
        totalBytes: 0,
        downloadedBytes: 0
      });
      await expect(readFile(join(projectRoot, 'mods', 'test.jar'), 'utf8')).resolves.toBe('local mod work');
      await expect(readFile(join(projectRoot, 'mods', 'old-required.jar'), 'utf8')).resolves.toBe('old required');
      await expect(readFile(join(root, 'metadata', 'northvale', 'managed-files.json'), 'utf8')).resolves.not.toContain(
        'mods/'
      );
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('does not touch files or metadata when a SaiNam owner syncs an existing project', async () => {
    const root = await mkdtemp(join(tmpdir(), 'bbt-sync-sainam-owner-'));
    const projectRoot = join(root, 'projects', 'sainam');

    try {
      await mkdir(join(projectRoot, 'config'), { recursive: true });
      await writeFile(join(projectRoot, 'config', 'sainam.toml'), 'owner changed config');
      await writeFile(join(projectRoot, 'config', 'old-managed.toml'), 'owner retained config');
      await writeFile(join(root, '.bbt-pack-author'), '1');
      await writeManagedIndex(root, 'sainam', [
        { path: 'config/sainam.toml', syncMode: 'required' },
        { path: 'config/old-managed.toml', syncMode: 'required' }
      ]);
      const indexPath = join(root, 'metadata', 'sainam', 'managed-files.json');
      const indexBefore = await readFile(indexPath, 'utf8');

      const result = await syncProject({
        rootDir: root,
        projectId: 'sainam',
        manifest: asSaiNam(makeFileManifest('config/sainam.toml', 'official config', 'required')),
        baseUrl: 'https://bbt.example',
        fetchImpl: async () => {
          throw new Error('owner sync must not fetch manifest files');
        }
      });

      expect(result).toEqual({
        status: 'ready',
        downloaded: 0,
        skipped: 0,
        totalBytes: 0,
        downloadedBytes: 0
      });
      await expect(readFile(join(projectRoot, 'config', 'sainam.toml'), 'utf8')).resolves.toBe(
        'owner changed config'
      );
      await expect(readFile(join(projectRoot, 'config', 'old-managed.toml'), 'utf8')).resolves.toBe(
        'owner retained config'
      );
      await expect(readFile(indexPath, 'utf8')).resolves.toBe(indexBefore);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('performs the normal first install for a SaiNam owner without a project directory', async () => {
    const root = await mkdtemp(join(tmpdir(), 'bbt-sync-sainam-owner-install-'));

    try {
      await writeFile(join(root, '.bbt-pack-author'), '1');

      const result = await syncProject({
        rootDir: root,
        projectId: 'sainam',
        manifest: asSaiNam(makeManifest('official mod')),
        baseUrl: 'https://bbt.example',
        fetchImpl: async () => new Response('official mod')
      });

      expect(result.downloaded).toBe(1);
      await expect(
        readFile(join(root, 'projects', 'sainam', 'mods', 'test.jar'), 'utf8')
      ).resolves.toBe('official mod');
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('installs missing mods when a SaiNam owner project exists without an installed pack', async () => {
    const root = await mkdtemp(join(tmpdir(), 'bbt-sync-sainam-owner-empty-pack-'));

    try {
      await mkdir(join(root, 'projects', 'sainam', 'mods'), { recursive: true });
      await mkdir(join(root, 'projects', 'sainam', 'config'), { recursive: true });
      await writeFile(join(root, 'projects', 'sainam', 'config', 'forge-client.toml'), 'generated');
      await writeFile(join(root, '.bbt-pack-author'), '1');

      const result = await syncProject({
        rootDir: root,
        projectId: 'sainam',
        manifest: asSaiNam(makeManifest('official mod')),
        baseUrl: 'https://bbt.example',
        fetchImpl: async () => new Response('official mod')
      });

      expect(result.downloaded).toBe(1);
      await expect(
        readFile(join(root, 'projects', 'sainam', 'mods', 'test.jar'), 'utf8')
      ).resolves.toBe('official mod');
      await expect(
        readFile(join(root, 'metadata', 'sainam', 'managed-files.json'), 'utf8')
      ).resolves.toContain('mods/test.jar');
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('preserves a removed managed SaiNam mod for normal players', async () => {
    const root = await mkdtemp(join(tmpdir(), 'bbt-sync-sainam-stale-mod-'));
    const projectRoot = join(root, 'projects', 'sainam');

    try {
      await mkdir(join(projectRoot, 'mods'), { recursive: true });
      await writeFile(join(projectRoot, 'mods', 'test.jar'), 'pack');
      await writeFile(join(projectRoot, 'mods', 'removed.jar'), 'preserved old mod');
      await writeManagedIndex(root, 'sainam', [
        { path: 'mods/test.jar', syncMode: 'required' },
        { path: 'mods/removed.jar', syncMode: 'required' }
      ]);

      const result = await syncProject({
        rootDir: root,
        projectId: 'sainam',
        manifest: asSaiNam(makeManifest('pack')),
        baseUrl: 'https://bbt.example',
        fetchImpl: async () => {
          throw new Error('clean manifest file should not be downloaded');
        }
      });

      expect(result.downloaded).toBe(0);
      await expect(readFile(join(projectRoot, 'mods', 'removed.jar'), 'utf8')).resolves.toBe(
        'preserved old mod'
      );
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('removes the normalized legacy FancyMenu mod for normal SaiNam players', async () => {
    const root = await mkdtemp(join(tmpdir(), 'bbt-sync-sainam-stale-fancymenu-'));
    const projectRoot = join(root, 'projects', 'sainam');

    try {
      await mkdir(join(projectRoot, 'mods'), { recursive: true });
      await writeFile(join(projectRoot, 'mods', 'test.jar'), 'pack');
      await writeFile(join(projectRoot, 'mods', 'fancymenu_forge_3.9.3_MC_1.20.1.jar'), 'legacy FancyMenu');
      await writeManagedIndex(root, 'sainam', [
        { path: 'mods/test.jar', syncMode: 'required' },
        { path: 'mods\\fancymenu_forge_3.9.3_MC_1.20.1.jar', syncMode: 'required' }
      ]);

      await syncProject({
        rootDir: root,
        projectId: 'sainam',
        manifest: asSaiNam(makeManifest('pack')),
        baseUrl: 'https://bbt.example',
        fetchImpl: async () => {
          throw new Error('clean manifest file should not be downloaded');
        }
      });

      await expect(
        readFile(join(projectRoot, 'mods', 'fancymenu_forge_3.9.3_MC_1.20.1.jar'), 'utf8')
      ).rejects.toThrow();
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('removes only the retired Epic Fight mod for normal SaiNam players', async () => {
    const root = await mkdtemp(join(tmpdir(), 'bbt-sync-sainam-retired-epic-fight-'));
    const projectRoot = join(root, 'projects', 'sainam');

    try {
      await mkdir(join(projectRoot, 'mods'), { recursive: true });
      await writeFile(join(projectRoot, 'mods', 'test.jar'), 'pack');
      await writeFile(
        join(projectRoot, 'mods', 'epic-fight-20.14.17-mc1.20.1-forge.jar'),
        'retired Epic Fight'
      );
      await writeFile(join(projectRoot, 'mods', 'player-added.jar'), 'keep me');
      await writeManagedIndex(root, 'sainam', [
        { path: 'mods/test.jar', syncMode: 'required' },
        { path: 'mods\\epic-fight-20.14.17-mc1.20.1-forge.jar', syncMode: 'required' },
        { path: 'mods/player-added.jar', syncMode: 'required' }
      ]);

      await syncProject({
        rootDir: root,
        projectId: 'sainam',
        manifest: asSaiNam(makeManifest('pack')),
        baseUrl: 'https://bbt.example',
        fetchImpl: async () => {
          throw new Error('clean manifest file should not be downloaded');
        }
      });

      await expect(
        readFile(join(projectRoot, 'mods', 'epic-fight-20.14.17-mc1.20.1-forge.jar'), 'utf8')
      ).rejects.toThrow();
      await expect(readFile(join(projectRoot, 'mods', 'player-added.jar'), 'utf8')).resolves.toBe(
        'keep me'
      );
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('still removes a stale managed SaiNam config for normal players', async () => {
    const root = await mkdtemp(join(tmpdir(), 'bbt-sync-sainam-stale-config-'));
    const projectRoot = join(root, 'projects', 'sainam');

    try {
      await mkdir(join(projectRoot, 'mods'), { recursive: true });
      await mkdir(join(projectRoot, 'config'), { recursive: true });
      await writeFile(join(projectRoot, 'mods', 'test.jar'), 'pack');
      await writeFile(join(projectRoot, 'config', 'removed.toml'), 'stale config');
      await writeManagedIndex(root, 'sainam', [
        { path: 'mods/test.jar', syncMode: 'required' },
        { path: 'config/removed.toml', syncMode: 'required' }
      ]);

      await syncProject({
        rootDir: root,
        projectId: 'sainam',
        manifest: asSaiNam(makeManifest('pack')),
        baseUrl: 'https://bbt.example',
        fetchImpl: async () => {
          throw new Error('clean manifest file should not be downloaded');
        }
      });

      await expect(readFile(join(projectRoot, 'config', 'removed.toml'), 'utf8')).rejects.toThrow();
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('replaces a changed same-path SaiNam mod for normal players', async () => {
    const root = await mkdtemp(join(tmpdir(), 'bbt-sync-sainam-repair-'));
    const projectMods = join(root, 'projects', 'sainam', 'mods');

    try {
      await mkdir(projectMods, { recursive: true });
      await writeFile(join(projectMods, 'test.jar'), 'damaged mod');

      const result = await syncProject({
        rootDir: root,
        projectId: 'sainam',
        manifest: asSaiNam(makeManifest('official mod')),
        baseUrl: 'https://bbt.example',
        fetchImpl: async () => new Response('official mod')
      });

      expect(result.downloaded).toBe(1);
      await expect(readFile(join(projectMods, 'test.jar'), 'utf8')).resolves.toBe('official mod');
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('refuses to sync forbidden manifest paths even if validation was bypassed', async () => {
    const root = await mkdtemp(join(tmpdir(), 'bbt-sync-'));
    const manifest = makeManifest('save data');
    manifest.projects[0].files[0].path = 'saves/world/level.dat';

    try {
      await expect(
        syncProject({
          rootDir: root,
          projectId: 'northvale',
          manifest,
          baseUrl: 'https://bbt.example',
          fetchImpl: async () => new Response('save data')
        })
      ).rejects.toThrow(/refusing to sync/i);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
