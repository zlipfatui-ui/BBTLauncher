import { describe, expect, it, vi } from 'vitest';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { mkdtempSync } from 'node:fs';
import { createXmclLauncherFromModules, launchProject } from './launcher';
import type { LauncherManifest, LauncherSettings, SafeMinecraftProfile } from '../../shared/types';

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
        gallery: []
      },
      files: []
    }
  ]
};

const settings: LauncherSettings = {
  appDirectory: 'C:/Users/zLip/AppData/Roaming/.beforebedtime-launcher',
  width: 1280,
  height: 720,
  fullscreen: false,
  memoryMb: 8192,
  selectedProject: 'northvale'
};

const profile: SafeMinecraftProfile = {
  id: '898da750881840f09da4ea6822260b30',
  name: 'Zlevyn',
  avatarInitial: 'Z',
  provider: 'microsoft'
};

describe('launch service', () => {
  it('launches Northvale with Minecraft 1.20.1, Forge 47.4.20, Java 17, and memory setting', async () => {
    const ensureInstalled = vi.fn(async (options) => {
      options.onProgress?.({ phase: 'INSTALLING_MINECRAFT', message: 'Installing Minecraft 1.20.1' });
      return { javaPath: 'managed-java/bin/java.exe' };
    });
    const launchMinecraft = vi.fn(async () => ({ pid: 1234 }));
    const resolveManagedJava = vi.fn(async () => 'managed-java/bin/java.exe');
    const progress = vi.fn();

    await launchProject({
      rootDir: 'C:/Users/zLip/AppData/Roaming/.beforebedtime-launcher',
      projectId: 'northvale',
      manifest,
      settings,
      profile,
      minecraftAccessToken: 'minecraft-token',
      launcher: { ensureInstalled, launchMinecraft },
      resolveManagedJava,
      onProgress: progress
    });

    expect(ensureInstalled).toHaveBeenCalledWith({
      rootDir: settings.appDirectory,
      projectId: 'northvale',
      minecraftVersion: '1.20.1',
      loader: 'forge',
      loaderVersion: '47.4.20',
      javaMajor: 17,
      javaPath: 'managed-java/bin/java.exe',
      onProgress: progress
    });
    expect(launchMinecraft).toHaveBeenCalledWith(
      expect.objectContaining({
        rootDir: settings.appDirectory,
        projectId: 'northvale',
        minecraftVersion: '1.20.1',
        loaderVersion: '47.4.20',
        javaMajor: 17,
        memoryMb: 8192,
        width: 1280,
        height: 720,
        fullscreen: false,
        profile
      })
    );
    expect(resolveManagedJava).toHaveBeenCalledOnce();
    expect(progress.mock.calls.map(([event]) => event.phase)).toEqual([
      'CHECKING_RUNTIME',
      'INSTALLING_MINECRAFT',
      'LAUNCHING'
    ]);
  });

  it('skips Minecraft and Forge installers when the cached runtime is complete', async () => {
    const rootDir = mkdtempSync(join(tmpdir(), 'bbt-launch-cache-'));
    const minecraft = join(rootDir, 'minecraft');
    await mkdir(join(minecraft, 'versions', '1.20.1'), { recursive: true });
    await writeFile(join(minecraft, 'versions', '1.20.1', '1.20.1.json'), '{}');
    await writeFile(join(minecraft, 'versions', '1.20.1', '1.20.1.jar'), 'jar');
    await mkdir(join(minecraft, 'versions', '1.20.1-forge-47.4.20'), { recursive: true });
    await writeFile(join(minecraft, 'versions', '1.20.1-forge-47.4.20', '1.20.1-forge-47.4.20.json'), JSON.stringify({ libraries: [] }));
    await mkdir(join(minecraft, 'libraries', 'net/minecraftforge/forge/1.20.1-47.4.20'), { recursive: true });
    await writeFile(join(minecraft, 'libraries', 'net/minecraftforge/forge/1.20.1-47.4.20/forge-1.20.1-47.4.20-client.jar'), 'forge');

    const progress = vi.fn();
    const install = vi.fn();
    const installForge = vi.fn();
    const installDependencies = vi.fn();
    const launcher = createXmclLauncherFromModules({
      installer: {
        Installer: {
          getVersionList: vi.fn(),
          install,
          installDependencies
        },
        ForgeInstaller: {
          install: installForge
        }
      },
      core: {
        Version: { parse: vi.fn() },
        launch: vi.fn()
      },
      resolveJavaExecutable: async () => 'C:/Java/17/bin/java.exe'
    });

    await expect(
      launcher.ensureInstalled({
        rootDir,
        projectId: 'northvale',
        minecraftVersion: '1.20.1',
        loader: 'forge',
        loaderVersion: '47.4.20',
        javaMajor: 17,
        javaPath: 'C:/Java/17/bin/java.exe',
        onProgress: progress
      })
    ).resolves.toEqual({ javaPath: 'C:/Java/17/bin/java.exe' });

    expect(install).not.toHaveBeenCalled();
    expect(installForge).not.toHaveBeenCalled();
    expect(installDependencies).not.toHaveBeenCalled();
    expect(progress.mock.calls.map(([event]) => event.phase)).not.toContain('INSTALLING_FORGE');
  });

  it('installs vanilla, Forge, dependencies, and launches through XMCL modules', async () => {
    const rootDir = mkdtempSync(join(tmpdir(), 'bbt-install-'));
    const resolvedVersion = { id: '1.20.1-forge-47.4.20', minecraftDirectory: 'mc', libraries: [] };
    const install = vi.fn(async () => resolvedVersion);
    const installForge = vi.fn(async () => '1.20.1-forge-47.4.20');
    const installDependencies = vi.fn(async () => resolvedVersion);
    const parse = vi.fn(async () => resolvedVersion);
    const launch = vi.fn(async () => ({ pid: 2233 }));

    const launcher = createXmclLauncherFromModules({
      installer: {
        Installer: {
          getVersionList: vi.fn(async () => ({
            versions: [{ id: '1.20.1', url: 'https://example.test/1.20.1.json' }]
          })),
          install,
          installDependencies
        },
        ForgeInstaller: {
          install: installForge
        }
      },
      core: {
        Version: { parse },
        launch
      },
      resolveJavaExecutable: async () => 'C:/Java/17/bin/java.exe'
    });

    const installResult = await launcher.ensureInstalled({
      rootDir,
      projectId: 'northvale',
      minecraftVersion: '1.20.1',
      loader: 'forge',
      loaderVersion: '47.4.20',
      javaMajor: 17,
      javaPath: 'C:/Java/17/bin/java.exe'
    });
    expect(installResult.javaPath).toBe('C:/Java/17/bin/java.exe');
    const launchResult = await launcher.launchMinecraft({
      rootDir,
      projectId: 'northvale',
      projectDir: `${rootDir}/projects/northvale`,
      minecraftVersion: '1.20.1',
      loader: 'forge',
      loaderVersion: '47.4.20',
      javaMajor: 17,
      memoryMb: 8192,
      width: 1280,
      height: 720,
      fullscreen: false,
      profile,
      minecraftAccessToken: 'minecraft-token',
      javaPath: installResult.javaPath!
    });

    expect(install).toHaveBeenCalledWith('client', { id: '1.20.1', url: 'https://example.test/1.20.1.json' }, expect.stringContaining('minecraft'));
    expect(installForge).toHaveBeenCalledWith(
      { version: '47.4.20', mcversion: '1.20.1' },
      expect.stringContaining('minecraft'),
      { java: 'C:/Java/17/bin/java.exe' }
    );
    expect(parse).toHaveBeenCalledWith(expect.stringContaining('minecraft'), '1.20.1-forge-47.4.20');
    expect(installDependencies).toHaveBeenCalledWith(resolvedVersion);
    expect(launch).toHaveBeenCalledWith(
      expect.objectContaining({
        gamePath: `${rootDir}/projects/northvale`,
        resourcePath: expect.stringContaining('minecraft'),
        javaPath: 'C:/Java/17/bin/java.exe',
        version: '1.20.1-forge-47.4.20',
        gameProfile: {
          name: 'Zlevyn',
          id: profile.id
        },
        userType: 'msa',
        minMemory: 8192,
        maxMemory: 8192
      })
    );
    expect(launchResult).toEqual({ pid: 2233 });
  });

  it('ignores Minecraft stdio so Forge console output cannot block startup', async () => {
    const launch = vi.fn(async () => ({ pid: 2233 }));
    const launcher = createXmclLauncherFromModules({
      installer: {
        Installer: {
          getVersionList: vi.fn(),
          install: vi.fn(),
          installDependencies: vi.fn()
        },
        ForgeInstaller: {
          install: vi.fn()
        }
      },
      core: {
        Version: { parse: vi.fn() },
        launch
      },
      resolveJavaExecutable: async () => 'C:/Java/17/bin/java.exe'
    });

    await launcher.launchMinecraft({
      rootDir: settings.appDirectory,
      projectId: 'northvale',
      projectDir: `${settings.appDirectory}/projects/northvale`,
      minecraftVersion: '1.20.1',
      loader: 'forge',
      loaderVersion: '47.4.20',
      javaMajor: 17,
      memoryMb: 8192,
      width: 1280,
      height: 720,
      fullscreen: false,
      profile,
      minecraftAccessToken: 'minecraft-token',
      javaPath: 'C:/Java/17/bin/java.exe'
    });

    expect(launch).toHaveBeenCalledWith(
      expect.objectContaining({
        extraExecOption: expect.objectContaining({
          detached: true,
          stdio: 'ignore'
        })
      })
    );
  });

  it('reports granular Minecraft, Forge, and dependency install phases', async () => {
    const rootDir = mkdtempSync(join(tmpdir(), 'bbt-install-phases-'));
    const resolvedVersion = { id: '1.20.1-forge-47.4.20', minecraftDirectory: 'mc', libraries: [] };
    const progress = vi.fn();
    const launcher = createXmclLauncherFromModules({
      installer: {
        Installer: {
          getVersionList: vi.fn(async () => ({
            versions: [{ id: '1.20.1', url: 'https://example.test/1.20.1.json' }]
          })),
          install: vi.fn(async () => resolvedVersion),
          installDependencies: vi.fn(async () => resolvedVersion)
        },
        ForgeInstaller: {
          install: vi.fn(async () => '1.20.1-forge-47.4.20')
        }
      },
      core: {
        Version: { parse: vi.fn(async () => resolvedVersion) },
        launch: vi.fn()
      },
      resolveJavaExecutable: async () => 'C:/Java/17/bin/java.exe'
    });

    await launcher.ensureInstalled({
      rootDir,
      projectId: 'northvale',
      minecraftVersion: '1.20.1',
      loader: 'forge',
      loaderVersion: '47.4.20',
      javaMajor: 17,
      javaPath: 'C:/Java/17/bin/java.exe',
      onProgress: progress
    });

    expect(progress.mock.calls.map(([event]) => event.phase)).toEqual([
      'INSTALLING_MINECRAFT',
      'INSTALLING_FORGE',
      'DOWNLOADING_LIBRARIES'
    ]);
  });

  it('falls back to the official Forge installer jar when XMCL cannot read the Forge jar entry', async () => {
    const rootDir = mkdtempSync(join(tmpdir(), 'bbt-forge-fallback-'));
    const resolvedVersion = { id: '1.20.1-forge-47.4.20', minecraftDirectory: 'mc', libraries: [] };
    const runForgeInstallerJar = vi.fn(async () => '1.20.1-forge-47.4.20');
    const launcher = createXmclLauncherFromModules({
      installer: {
        Installer: {
          getVersionList: vi.fn(async () => ({
            versions: [{ id: '1.20.1', url: 'https://example.test/1.20.1.json' }]
          })),
          install: vi.fn(async () => resolvedVersion),
          installDependencies: vi.fn(async () => resolvedVersion)
        },
        ForgeInstaller: {
          install: vi.fn(async () => {
            throw new Error('Missing forge jar entry');
          })
        }
      },
      core: {
        Version: { parse: vi.fn(async () => resolvedVersion) },
        launch: vi.fn()
      },
      resolveJavaExecutable: async () => 'C:/Java/17/bin/java.exe',
      runForgeInstallerJar
    });

    await expect(
      launcher.ensureInstalled({
        rootDir,
        projectId: 'northvale',
        minecraftVersion: '1.20.1',
        loader: 'forge',
        loaderVersion: '47.4.20',
        javaMajor: 17,
        javaPath: 'C:/Java/17/bin/java.exe'
      })
    ).resolves.toEqual({ javaPath: 'C:/Java/17/bin/java.exe' });

    expect(runForgeInstallerJar).toHaveBeenCalledWith({
      minecraftLocation: expect.stringContaining('minecraft'),
      minecraftVersion: '1.20.1',
      loaderVersion: '47.4.20',
      javaPath: 'C:/Java/17/bin/java.exe'
    });
  });

  it('times out stalled install steps instead of leaving the launcher busy forever', async () => {
    const rootDir = mkdtempSync(join(tmpdir(), 'bbt-install-timeout-'));
    const resolvedVersion = { id: '1.20.1', minecraftDirectory: 'mc', libraries: [] };
    const launcher = createXmclLauncherFromModules({
      installer: {
        Installer: {
          getVersionList: vi.fn(async () => ({
            versions: [{ id: '1.20.1', url: 'https://example.test/1.20.1.json' }]
          })),
          install: vi.fn(async () => resolvedVersion),
          installDependencies: vi.fn()
        },
        ForgeInstaller: {
          install: vi.fn(() => new Promise<string>(() => undefined))
        }
      },
      core: {
        Version: { parse: vi.fn() },
        launch: vi.fn()
      },
      resolveJavaExecutable: async () => 'C:/Java/17/bin/java.exe'
    });

    await expect(
      Promise.race([
        launcher.ensureInstalled({
          rootDir,
          projectId: 'northvale',
          minecraftVersion: '1.20.1',
          loader: 'forge',
          loaderVersion: '47.4.20',
          javaMajor: 17,
          javaPath: 'C:/Java/17/bin/java.exe',
          installStepTimeoutMs: 1
        }),
        new Promise((_, reject) => setTimeout(() => reject(new Error('install did not time out')), 30))
      ])
    ).rejects.toThrow('Forge install timed out');
  });

  it('refuses to launch XMCL without a Minecraft access token', async () => {
    const launch = vi.fn(async () => ({ pid: 2233 }));
    const launcher = createXmclLauncherFromModules({
      installer: {
        Installer: {
          getVersionList: vi.fn(),
          install: vi.fn(),
          installDependencies: vi.fn()
        },
        ForgeInstaller: { install: vi.fn() }
      },
      core: {
        Version: { parse: vi.fn() },
        launch
      }
    });

    await expect(
      launcher.launchMinecraft({
        rootDir: settings.appDirectory,
        projectId: 'northvale',
        projectDir: `${settings.appDirectory}/projects/northvale`,
        minecraftVersion: '1.20.1',
        loader: 'forge',
        loaderVersion: '47.4.20',
        javaMajor: 17,
        memoryMb: 8192,
        width: 1280,
        height: 720,
        fullscreen: false,
        profile,
        javaPath: 'C:/Java/17/bin/java.exe'
      })
    ).rejects.toMatchObject({ code: 'AUTH_REQUIRED' });
    expect(launch).not.toHaveBeenCalled();
  });
});
