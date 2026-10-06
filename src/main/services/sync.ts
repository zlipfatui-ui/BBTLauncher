import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { lstat, mkdir, open, rename, rm, stat } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import type { LauncherFile, LauncherFileSyncMode, LauncherManifest, SyncResult } from '../../shared/types.js';
import { normalizeProjectFilePath, assertInsideDirectory } from './path-safety.js';
import { sha256File } from './hash.js';
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
  retiredSaiNamMigrationPaths,
  shouldBypassExistingProjectSync,
  shouldBypassPackAuthorManifestFile
} from './project-sync-policy.js';

export interface SyncProjectOptions {
  rootDir: string;
  projectId: string;
  manifest: LauncherManifest;
  baseUrl: string;
  fetchImpl?: typeof fetch;
  /** Abandon a download that receives no bytes for this long. */
  stallTimeoutMs?: number;
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
    // Player-owned roots (shaderpacks) only accept seed entries: installed if missing, never overwritten or pruned.
    const playerLocal = isIgnoredPlayerLocalProjectManifestPath(safePath);
    if (playerLocal && file.syncMode !== 'seed') continue;
    if ((!playerLocal && !isLauncherManagedProjectPath(safePath)) || isForbiddenProjectManifestPath(safePath)) {
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
  // Seed-only player roots were already filtered in syncManifestFiles.
  const managed = isLauncherManagedProjectPath(safePath) || isIgnoredPlayerLocalProjectManifestPath(safePath);
  if (!managed || isForbiddenProjectManifestPath(safePath)) {
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
    if (effectiveManagedIndexSyncMode(rootDir, localFile) === 'required' && !expectedFiles.has(localFile.path)) {
      await rm(assertInsideDirectory(projectDir, join(projectDir, localFile.path)), { force: true });
    }
  }
}

async function removeRetiredSaiNamMigrationFiles(
  rootDir: string,
  projectId: string,
  manifestFiles: SyncManifestFile[]
): Promise<void> {
  const projectDir = join(rootDir, 'projects', projectId);
  if (!existsSync(projectDir)) return;
  const expectedFiles = new Set(manifestFiles.map((file) => file.path));

  for (const retiredPath of retiredSaiNamMigrationPaths(projectId)) {
    const safePath = normalizeProjectFilePath(retiredPath);
    if (expectedFiles.has(safePath)) continue;
    await rm(assertInsideDirectory(projectDir, join(projectDir, safePath)), { force: true });
  }
}

/** A download that makes no progress for this long is abandoned instead of hanging the whole launcher. */
const DOWNLOAD_STALL_MS = 30_000;

/** Streams a response to disk, hashing as it goes so large mods are never held in memory. */
async function downloadVerified(
  fetchImpl: typeof fetch,
  requestUrl: string,
  file: LauncherFile,
  tempPath: string,
  stallMs: number,
  onBytes: (bytes: number) => void
): Promise<number> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const arm = () => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => controller.abort(), stallMs);
  };
  await mkdir(dirname(tempPath), { recursive: true });
  const hash = createHash('sha256');
  let received = 0;
  try {
    arm();
    const response = await fetchImpl(requestUrl, { signal: controller.signal });
    if (!response.ok) throw new Error(`Failed to download ${file.path}: HTTP ${response.status}`);
    const handle = await open(tempPath, 'w');
    try {
      if (response.body) {
        const reader = response.body.getReader();
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          arm();
          hash.update(value);
          await handle.write(value);
          received += value.byteLength;
          onBytes(value.byteLength);
        }
      }
    } finally {
      await handle.close();
    }
  } catch (error) {
    await rm(tempPath, { force: true });
    if (controller.signal.aborted) throw new Error(`Download stalled: ${file.path}`);
    throw error;
  } finally {
    if (timer) clearTimeout(timer);
  }
  if (received !== file.size || hash.digest('hex').toUpperCase() !== file.sha256.toUpperCase()) {
    await rm(tempPath, { force: true });
    throw new Error(`Downloaded file failed SHA256 verification: ${file.path}`);
  }
  return received;
}

export async function syncProject({
  rootDir,
  projectId,
  manifest,
  baseUrl,
  fetchImpl = fetch,
  stallTimeoutMs = DOWNLOAD_STALL_MS,
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
  // A deleted project is a reinstall: its old seed history must not suppress
  // resource packs which no longer exist alongside the rest of the pack.
  const hasProjectDirectory = existsSync(join(rootDir, 'projects', projectId));
  const managedIndex = hasProjectDirectory
    ? await readManagedProjectIndex(rootDir, projectId)
    : { version: 1 as const, files: [] };
  if (!hasProjectDirectory) await writeManagedProjectIndex(rootDir, projectId, []);
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
    const tempPath = assertInsideDirectory(join(rootDir, 'tmp'), join(rootDir, 'tmp', projectId, safePath));
    await downloadVerified(fetchImpl, requestUrl, file, tempPath, stallTimeoutMs, (bytes) => {
      downloadedBytes += bytes;
      onProgress?.({ file: file.path, downloadedBytes, totalBytes });
    });

    await mkdir(dirname(destination), { recursive: true });
    await rm(destination, { force: true });
    await rename(tempPath, destination);

    downloaded += 1;
  }

  await removeStaleManagedRequiredFiles(rootDir, projectId, manifestFiles, managedIndex);
  await removeRetiredSaiNamMigrationFiles(rootDir, projectId, manifestFiles);

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
