import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { homedir } from 'node:os';
import type { LauncherSettings } from '../../shared/types.js';
import { isProjectId, NORTHVALE_PROJECT_ID } from '../../shared/types.js';

const settingsFileName = 'settings.json';
const pendingSaves = new Map<string, Promise<LauncherSettings>>();

export function resolveLauncherRoot(appData = process.env.APPDATA): string {
  return join(appData || join(homedir(), 'AppData', 'Roaming'), '.beforebedtime-launcher');
}

export function defaultSettings(rootDir = resolveLauncherRoot()): LauncherSettings {
  return {
    appDirectory: rootDir,
    width: 1280,
    height: 720,
    fullscreen: false,
    memoryMb: 8192,
    selectedProject: NORTHVALE_PROJECT_ID
  };
}

function normalizeSettings(rootDir: string, value: Partial<LauncherSettings>): LauncherSettings {
  const defaults = defaultSettings(rootDir);
  return {
    appDirectory: typeof value.appDirectory === 'string' && value.appDirectory ? value.appDirectory : defaults.appDirectory,
    width: Number.isFinite(value.width) ? Math.max(640, Math.floor(Number(value.width))) : defaults.width,
    height: Number.isFinite(value.height) ? Math.max(480, Math.floor(Number(value.height))) : defaults.height,
    fullscreen: Boolean(value.fullscreen),
    memoryMb: Number.isFinite(value.memoryMb) ? Math.max(1024, Math.floor(Number(value.memoryMb))) : defaults.memoryMb,
    selectedProject: isProjectId(value.selectedProject) ? value.selectedProject : defaults.selectedProject
  };
}

export async function loadSettings(rootDir = resolveLauncherRoot()): Promise<LauncherSettings> {
  const filePath = join(rootDir, settingsFileName);
  if (!existsSync(filePath)) return defaultSettings(rootDir);

  const raw = await readFile(filePath, 'utf8');
  return normalizeSettings(rootDir, JSON.parse(raw) as Partial<LauncherSettings>);
}

export function saveSettings(
  rootDir = resolveLauncherRoot(),
  nextSettings: Partial<LauncherSettings>,
  prepare?: (current: LauncherSettings, proposed: LauncherSettings) => Promise<void>
): Promise<LauncherSettings> {
  const root = resolve(rootDir);
  const key = process.platform === 'win32' ? root.toLowerCase() : root;
  const patch = { ...nextSettings };
  // Project selection and the settings panel both send partial updates.
  // Serialize their read/merge/write operations so neither can reset the other.
  const pending = (pendingSaves.get(key) ?? Promise.resolve()).catch(() => undefined).then(async () => {
    const current = await loadSettings(root);
    const settings = normalizeSettings(root, { ...current, ...patch });
    await prepare?.(current, settings);
    await mkdir(root, { recursive: true });
    const temporaryPath = join(root, `${settingsFileName}.${randomUUID()}.tmp`);
    try {
      await writeFile(temporaryPath, `${JSON.stringify(settings, null, 2)}\n`, { flag: 'wx' });
      // Readers always see a complete settings file, even during a save.
      await rename(temporaryPath, join(root, settingsFileName));
    } finally {
      await rm(temporaryPath, { force: true });
    }
    return settings;
  });
  pendingSaves.set(key, pending);
  const clearPending = () => {
    if (pendingSaves.get(key) === pending) pendingSaves.delete(key);
  };
  void pending.then(clearPending, clearPending);
  return pending;
}

export function getRuntimeRoot(settings: LauncherSettings): string {
  return settings.appDirectory;
}
