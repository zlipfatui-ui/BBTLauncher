import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { LauncherManifest } from '../../shared/types';
import { inspectProjectState } from './project-state';

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex').toUpperCase();
}

function manifestFor(body: string): LauncherManifest {
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
        artwork: { cover: '', gallery: [] },
        files: [
          {
            path: 'mods/test.jar',
            url: '/api/launcher/files/northvale/mods/test.jar',
            sha256: sha256(body),
            size: Buffer.byteLength(body),
            required: true
          }
        ]
      }
    ]
  };
}

function manifestWithFile(path: string, body: string, syncMode?: 'required' | 'seed'): LauncherManifest {
  const manifest = manifestFor('pack');
  manifest.projects[0].files = [
    {
      path,
      url: `/api/launcher/files/northvale/${path}`,
      sha256: sha256(body),
      size: Buffer.byteLength(body),
      required: true,
      ...(syncMode ? { syncMode } : {})
    }
  ];
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

function manifestWithShaderpack(modBody: string, shaderBody: string): LauncherManifest {
  const manifest = manifestFor(modBody);
  manifest.projects[0].files.push({
    path: 'shaderpacks/ComplementaryReimagined_r5.8.1.zip',
    url: '/api/launcher/files/northvale/shaderpacks/ComplementaryReimagined_r5.8.1.zip',
    sha256: sha256(shaderBody),
    size: Buffer.byteLength(shaderBody),
    required: true
  });
  return manifest;
}

describe('project state inspection', () => {
  it('returns install when no managed project files exist', async () => {
    const root = await mkdtemp(join(tmpdir(), 'bbt-state-'));
    try {
      await expect(inspectProjectState(root, 'northvale', manifestFor('pack'))).resolves.toMatchObject({
        state: 'install',
        missing: 1
      });
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('returns update when an installed managed file changed', async () => {
    const root = await mkdtemp(join(tmpdir(), 'bbt-state-'));
    try {
      const mods = join(root, 'projects', 'northvale', 'mods');
      await mkdir(mods, { recursive: true });
      await writeFile(join(mods, 'test.jar'), 'old pack');

      await expect(inspectProjectState(root, 'northvale', manifestFor('new pack'))).resolves.toMatchObject({
        state: 'update',
        changed: 1
      });
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('returns update when a stale managed file exists', async () => {
    const root = await mkdtemp(join(tmpdir(), 'bbt-state-'));
    try {
      const mods = join(root, 'projects', 'northvale', 'mods');
      await mkdir(mods, { recursive: true });
      await writeFile(join(mods, 'test.jar'), 'pack');
      await writeFile(join(mods, 'removed.jar'), 'stale');
      await writeManagedIndex(root, 'northvale', [
        { path: 'mods/test.jar', syncMode: 'required' },
        { path: 'mods/removed.jar', syncMode: 'required' }
      ]);

      await expect(inspectProjectState(root, 'northvale', manifestFor('pack'))).resolves.toMatchObject({
        state: 'update',
        stale: 1
      });
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('returns ready when every managed file matches the manifest', async () => {
    const root = await mkdtemp(join(tmpdir(), 'bbt-state-'));
    try {
      const mods = join(root, 'projects', 'northvale', 'mods');
      await mkdir(mods, { recursive: true });
      await writeFile(join(mods, 'test.jar'), 'pack');

      await expect(inspectProjectState(root, 'northvale', manifestFor('pack'))).resolves.toEqual({
        state: 'ready',
        missing: 0,
        changed: 0,
        stale: 0
      });
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('ignores shaderpacks from older manifests and local player shaderpacks', async () => {
    const root = await mkdtemp(join(tmpdir(), 'bbt-state-'));
    try {
      const projectRoot = join(root, 'projects', 'northvale');
      await mkdir(join(projectRoot, 'mods'), { recursive: true });
      await mkdir(join(projectRoot, 'shaderpacks'), { recursive: true });
      await writeFile(join(projectRoot, 'mods', 'test.jar'), 'pack');
      await writeFile(join(projectRoot, 'shaderpacks', 'custom-player-shader.zip'), 'player shader');

      await expect(inspectProjectState(root, 'northvale', manifestWithShaderpack('pack', 'official shader'))).resolves.toEqual({
        state: 'ready',
        missing: 0,
        changed: 0,
        stale: 0
      });
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('ignores extra player mods, resourcepacks, and shaderpacks', async () => {
    const root = await mkdtemp(join(tmpdir(), 'bbt-state-'));
    try {
      const projectRoot = join(root, 'projects', 'northvale');
      await mkdir(join(projectRoot, 'mods'), { recursive: true });
      await mkdir(join(projectRoot, 'resourcepacks'), { recursive: true });
      await mkdir(join(projectRoot, 'shaderpacks'), { recursive: true });
      await writeFile(join(projectRoot, 'mods', 'test.jar'), 'pack');
      await writeFile(join(projectRoot, 'mods', 'player-added.jar'), 'player mod');
      await writeFile(join(projectRoot, 'resourcepacks', 'player-pack.zip'), 'player resourcepack');
      await writeFile(join(projectRoot, 'shaderpacks', 'custom-player-shader.zip'), 'player shader');

      await expect(inspectProjectState(root, 'northvale', manifestFor('pack'))).resolves.toEqual({
        state: 'ready',
        missing: 0,
        changed: 0,
        stale: 0
      });
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('returns ready when an existing seed config has local player changes', async () => {
    const root = await mkdtemp(join(tmpdir(), 'bbt-state-'));
    try {
      const config = join(root, 'projects', 'northvale', 'config');
      await mkdir(config, { recursive: true });
      await writeFile(join(config, 'oculus.properties'), 'player changed shader settings');

      await expect(
        inspectProjectState(root, 'northvale', manifestWithFile('config/oculus.properties', 'pack default', 'seed'))
      ).resolves.toEqual({
        state: 'ready',
        missing: 0,
        changed: 0,
        stale: 0
      });
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('returns update when a seed config is missing', async () => {
    const root = await mkdtemp(join(tmpdir(), 'bbt-state-'));
    try {
      const mods = join(root, 'projects', 'northvale', 'mods');
      await mkdir(mods, { recursive: true });
      await writeFile(join(mods, 'test.jar'), 'pack');
      await mkdir(join(root, 'projects', 'northvale', 'config'), { recursive: true });
      const manifest = manifestFor('pack');
      manifest.projects[0].files.push({
        path: 'config/oculus.properties',
        url: '/api/launcher/files/northvale/config/oculus.properties',
        sha256: sha256('pack default'),
        size: Buffer.byteLength('pack default'),
        required: true,
        syncMode: 'seed'
      });

      await expect(
        inspectProjectState(root, 'northvale', manifest)
      ).resolves.toMatchObject({
        state: 'update',
        missing: 1
      });
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('enforces FancyMenu for players but lets pack authors keep local changes', async () => {
    const root = await mkdtemp(join(tmpdir(), 'bbt-state-'));
    try {
      const fancyMenu = join(root, 'projects', 'northvale', 'config', 'fancymenu');
      await mkdir(fancyMenu, { recursive: true });
      await writeFile(join(fancyMenu, 'customization.txt'), 'local menu work');
      const manifest = manifestWithFile('config/fancymenu/customization.txt', 'official menu', 'required');

      await expect(inspectProjectState(root, 'northvale', manifest)).resolves.toMatchObject({
        state: 'update',
        changed: 1
      });

      await writeFile(join(root, '.bbt-pack-author'), '1');

      await expect(inspectProjectState(root, 'northvale', manifest)).resolves.toEqual({
        state: 'ready',
        missing: 0,
        changed: 0,
        stale: 0
      });
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
