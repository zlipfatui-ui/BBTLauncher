import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { mkdtempSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { inspectMinecraftRuntime, writeRuntimeMarker } from './runtime-cache';

async function createCompleteRuntime(rootDir: string) {
  const minecraft = join(rootDir, 'minecraft');
  await mkdir(join(minecraft, 'versions', '1.20.1'), { recursive: true });
  await writeFile(join(minecraft, 'versions', '1.20.1', '1.20.1.json'), '{}');
  await writeFile(join(minecraft, 'versions', '1.20.1', '1.20.1.jar'), 'jar');

  const forgeVersion = '1.20.1-forge-47.4.20';
  await mkdir(join(minecraft, 'versions', forgeVersion), { recursive: true });
  await writeFile(join(minecraft, 'versions', forgeVersion, `${forgeVersion}.json`), JSON.stringify({
    libraries: [
      {
        downloads: {
          artifact: {
            path: 'com/example/example-lib/1.0.0/example-lib-1.0.0.jar'
          }
        }
      }
    ]
  }));
  await mkdir(join(minecraft, 'libraries', 'com/example/example-lib/1.0.0'), { recursive: true });
  await writeFile(join(minecraft, 'libraries', 'com/example/example-lib/1.0.0/example-lib-1.0.0.jar'), 'lib');
  await mkdir(join(minecraft, 'libraries', 'net/minecraftforge/forge/1.20.1-47.4.20'), { recursive: true });
  await writeFile(join(minecraft, 'libraries', 'net/minecraftforge/forge/1.20.1-47.4.20/forge-1.20.1-47.4.20-client.jar'), 'forge');
}

describe('runtime cache inspection', () => {
  it('reports a complete Forge runtime when version, Forge library, and dependencies exist', async () => {
    const rootDir = mkdtempSync(join(tmpdir(), 'bbt-runtime-'));
    await createCompleteRuntime(rootDir);

    await expect(
      inspectMinecraftRuntime({
        rootDir,
        projectId: 'northvale',
        minecraftVersion: '1.20.1',
        loaderVersion: '47.4.20',
        javaPath: 'C:/Java/17/bin/java.exe'
      })
    ).resolves.toMatchObject({ complete: true, missing: [] });
  });

  it('persists a marker after a runtime install completes', async () => {
    const rootDir = mkdtempSync(join(tmpdir(), 'bbt-runtime-marker-'));

    const marker = await writeRuntimeMarker({
      rootDir,
      projectId: 'northvale',
      minecraftVersion: '1.20.1',
      loaderVersion: '47.4.20',
      javaPath: 'C:/Java/17/bin/java.exe'
    });

    expect(marker).toMatchObject({
      projectId: 'northvale',
      minecraftVersion: '1.20.1',
      loaderVersion: '47.4.20'
    });
    await expect(
      inspectMinecraftRuntime({
        rootDir,
        projectId: 'northvale',
        minecraftVersion: '1.20.1',
        loaderVersion: '47.4.20',
        javaPath: 'C:/Java/17/bin/java.exe'
      })
    ).resolves.toMatchObject({ marker: expect.objectContaining({ projectId: 'northvale' }) });
  });

  it('marks the runtime incomplete when native classifier libraries are missing', async () => {
    const rootDir = mkdtempSync(join(tmpdir(), 'bbt-runtime-native-'));
    await createCompleteRuntime(rootDir);
    const forgeJsonPath = join(
      rootDir,
      'minecraft',
      'versions',
      '1.20.1-forge-47.4.20',
      '1.20.1-forge-47.4.20.json'
    );
    await writeFile(forgeJsonPath, JSON.stringify({
      libraries: [
        {
          downloads: {
            artifact: { path: 'com/example/example-lib/1.0.0/example-lib-1.0.0.jar' },
            classifiers: {
              'natives-windows': { path: 'com/example/example-lib/1.0.0/example-lib-1.0.0-natives-windows.jar' }
            }
          }
        }
      ]
    }));

    await expect(
      inspectMinecraftRuntime({
        rootDir,
        projectId: 'northvale',
        minecraftVersion: '1.20.1',
        loaderVersion: '47.4.20',
        javaPath: 'C:/Java/17/bin/java.exe'
      })
    ).resolves.toMatchObject({
      complete: false,
      missing: expect.arrayContaining(['library:com/example/example-lib/1.0.0/example-lib-1.0.0-natives-windows.jar'])
    });
  });
});
