import { join } from 'node:path';
import { existsSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { execFile, spawn } from 'node:child_process';
import { promisify } from 'node:util';
import type {
  LaunchProgress,
  LaunchResult,
  LauncherManifest,
  LauncherSettings,
  SafeMinecraftProfile
} from '../../shared/types.js';
import { AuthServiceError } from './auth.js';
import { ensureManagedJava } from './managed-java.js';
import { inspectMinecraftRuntime, writeRuntimeMarker } from './runtime-cache.js';

const execFileAsync = promisify(execFile);

export interface LauncherDependency {
  ensureInstalled(options: EnsureInstallOptions): Promise<{ javaPath?: string }>;
  launchMinecraft(options: LaunchMinecraftOptions): Promise<LaunchResult>;
}

export interface EnsureInstallOptions {
  rootDir: string;
  projectId: string;
  minecraftVersion: string;
  loader: 'forge';
  loaderVersion: string;
  javaMajor: number;
  javaPath: string;
  onProgress?: (progress: LaunchProgress) => void;
  installStepTimeoutMs?: number;
}

export interface LaunchMinecraftOptions extends EnsureInstallOptions {
  projectDir: string;
  width: number;
  height: number;
  fullscreen: boolean;
  memoryMb: number;
  profile: SafeMinecraftProfile;
  minecraftAccessToken?: string;
  javaPath: string;
}

export interface LaunchProjectOptions {
  rootDir: string;
  projectId: string;
  manifest: LauncherManifest;
  settings: LauncherSettings;
  profile: SafeMinecraftProfile;
  minecraftAccessToken?: string;
  launcher?: LauncherDependency;
  resolveManagedJava?: (options: {
    rootDir: string;
    onProgress?: (progress: LaunchProgress) => void;
  }) => Promise<string>;
  onProgress?: (progress: LaunchProgress) => void;
}

export async function launchProject({
  rootDir,
  projectId,
  manifest,
  settings,
  profile,
  minecraftAccessToken,
  launcher = createXmclLauncher(),
  resolveManagedJava = ({ rootDir: managedRoot, onProgress: managedProgress }) =>
    ensureManagedJava({ rootDir: managedRoot, onProgress: managedProgress }),
  onProgress
}: LaunchProjectOptions): Promise<LaunchResult> {
  const project = manifest.projects.find((entry) => entry.id === projectId);
  if (!project) throw new Error(`Project not found in launcher manifest: ${projectId}`);

  onProgress?.({
    phase: 'CHECKING_RUNTIME',
    message: 'Checking cached runtime'
  });
  const javaPath = await resolveManagedJava({ rootDir, onProgress });

  const install = await launcher.ensureInstalled({
    rootDir,
    projectId,
    minecraftVersion: project.minecraft.version,
    loader: project.minecraft.loader,
    loaderVersion: project.minecraft.loaderVersion,
    javaMajor: project.minecraft.javaMajor,
    javaPath,
    onProgress
  });

  onProgress?.({
    phase: 'LAUNCHING',
    message: 'Launching Minecraft'
  });
  return launcher.launchMinecraft({
    rootDir,
    projectId,
    projectDir: join(rootDir, 'projects', projectId),
    minecraftVersion: project.minecraft.version,
    loader: project.minecraft.loader,
    loaderVersion: project.minecraft.loaderVersion,
    javaMajor: project.minecraft.javaMajor,
    memoryMb: settings.memoryMb,
    width: settings.width,
    height: settings.height,
    fullscreen: settings.fullscreen,
    profile,
    minecraftAccessToken,
    javaPath: install.javaPath || javaPath
  });
}

export function createXmclLauncher(): LauncherDependency {
  return {
    async ensureInstalled(options) {
      const [installer, core] = await Promise.all([import('@xmcl/installer'), import('@xmcl/core')]);
      return createXmclLauncherFromModules({
        installer: installer as unknown as XmclModuleSet['installer'],
        core: core as unknown as XmclModuleSet['core']
      }).ensureInstalled(options);
    },
    async launchMinecraft(options) {
      const [installer, core] = await Promise.all([import('@xmcl/installer'), import('@xmcl/core')]);
      return createXmclLauncherFromModules({
        installer: installer as unknown as XmclModuleSet['installer'],
        core: core as unknown as XmclModuleSet['core']
      }).launchMinecraft(options);
    }
  };
}

interface XmclModuleSet {
  installer: {
    Installer: {
      getVersionList: () => Promise<{ versions: Array<{ id: string; url: string }> }>;
      install: (type: 'client', versionMeta: { id: string; url: string }, minecraftLocation: string) => Promise<unknown>;
      installDependencies: (resolvedVersion: unknown) => Promise<unknown>;
    };
    ForgeInstaller: {
      install: (
        version: { version: string; mcversion: string },
        minecraftLocation: string,
        options: { java: string }
      ) => Promise<string>;
    };
  };
  core: {
    Version: {
      parse: (minecraftLocation: string, version: string) => Promise<unknown>;
    };
    launch: (options: Record<string, unknown>) => Promise<{ pid?: number }>;
  };
  resolveJavaExecutable?: (javaMajor: number) => Promise<string>;
  runForgeInstallerJar?: (options: {
    minecraftLocation: string;
    minecraftVersion: string;
    loaderVersion: string;
    javaPath: string;
  }) => Promise<string>;
}

const defaultInstallStepTimeoutMs = 10 * 60 * 1000;

async function withInstallTimeout<T>(work: Promise<T>, label: string, timeoutMs: number): Promise<T> {
  if (timeoutMs <= 0) return work;

  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      work,
      new Promise<T>((_resolve, reject) => {
        timeout = setTimeout(() => reject(new Error(`${label} timed out after ${Math.round(timeoutMs / 1000)} seconds.`)), timeoutMs);
      })
    ]);
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

