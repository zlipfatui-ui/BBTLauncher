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

  it('rejects unsafe file paths from the manifest', () => {
    const unsafe = structuredClone(manifest);
    unsafe.projects[0].files[0].path = '../mods/bad.jar';

    expect(() => validateLauncherManifest(unsafe)).toThrow(/unsafe/i);
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
