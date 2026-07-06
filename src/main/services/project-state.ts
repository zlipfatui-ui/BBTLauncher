import { existsSync } from 'node:fs';
import { lstat } from 'node:fs/promises';
import { join } from 'node:path';
import type { LauncherManifest, ProjectStateResult } from '../../shared/types.js';
import { sha256File } from './hash.js';
import {
  collectLocalOwnedFiles,
  isLauncherManagedProjectPath,
  isLauncherOwnedProjectPath
} from './managed-project-files.js';
import { assertInsideDirectory, normalizeProjectFilePath } from './path-safety.js';

export async function inspectProjectState(
  rootDir: string,
  projectId: string,
  manifest: LauncherManifest
): Promise<ProjectStateResult> {
  const project = manifest.projects.find((entry) => entry.id === projectId);
  if (!project) throw new Error(`Project not found in launcher manifest: ${projectId}`);

  const projectDir = join(rootDir, 'projects', projectId);
  const managedManifestFiles = project.files.filter((file) => isLauncherManagedProjectPath(file.path));
  const localFiles = existsSync(projectDir) ? await collectLocalOwnedFiles(projectDir) : [];
  const localFileSet = new Set(localFiles);

  if (localFiles.length === 0) {
    return {
      state: 'install',
      missing: managedManifestFiles.length,
      changed: 0,
      stale: 0
    };
  }

  let missing = 0;
  let changed = 0;
  for (const file of managedManifestFiles) {
    const safePath = normalizeProjectFilePath(file.path);
    const destination = assertInsideDirectory(projectDir, join(projectDir, safePath));
    if (isLauncherOwnedProjectPath(safePath)) {
      localFileSet.delete(safePath);
    }

    if (!existsSync(destination)) {
      missing += 1;
      continue;
    }

    const fileStat = await lstat(destination);
    if (
      !fileStat.isFile() ||
      fileStat.size !== file.size ||
      (await sha256File(destination)) !== file.sha256.toUpperCase()
    ) {
      changed += 1;
    }
  }

  const stale = localFileSet.size;
  return {
    state: missing > 0 || changed > 0 || stale > 0 ? 'update' : 'ready',
    missing,
    changed,
    stale
  };
}