function isMissingForgeJarEntry(error: unknown): boolean {
  return error instanceof Error && /missing forge jar entry/i.test(error.message);
}

async function ensureLauncherProfiles(minecraftLocation: string): Promise<void> {
  const launcherProfilesPath = join(minecraftLocation, 'launcher_profiles.json');
  if (existsSync(launcherProfilesPath)) return;

  await mkdir(minecraftLocation, { recursive: true });
  await writeFile(
    launcherProfilesPath,
    `${JSON.stringify({ profiles: {}, selectedProfile: '', clientToken: 'beforebedtime-launcher' }, null, 2)}\n`
  );
}

function appendLimitedOutput(current: string, next: Buffer): string {
  const combined = current + next.toString('utf8');
  return combined.length > 8000 ? combined.slice(combined.length - 8000) : combined;
}

async function runForgeInstallerJar({
  minecraftLocation,
  minecraftVersion,
  loaderVersion,
  javaPath
}: {
  minecraftLocation: string;
  minecraftVersion: string;
  loaderVersion: string;
  javaPath: string;
}): Promise<string> {
  await ensureLauncherProfiles(minecraftLocation);

  const forgeVersion = `${minecraftVersion}-${loaderVersion}`;
  const installerJar = join(
    minecraftLocation,
    'libraries',
    'net',
    'minecraftforge',
    'forge',
    forgeVersion,
    `forge-${forgeVersion}-installer.jar`
  );

  if (!existsSync(installerJar)) {
    throw new Error(`Forge installer jar was not found at ${installerJar}.`);
  }

  await new Promise<void>((resolve, reject) => {
    const child = spawn(javaPath, ['-jar', installerJar, '--installClient', minecraftLocation], {
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe']
    });
    let output = '';
    child.stdout.on('data', (chunk: Buffer) => {
      output = appendLimitedOutput(output, chunk);
    });
    child.stderr.on('data', (chunk: Buffer) => {
      output = appendLimitedOutput(output, chunk);
    });
    child.once('error', reject);
    child.once('exit', (code) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(`Forge installer exited with code ${code ?? 'unknown'}.${output ? `\n${output}` : ''}`));
    });
  });

  return `${minecraftVersion}-forge-${loaderVersion}`;
}

