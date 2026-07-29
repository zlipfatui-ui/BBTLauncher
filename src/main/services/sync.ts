import { existsSync } from 'node:fs';
import { lstat, mkdir, readFile, rename, rm, stat, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import type { LauncherFile, LauncherFileSyncMode, LauncherManifest, SyncResult } from '../../shared/types.js';
import { normalizeProjectFilePath, assertInsideDirectory } from './path-safety.js';
import { sha256Buffer, sha256File } from './hash.js';
import {
  isForbiddenProjectManifestPath,
  isIgnoredPlayerLocalProjectManifestPath,
  isLauncherManagedProjectPath
} from './managed-project-files.js';
import {
  effectiveManagedIndexSyncMode,
  effectiveSyncMode,
  isResourcePackPath,
  readManagedProjectIndex,
  type ManagedProjectIndex,
  type ManagedProjectFileRecord,
  writeManagedProjectIndex
} from './managed-project-index.js';
import {
  shouldBypassExistingProjectSync,
  shouldBypassPackAuthorManifestFile,
  shouldPreserveStaleManagedFile
} from './project-sync-policy.js';

export interface SyncProjectOptions {
  rootDir: string;
  projectId: string;
  manifest: LauncherManifest;
  baseUrl: string;
  fetchImpl?: typeof fetch;
  onProgress?: (progress: { file: string; downloadedBytes: number; totalBytes: number }) => void;
}

function findProject(manifest: LauncherManifest, projectId: string) {
  const project = manifest.projects.find((entry) => entry.id === projectId);
  if (!project) throw new Error(`Project not found in launcher manifest: ${projectId}`);
  return project;
}

async function isFileClean(destination: string, file: LauncherFile): Promise<boolean> {
  if (!existsSync(destination)) return false;
  const fileStat = await stat(destination);
  if (fileStat.size !== file.size) return false;
  return (await sha256File(destination)) === file.sha256.toUpperCase();
}

interface SyncManifestFile {
  file: LauncherFile;
  path: string;
  syncMode: LauncherFileSyncMode;
}

function syncManifestFiles(rootDir: string, projectId: string, files: LauncherFile[]): SyncManifestFile[] {
  const managedFiles: SyncManifestFile[] = [];
  for (const file of files) {
    const safePath = normalizeProjectFilePath(file.path);
    if (shouldBypassPackAuthorManifestFile(rootDir, projectId, safePath)) continue;
    if (isIgnoredPlayerLocalProjectManifestPath(safePath)) continue;
    if (!isLauncherManagedProjectPath(safePath) || isForbiddenProjectManifestPath(safePath)) {
      throw new Error(`Refusing to sync unmanaged or forbidden project file: ${safePath}`);
    }
    managedFiles.push({
      file,
      path: safePath,
      syncMode: effectiveSyncMode(rootDir, file)
    });
  }
  return managedFiles;
}

function resolveProjectFile(rootDir: string, projectId: string, safePath: string): string {
  if (!isLauncherManagedProjectPath(safePath) || isForbiddenProjectManifestPath(safePath)) {
    throw new Error(`Refusing to sync unmanaged or forbidden project file: ${safePath}`);
  }
  return assertInsideDirectory(join(rootDir, 'projects', projectId), join(rootDir, 'projects', projectId, safePath));
}

async function isRegularFile(destination: string): Promise<boolean> {
  try {
    const fileStat = await lstat(destination);
    return fileStat.isFile() && !fileStat.isSymbolicLink();
  } catch {
    return false;
  }
}

async function isManifestFileClean(
  destination: string,
  file: LauncherFile,
  syncMode: LauncherFileSyncMode,
  disabledDestination?: string,
  previouslySeeded = false
): Promise<boolean> {
  if (disabledDestination) {
    if (await isRegularFile(destination)) return true;
    if (await isRegularFile(disabledDestination)) return true;
    return previouslySeeded;
  }
  if (!existsSync(destination)) return false;
  if (syncMode === 'seed') {
    const fileStat = await stat(destination);
    return fileStat.isFile();
  }
  return isFileClean(destination, file);
}

async function removeStaleManagedRequiredFiles(
  rootDir: string,
  projectId: string,
  manifestFiles: SyncManifestFile[],
  managedIndex: ManagedProjectIndex
): Promise<void> {
  const projectDir = join(rootDir, 'projects', projectId);
  if (!existsSync(projectDir)) return;

  const expectedFiles = new Set(
    manifestFiles.filter((file) => file.syncMode === 'required').map((file) => file.path)
  );

  for (const localFile of managedIndex.files) {
    if (shouldPreserveStaleManagedFile(projectId, localFile.path)) continue;
    if (effectiveManagedIndexSyncMode(rootDir, localFile) === 'required' && !expectedFiles.has(localFile.path)) {
      await rm(assertInsideDirectory(projectDir, join(projectDir, localFile.path)), { force: true });
    }
  }
}

async function responseBytes(response: Response): Promise<Buffer> {
  const arrayBuffer = await response.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

export async function syncProject({
  rootDir,
  projectId,
  manifest,
  baseUrl,
  fetchImpl = fetch,
  onProgress
}: SyncProjectOptions): Promise<SyncResult> {
  const project = findProject(manifest, projectId);
  if (shouldBypassExistingProjectSync(rootDir, projectId)) {
    return {
      status: 'ready',
      downloaded: 0,
      skipped: 0,
      totalBytes: 0,
      downloadedBytes: 0
    };
  }
  let skipped = 0;
  const pendingFiles: Array<{ file: LauncherFile; path: string; syncMode: LauncherFileSyncMode; destination: string }> = [];
  const manifestFiles = syncManifestFiles(rootDir, projectId, project.files);
  const managedIndex = await readManagedProjectIndex(rootDir, projectId);
  const previouslyManagedPaths = new Set(managedIndex.files.map((file) => file.path));

  for (const { file, path: safePath, syncMode } of manifestFiles) {
    const destination = resolveProjectFile(rootDir, projectId, safePath);
    const isResourcePack = isResourcePackPath(safePath);
    const disabledDestination = isResourcePack
      ? assertInsideDirectory(
          join(rootDir, 'projects', projectId),
          join(rootDir, 'projects', projectId, `${safePath}.disabled`)
        )
      : undefined;
    if (await isManifestFileClean(
      destination,
      file,
      syncMode,
      disabledDestination,
      isResourcePack && previouslyManagedPaths.has(safePath)
    )) {
      skipped += 1;
    } else {
      pendingFiles.push({ file, path: safePath, syncMode, destination });
    }
  }

  const totalBytes = pendingFiles.reduce((total, entry) => total + entry.file.size, 0);
  let downloaded = 0;
  let downloadedBytes = 0;

  for (const { file, path: safePath, destination } of pendingFiles) {
    const requestUrl = new URL(file.url, baseUrl).toString();
    const response = await fetchImpl(requestUrl);
    if (!response.ok) throw new Error(`Failed to download ${file.path}: HTTP ${response.status}`);

    const bytes = await responseBytes(response);
    const actualHash = sha256Buffer(bytes);
    if (bytes.byteLength !== file.size || actualHash !== file.sha256.toUpperCase()) {
      throw new Error(`Downloaded file failed SHA256 verification: ${file.path}`);
    }

    const tempPath = assertInsideDirectory(join(rootDir, 'tmp'), join(rootDir, 'tmp', projectId, safePath));
    await mkdir(dirname(tempPath), { recursive: true });
    await writeFile(tempPath, bytes);
    await readFile(tempPath);

    await mkdir(dirname(destination), { recursive: true });
    await rm(destination, { force: true });
    await rename(tempPath, destination);

    downloaded += 1;
    downloadedBytes += bytes.byteLength;
    onProgress?.({ file: file.path, downloadedBytes, totalBytes });
  }

  await removeStaleManagedRequiredFiles(rootDir, projectId, manifestFiles, managedIndex);

  const indexRecords: ManagedProjectFileRecord[] = [];
  for (const { file, path: safePath, syncMode } of manifestFiles) {
    const destination = resolveProjectFile(rootDir, projectId, safePath);
    const isResourcePack = isResourcePackPath(safePath);
    const disabledDestination = isResourcePack
      ? assertInsideDirectory(
          join(rootDir, 'projects', projectId),
          join(rootDir, 'projects', projectId, `${safePath}.disabled`)
        )
      : undefined;
    const preserveResourcePackSeed = isResourcePack && (
      previouslyManagedPaths.has(safePath) || Boolean(disabledDestination && await isRegularFile(disabledDestination))
    );
    if (existsSync(destination) || preserveResourcePackSeed) {
      indexRecords.push({
        path: safePath,
        syncMode,
        sha256: file.sha256,
        size: file.size
      });
    }
  }
  await writeManagedProjectIndex(rootDir, projectId, indexRecords);

  return {
    status: 'ready',
    downloaded,
    skipped,
    totalBytes,
    downloadedBytes
  };
}
