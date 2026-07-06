import { existsSync } from 'node:fs';
import { readdir } from 'node:fs/promises';
import { join, relative } from 'node:path';
import { assertInsideDirectory, normalizeProjectFilePath } from './path-safety.js';

export const launcherOwnedProjectRoots = new Set(['mods', 'config', 'resourcepacks']);
export const launcherManagedProjectRoots = new Set([...launcherOwnedProjectRoots, 'shaderpacks']);

export function isLauncherOwnedProjectPath(filePath: string): boolean {
  const safePath = normalizeProjectFilePath(filePath);
  return launcherOwnedProjectRoots.has(safePath.split('/')[0]);
}

export function isLauncherManagedProjectPath(filePath: string): boolean {
  const safePath = normalizeProjectFilePath(filePath);
  return launcherManagedProjectRoots.has(safePath.split('/')[0]);
}

export async function collectLocalOwnedFiles(projectDir: string): Promise<string[]> {
  const files: string[] = [];

  async function walk(currentDir: string): Promise<void> {
    const entries = await readdir(currentDir, { withFileTypes: true });
    for (const entry of entries) {
      const absolutePath = assertInsideDirectory(projectDir, join(currentDir, entry.name));
      if (entry.isDirectory()) {
        await walk(absolutePath);
        continue;
      }

      if (entry.isFile() || entry.isSymbolicLink()) {
        const projectRelativePath = normalizeProjectFilePath(relative(projectDir, absolutePath).replaceAll('\\', '/'));
        if (isLauncherOwnedProjectPath(projectRelativePath)) {
          files.push(projectRelativePath);
        }
      }
    }
  }

  for (const rootName of launcherOwnedProjectRoots) {
    const ownedRoot = assertInsideDirectory(projectDir, join(projectDir, rootName));
    if (existsSync(ownedRoot)) {
      await walk(ownedRoot);
    }
  }

  return files;
}
