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

  it('validates Northvale and SaiNam with Forge 47.4.20 and their artwork', () => {
    const twoProjects = structuredClone(manifest) as unknown as Record<string, unknown>;
    (twoProjects.projects as unknown[]).push({
      id: 'sainam',
      title: 'SaiNam',
      statusText: 'UP TO DATE',
      minecraft: {
        version: '1.20.1',
        loader: 'forge',
        loaderVersion: '47.4.20',
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
        loaderVersion: '47.4.20',
        javaMajor: 17
      },
      artwork: {
        cover: '',
        gallery: []
      },
      files: []
    });
  });

  it('rejects invalid ids, duplicates and unsupported runtimes', () => {
    const invalid = structuredClone(manifest) as unknown as Record<string, unknown>;
    (invalid.projects as Array<Record<string, unknown>>)[0].id = 'Not A Slug';
    expect(() => validateLauncherManifest(invalid)).toThrow(/project id/i);

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
        loaderVersion: '47.4.10',
        javaMajor: 16
      },
      artwork: { cover: '', gallery: [] },
      files: []
    });
    expect(() => validateLauncherManifest(mismatched)).toThrow(/Java 17/i);
  });

  it('accepts dashboard projects with their own runtime, visibility and seed shaderpacks', () => {
    const next = structuredClone(manifest) as unknown as { projects: Array<Record<string, unknown>> };
    next.projects.push({
      id: 'season-2', title: 'Season 2', statusText: 'UP TO DATE', visibility: 'locked', lockedMessage: 'เร็ว ๆ นี้',
      seasonLabel: 'SEASON 02', tagline: 'tag', description: 'desc',
      minecraft: { version: '1.20.1', loader: 'forge', loaderVersion: '47.4.21', javaMajor: 17 },
      artwork: { cover: 'https://x/c.png', gallery: [] },
      files: [{ path: 'shaderpacks/s.zip', url: '/api/launcher/files/season-2/shaderpacks/s.zip', sha256: 'A'.repeat(64), size: 1, required: true, syncMode: 'seed' }]
    });
    next.projects.push({ ...next.projects[1], id: 'secret', visibility: 'hidden' });
    const result = validateLauncherManifest(next);
    expect(result.projects.map((p) => p.id)).toEqual([...manifest.projects.map((p) => p.id), 'season-2']);
    expect(result.projects.at(-1)).toMatchObject({ visibility: 'locked', lockedMessage: 'เร็ว ๆ นี้', seasonLabel: 'SEASON 02', minecraft: { loaderVersion: '47.4.21' } });

    const forced = structuredClone(next);
    (forced.projects[1].files as Array<Record<string, unknown>>)[0].syncMode = 'required';
    expect(() => validateLauncherManifest(forced)).toThrow(/not launcher-managed/i);
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

  it('sends its version and reuses the cached manifest on 304', async () => {
    const seen: Array<Record<string, string>> = [];
    let calls = 0;
    const client = createManifestClient({
      baseUrl: 'https://bbt.example',
      launcherVersion: '0.4.1',
      fetchImpl: (async (_url: string, init?: RequestInit) => {
        seen.push({ ...(init?.headers as Record<string, string>) });
        calls += 1;
        return calls === 1
          ? new Response(JSON.stringify(manifest), { headers: { ETag: '"g|v2"' } })
          : new Response(null, { status: 304 });
      }) as typeof fetch
    });
    const first = await client.refresh();
    const second = await client.refresh();
    expect(second).toBe(first);
    expect(seen[0]).toEqual({ 'X-BBT-Launcher-Version': '0.4.1' });
    expect(seen[1]).toEqual({ 'X-BBT-Launcher-Version': '0.4.1', 'If-None-Match': '"g|v2"' });
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

  it('passes an abort signal so a hung server cannot block the launcher', async () => {
    let signal: AbortSignal | null | undefined;
    const client = createManifestClient({
      baseUrl: 'https://bbt.example',
      fetchImpl: (async (_url: string, init?: RequestInit) => {
        signal = init?.signal;
        return new Response(JSON.stringify(manifest));
      }) as typeof fetch
    });
    await client.refresh();
    expect(signal).toBeInstanceOf(AbortSignal);
  });
});
