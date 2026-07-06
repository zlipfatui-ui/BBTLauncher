import { existsSync } from 'node:fs';
import { readdir } from 'node:fs/promises';
import { join, relative } from 'node:path';
import { assertInsideDirectory, normalizeProjectFilePath } from './path-safety.js';

export const launcherManagedProjectRoots = new Set([
  'mods',
  'config',
  'resourcepacks',
  'fancymenu_data',
  'immersive_paintings',
  'immersive_paintings_cache'
]);
const rootManagedProjectFiles = new Set(['options.txt']);
const playerLocalManifestRoots = new Set(['shaderpacks']);
const forbiddenProjectPathSegments = new Set([
  'saves',
  'logs',
  'screenshots',
  'crash-reports',
  'cache',
  'caches',
  'tmp',
  'temp',
  'temporary',
  'dev'
]);
const allowedOptionsPaths = new Set(['options.txt', 'config/fancymenu/options.txt']);
const forbiddenPrivateFilePattern = /(^|[/\\]).*(?:\.bak|backup|token|session|account).*$/i;

export function isIgnoredPlayerLocalProjectManifestPath(filePath: string): boolean {
  const safePath = normalizeProjectFilePath(filePath);
  return playerLocalManifestRoots.has(safePath.split('/')[0]);
}

export function isLauncherManagedProjectPath(filePath: string): boolean {
  const safePath = normalizeProjectFilePath(filePath);
  return rootManagedProjectFiles.has(safePath) || launcherManagedProjectRoots.has(safePath.split('/')[0]);
}

export function isForbiddenProjectManifestPath(filePath: string): boolean {
  const safePath = normalizeProjectFilePath(filePath);
  const segments = safePath.split('/');
  const lowerPath = safePath.toLowerCase();
  const fileName = segments.at(-1)?.toLowerCase();
  if (fileName === 'options.txt' && !allowedOptionsPaths.has(lowerPath)) return true;

  return segments.some((segment) => {
    const lowerSegment = segment.toLowerCase();
    return forbiddenProjectPathSegments.has(lowerSegment) || lowerSegment.startsWith('_disabled_');
  })
    || forbiddenPrivateFilePattern.test(safePath);
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
        if (isLauncherManagedProjectPath(projectRelativePath)) {
          files.push(projectRelativePath);
        }
      }
    }
  }

  for (const rootName of launcherManagedProjectRoots) {
    const ownedRoot = assertInsideDirectory(projectDir, join(projectDir, rootName));
    if (existsSync(ownedRoot)) {
      await walk(ownedRoot);
    }
  }

  for (const fileName of rootManagedProjectFiles) {
    const rootFile = assertInsideDirectory(projectDir, join(projectDir, fileName));
    if (existsSync(rootFile)) {
      files.push(fileName);
    }
  }

  return files;
}
