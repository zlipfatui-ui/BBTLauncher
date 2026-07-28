import { describe, expect, it } from 'vitest';
import { createManifestClient, validateLauncherManifest } from './manifest-client';
import type { LauncherManifest } from '../../shared/types';

const manifest: LauncherManifest = {
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
        gallery: ['/assets/images/gallery/ss0/01.jpg']
      },
      files: [
        {
          path: 'mods/bbtskin-forge-1.4.4.jar',
          url: '/assets/downloads/mods/bbtskin-forge-1.4.4.jar',
          sha256: '39A9F668E1AFEEF93B4C2ED56EC7B08DC73F9E1EDC3D14C14A8DAB35B2E804A0',
          size: 150554,
          required: true
        }
      ]
    }
  ]
};

describe('manifest client', () => {
  it('validates the Northvale launcher manifest shape', () => {
    expect(validateLauncherManifest(manifest)).toEqual(manifest);
  });

  it('validates Northvale and SaiNam with their own Forge versions and artwork', () => {
    const twoProjects = structuredClone(manifest) as unknown as Record<string, unknown>;
    (twoProjects.projects as unknown[]).push({
      id: 'sainam',
      title: 'SaiNam',
      statusText: 'UP TO DATE',
      minecraft: {
        version: '1.20.1',
        loader: 'forge',
        loaderVersion: '47.4.10',
        javaMajor: 17
      },
      artwork: {
        cover: '',
        gallery: []
      },
      files: []
    });

    expect(validateLauncherManifest(twoProjects).projects[1]).toEqual({
      id: 'sainam',
      title: 'SaiNam',
      statusText: 'UP TO DATE',
      minecraft: {
        version: '1.20.1',
        loader: 'forge',
        loaderVersion: '47.4.10',
        javaMajor: 17
      },
      artwork: {
        cover: '',
        gallery: []
      },
      files: []
    });
  });

  it('rejects unknown, duplicate, and mismatched project metadata', () => {
    const unknown = structuredClone(manifest) as unknown as Record<string, unknown>;
    (unknown.projects as Array<Record<string, unknown>>)[0].id = 'unknown';
    expect(() => validateLauncherManifest(unknown)).toThrow(/project id|supports/i);

    const duplicate = structuredClone(manifest) as unknown as Record<string, unknown>;
    (duplicate.projects as unknown[]).push(structuredClone((duplicate.projects as unknown[])[0]));
    expect(() => validateLauncherManifest(duplicate)).toThrow(/duplicate/i);

    const mismatched = structuredClone(manifest) as unknown as Record<string, unknown>;
    (mismatched.projects as unknown[]).push({
      id: 'sainam',
      title: 'SaiNam',
      statusText: 'UP TO DATE',
      minecraft: {
        version: '1.20.1',
        loader: 'forge',
        loaderVersion: '47.4.20',
        javaMajor: 17
      },
      artwork: { cover: '', gallery: [] },
      files: []
    });
    expect(() => validateLauncherManifest(mismatched)).toThrow(/47\.4\.10/i);
  });

  it('rejects unsafe file paths from the manifest', () => {
    const unsafe = structuredClone(manifest);
    unsafe.projects[0].files[0].path = '../mods/bad.jar';

    expect(() => validateLauncherManifest(unsafe)).toThrow(/unsafe/i);
  });

  it('rejects manifest files outside launcher-managed pack roots', () => {
    const unsafe = structuredClone(manifest);
    unsafe.projects[0].files[0].path = 'saves/world/level.dat';

    expect(() => validateLauncherManifest(unsafe)).toThrow(/not launcher-managed/i);
  });

  it('rejects shaderpacks, backup, and account-like files', () => {
    const withShader = structuredClone(manifest);
    withShader.projects[0].files[0].path = 'shaderpacks/ComplementaryReimagined_r5.8.1.zip';

    expect(() => validateLauncherManifest(withShader)).toThrow(/not launcher-managed/i);

    const withBackup = structuredClone(manifest);
    withBackup.projects[0].files[0].path = 'config/client.toml.bak';
    expect(() => validateLauncherManifest(withBackup)).toThrow(/forbidden/i);

    const withAccount = structuredClone(manifest);
    withAccount.projects[0].files[0].path = 'config/account-token.json';
    expect(() => validateLauncherManifest(withAccount)).toThrow(/forbidden/i);
  });

  it('preserves optional syncMode for seed and required files', () => {
    const withSyncMode = structuredClone(manifest);
    withSyncMode.projects[0].files[0].syncMode = 'seed';

    expect(validateLauncherManifest(withSyncMode).projects[0].files[0]).toMatchObject({
      path: 'mods/bbtskin-forge-1.4.4.jar',
      syncMode: 'seed'
    });

    const invalidSyncMode = structuredClone(manifest);
    invalidSyncMode.projects[0].files[0].syncMode = 'optional' as 'seed';
    expect(() => validateLauncherManifest(invalidSyncMode)).toThrow(/syncMode/i);
  });

  it('rejects disabled folders regardless of case', () => {
    const unsafe = structuredClone(manifest);
    unsafe.projects[0].files[0].path = 'mods/_Disabled_old/test.jar';

    expect(() => validateLauncherManifest(unsafe)).toThrow(/forbidden/i);
  });

  it('fetches the manifest from /api/launcher/manifest', async () => {
    const requested: string[] = [];
    const client = createManifestClient({
      baseUrl: 'https://bbt.example',
      fetchImpl: async (url) => {
        requested.push(String(url));
        return new Response(JSON.stringify(manifest), {
          headers: { 'Content-Type': 'application/json' }
        });
      }
    });

    await expect(client.refresh()).resolves.toEqual(manifest);
    expect(requested).toEqual(['https://bbt.example/api/launcher/manifest']);
  });
});
