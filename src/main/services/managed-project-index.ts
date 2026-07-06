import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import type { LauncherFile, LauncherFileSyncMode } from '../../shared/types.js';
import { assertInsideDirectory, normalizeProjectFilePath } from './path-safety.js';

export interface ManagedProjectFileRecord {
  path: string;
  syncMode: LauncherFileSyncMode;
  sha256?: string;
  size?: number;
}

export interface ManagedProjectIndex {
  version: 1;
  files: ManagedProjectFileRecord[];
}

function indexPath(rootDir: string, projectId: string): string {
  return assertInsideDirectory(rootDir, join(rootDir, 'metadata', projectId, 'managed-files.json'));
}

export function declaredSyncMode(file: LauncherFile): LauncherFileSyncMode {
  return file.syncMode || 'required';
}

export function isPackAuthorMode(rootDir: string): boolean {
  return existsSync(assertInsideDirectory(rootDir, join(rootDir, '.bbt-pack-author')));
}

export function isFancyMenuPath(filePath: string): boolean {
  const safePath = normalizeProjectFilePath(filePath).toLowerCase();
  return safePath.startsWith('config/fancymenu/') || safePath.startsWith('fancymenu_data/');
}

export function effectiveSyncMode(rootDir: string, file: LauncherFile): LauncherFileSyncMode {
  if (isPackAuthorMode(rootDir) && isFancyMenuPath(file.path)) return 'seed';
  return declaredSyncMode(file);
}

export function effectiveManagedIndexSyncMode(rootDir: string, file: ManagedProjectFileRecord): LauncherFileSyncMode {
  if (isPackAuthorMode(rootDir) && isFancyMenuPath(file.path)) return 'seed';
  return file.syncMode === 'seed' ? 'seed' : 'required';
}

export async function readManagedProjectIndex(rootDir: string, projectId: string): Promise<ManagedProjectIndex> {
  const filePath = indexPath(rootDir, projectId);
  if (!existsSync(filePath)) return { version: 1, files: [] };

  const parsed = JSON.parse(await readFile(filePath, 'utf8')) as Partial<ManagedProjectIndex>;
  const files = Array.isArray(parsed.files) ? parsed.files : [];
  return {
    version: 1,
    files: files
      .map((file) => {
        const syncMode: LauncherFileSyncMode = file.syncMode === 'seed' ? 'seed' : 'required';
        return {
          path: normalizeProjectFilePath(String(file.path)),
          syncMode,
          sha256: typeof file.sha256 === 'string' ? file.sha256 : undefined,
          size: typeof file.size === 'number' ? file.size : undefined
        };
      })
      .filter((file) => file.path)
  };
}

export async function writeManagedProjectIndex(
  rootDir: string,
  projectId: string,
  files: ManagedProjectFileRecord[]
): Promise<ManagedProjectIndex> {
  const normalizedFiles = files
    .map((file) => {
      const syncMode: LauncherFileSyncMode = file.syncMode === 'seed' ? 'seed' : 'required';
      return {
        ...file,
        path: normalizeProjectFilePath(file.path),
        syncMode
      };
    })
    .sort((a, b) => a.path.localeCompare(b.path, undefined, { numeric: true }));
  const index: ManagedProjectIndex = { version: 1, files: normalizedFiles };
  const filePath = indexPath(rootDir, projectId);
  await mkdir(dirname(filePath), { recursive: true });
  await writeFile(filePath, `${JSON.stringify(index, null, 2)}\n`);
  return index;
}