export function createXmclLauncherFromModules(modules: XmclModuleSet): LauncherDependency {
  const resolveJava = modules.resolveJavaExecutable || resolveJavaExecutable;
  const installForgeWithJar = modules.runForgeInstallerJar || runForgeInstallerJar;

  return {
    async ensureInstalled(options) {
      const minecraftLocation = join(options.rootDir, 'minecraft');
      const javaPath = options.javaPath || (await resolveJava(options.javaMajor));
      const runtime = await inspectMinecraftRuntime({
        rootDir: options.rootDir,
        projectId: options.projectId,
        minecraftVersion: options.minecraftVersion,
        loaderVersion: options.loaderVersion,
        javaPath
      });
      if (runtime.complete) {
        if (!runtime.marker) {
          await writeRuntimeMarker({
            rootDir: options.rootDir,
            projectId: options.projectId,
            minecraftVersion: options.minecraftVersion,
            loaderVersion: options.loaderVersion,
            javaPath
          });
        }
        return { javaPath };
      }

      const versionList = await modules.installer.Installer.getVersionList();
      const vanillaVersion = versionList.versions.find((version) => version.id === options.minecraftVersion);
      if (!vanillaVersion) {
        throw new Error(`Minecraft ${options.minecraftVersion} was not found in the Mojang version manifest.`);
      }

      const timeoutMs = options.installStepTimeoutMs ?? defaultInstallStepTimeoutMs;
      options.onProgress?.({
        phase: 'INSTALLING_MINECRAFT',
        message: `Installing Minecraft ${options.minecraftVersion}`
      });
      await withInstallTimeout(
        modules.installer.Installer.install('client', vanillaVersion, minecraftLocation),
        'Minecraft install',
        timeoutMs
      );
      options.onProgress?.({
        phase: 'INSTALLING_FORGE',
        message: `Installing Forge ${options.loaderVersion}`
      });
      let forgeVersionId: string;
      try {
        forgeVersionId = await withInstallTimeout(
          modules.installer.ForgeInstaller.install(
            { version: options.loaderVersion, mcversion: options.minecraftVersion },
            minecraftLocation,
            { java: javaPath }
          ),
          'Forge install',
          timeoutMs
        );
      } catch (error) {
        if (!isMissingForgeJarEntry(error)) throw error;
        forgeVersionId = await withInstallTimeout(
          installForgeWithJar({
            minecraftLocation,
            minecraftVersion: options.minecraftVersion,
            loaderVersion: options.loaderVersion,
            javaPath
          }),
          'Forge installer jar',
          timeoutMs
        );
      }
      options.onProgress?.({
        phase: 'DOWNLOADING_LIBRARIES',
        message: 'Downloading Minecraft and Forge libraries'
      });
      const resolvedVersion = await withInstallTimeout(
        modules.core.Version.parse(minecraftLocation, forgeVersionId),
        'Minecraft version parse',
        timeoutMs
      );
      await withInstallTimeout(
        modules.installer.Installer.installDependencies(resolvedVersion),
        'Minecraft dependency install',
        timeoutMs
      );
      await writeRuntimeMarker({
        rootDir: options.rootDir,
        projectId: options.projectId,
        minecraftVersion: options.minecraftVersion,
        loaderVersion: options.loaderVersion,
        javaPath
      });

      return { javaPath };
    },
    async launchMinecraft(options) {
      if (!options.minecraftAccessToken) {
        throw new AuthServiceError('AUTH_REQUIRED', 'Login to Microsoft before launching Minecraft.');
      }
      const minecraftLocation = join(options.rootDir, 'minecraft');
      const version = `${options.minecraftVersion}-forge-${options.loaderVersion}`;
      const javaPath = options.javaPath || (await resolveJava(options.javaMajor));

      const child = await modules.core.launch({
        gamePath: options.projectDir,
        resourcePath: minecraftLocation,
        version,
        accessToken: options.minecraftAccessToken,
        gameProfile: {
          name: options.profile.name,
          id: options.profile.id
        },
        userType: 'msa',
        minMemory: options.memoryMb,
        maxMemory: options.memoryMb,
        resolution: options.fullscreen
          ? undefined
          : {
              width: options.width,
              height: options.height
            },
        javaPath,
        extraExecOption: {
          detached: true,
          stdio: 'ignore'
        }
      });
      return { pid: typeof child?.pid === 'number' ? child.pid : undefined };
    }
  };
}

export async function resolveJavaExecutable(javaMajor: number): Promise<string> {
  const executable = process.platform === 'win32' ? 'java.exe' : 'java';
  const javaHome = process.env.JAVA_HOME;
  if (javaHome) {
    const candidate = join(javaHome, 'bin', executable);
    if (existsSync(candidate)) {
      await assertJavaMajor(candidate, javaMajor);
      return candidate;
    }
  }

  const command = process.platform === 'win32' ? 'where.exe' : 'which';
  try {
    const { stdout } = await execFileAsync(command, ['java']);
    const javaPath = stdout.split(/\r?\n/).map((line) => line.trim()).find(Boolean);
    if (javaPath) {
      await assertJavaMajor(javaPath, javaMajor);
      return javaPath;
    }
  } catch {
    // Fall through to the clearer error below.
  }

  throw new Error(`Java ${javaMajor} was not found. Install Java ${javaMajor} or set JAVA_HOME before launching Northvale.`);
}

async function assertJavaMajor(javaPath: string, javaMajor: number): Promise<void> {
  const { stderr, stdout } = await execFileAsync(javaPath, ['-version']);
  const output = `${stderr}\n${stdout}`;
  const match = output.match(/version \"(?:(\d+)\.)?(\d+)/);
  if (!match) return;
  const major = match[1] === '1' ? Number(match[2]) : Number(match[1] || match[2]);
  if (major < javaMajor) {
    throw new Error(`Java ${javaMajor} is required, but ${javaPath} reports Java ${major}.`);
  }
}
