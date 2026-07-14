import { existsSync } from 'node:fs';
import { lstat } from 'node:fs/promises';
import { join } from 'node:path';
import type { LauncherFile, LauncherFileSyncMode, LauncherManifest, ProjectStateResult } from '../../shared/types.js';
import { sha256File } from './hash.js';
import {
  isForbiddenProjectManifestPath,
  isIgnoredPlayerLocalProjectManifestPath,
  isLauncherManagedProjectPath
} from './managed-project-files.js';
import {
  effectiveManagedIndexSyncMode,
  effectiveSyncMode,
  isPackAuthorModBypassPath,
  isResourcePackPath,
  readManagedProjectIndex
} from './managed-project-index.js';
import { assertInsideDirectory, normalizeProjectFilePath } from './path-safety.js';

interface ManagedManifestFile {
  file: LauncherFile;
  path: string;
  syncMode: LauncherFileSyncMode;
}

function managedManifestFiles(rootDir: string, files: LauncherFile[]): ManagedManifestFile[] {
  const managedFiles: ManagedManifestFile[] = [];
  for (const file of files) {
    const safePath = normalizeProjectFilePath(file.path);
    if (isPackAuthorModBypassPath(rootDir, safePath)) continue;
    if (isIgnoredPlayerLocalProjectManifestPath(safePath)) continue;
    if (!isLauncherManagedProjectPath(safePath) || isForbiddenProjectManifestPath(safePath)) {
      throw new Error(`Refusing to inspect unmanaged or forbidden project file: ${safePath}`);
    }
    managedFiles.push({
      file,
      path: safePath,
      syncMode: effectiveSyncMode(rootDir, file)
    });
  }
  return managedFiles;
}

export async function inspectProjectState(
  rootDir: string,
  projectId: string,
  manifest: LauncherManifest
): Promise<ProjectStateResult> {
  const project = manifest.projects.find((entry) => entry.id === projectId);
  if (!project) throw new Error(`Project not found in launcher manifest: ${projectId}`);

  const projectDir = join(rootDir, 'projects', projectId);
  const projectManifestFiles = managedManifestFiles(rootDir, project.files);

  if (!existsSync(projectDir)) {
    return {
      state: 'install',
      missing: projectManifestFiles.length,
      changed: 0,
      stale: 0
    };
  }

  let missing = 0;
  let changed = 0;
  const managedIndex = await readManagedProjectIndex(rootDir, projectId);
  const previouslyManagedPaths = new Set(managedIndex.files.map((file) => file.path));
  for (const { file, path: safePath, syncMode } of projectManifestFiles) {
    const destination = assertInsideDirectory(projectDir, join(projectDir, safePath));

    if (isResourcePackPath(safePath)) {
      const disabledDestination = assertInsideDirectory(projectDir, join(projectDir, `${safePath}.disabled`));
      const activeFile = existsSync(destination) ? await lstat(destination) : null;
      const disabledFile = existsSync(disabledDestination) ? await lstat(disabledDestination) : null;
      const activeIsRegular = Boolean(activeFile?.isFile() && !activeFile.isSymbolicLink());
      const disabledIsRegular = Boolean(disabledFile?.isFile() && !disabledFile.isSymbolicLink());
      if (activeIsRegular || disabledIsRegular || previouslyManagedPaths.has(safePath)) continue;
      missing += 1;
      continue;
    }

    if (!existsSync(destination)) {
      missing += 1;
      continue;
    }

    if (syncMode === 'seed') continue;

    const fileStat = await lstat(destination);
    if (
      !fileStat.isFile() ||
      fileStat.size !== file.size ||
      (await sha256File(destination)) !== file.sha256.toUpperCase()
    ) {
      changed += 1;
    }
  }

  const requiredManifestPaths = new Set(
    projectManifestFiles.filter((entry) => entry.syncMode === 'required').map((entry) => entry.path)
  );
  let stale = 0;
  for (const file of managedIndex.files) {
    if (effectiveManagedIndexSyncMode(rootDir, file) !== 'required') continue;
    if (requiredManifestPaths.has(file.path)) continue;
    if (existsSync(assertInsideDirectory(projectDir, join(projectDir, file.path)))) {
      stale += 1;
    }
  }

  return {
    state: missing > 0 || changed > 0 || stale > 0 ? 'update' : 'ready',
    missing,
    changed,
    stale
  };
}
