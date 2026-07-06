import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import type { LauncherSettings } from '../../shared/types.js';
import { NORTHVALE_PROJECT_ID } from '../../shared/types.js';

const settingsFileName = 'settings.json';

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
    selectedProject: value.selectedProject === NORTHVALE_PROJECT_ID ? NORTHVALE_PROJECT_ID : defaults.selectedProject
  };
}

export async function loadSettings(rootDir = resolveLauncherRoot()): Promise<LauncherSettings> {
  const filePath = join(rootDir, settingsFileName);
  if (!existsSync(filePath)) return defaultSettings(rootDir);

  const raw = await readFile(filePath, 'utf8');
  return normalizeSettings(rootDir, JSON.parse(raw) as Partial<LauncherSettings>);
}

export async function saveSettings(
  rootDir = resolveLauncherRoot(),
  nextSettings: Partial<LauncherSettings>
): Promise<LauncherSettings> {
  const settings = normalizeSettings(rootDir, nextSettings);
  await mkdir(rootDir, { recursive: true });
  await writeFile(join(rootDir, settingsFileName), `${JSON.stringify(settings, null, 2)}\n`);
  return settings;
}

export function getRuntimeRoot(settings: LauncherSettings): string {
  return settings.appDirectory;
}
