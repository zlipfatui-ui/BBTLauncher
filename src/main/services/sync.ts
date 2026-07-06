import { existsSync } from 'node:fs';
import { mkdir, readFile, rename, rm, stat, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import type { LauncherFile, LauncherManifest, SyncResult } from '../../shared/types.js';
import { normalizeProjectFilePath, assertInsideDirectory } from './path-safety.js';
import { sha256Buffer, sha256File } from './hash.js';
import {
  collectLocalOwnedFiles,
  isForbiddenProjectManifestPath,
  isLauncherManagedProjectPath,
  isLauncherOwnedProjectPath
} from './managed-project-files.js';

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

function resolveProjectFile(rootDir: string, projectId: string, filePath: string): string {
  const safePath = normalizeProjectFilePath(filePath);
  if (!isLauncherManagedProjectPath(safePath) || isForbiddenProjectManifestPath(safePath)) {
    throw new Error(`Refusing to sync unmanaged or forbidden project file: ${safePath}`);
  }
  return assertInsideDirectory(join(rootDir, 'projects', projectId), join(rootDir, 'projects', projectId, safePath));
}

async function removeStaleLauncherOwnedFiles(rootDir: string, projectId: string, manifestFiles: LauncherFile[]): Promise<void> {
  const projectDir = join(rootDir, 'projects', projectId);
  if (!existsSync(projectDir)) return;

  const expectedFiles = new Set(
    manifestFiles.map((file) => normalizeProjectFilePath(file.path)).filter(isLauncherOwnedProjectPath)
  );
  const localFiles = await collectLocalOwnedFiles(projectDir);

  for (const localFile of localFiles) {
    if (!expectedFiles.has(localFile)) {
      await rm(assertInsideDirectory(projectDir, join(projectDir, localFile)), { force: true });
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
  let skipped = 0;
  const pendingFiles: Array<{ file: LauncherFile; destination: string }> = [];

  for (const file of project.files) {
    const destination = resolveProjectFile(rootDir, projectId, file.path);
    if (await isFileClean(destination, file)) {
      skipped += 1;
    } else {
      pendingFiles.push({ file, destination });
    }
  }

  const totalBytes = pendingFiles.reduce((total, entry) => total + entry.file.size, 0);
  let downloaded = 0;
  let downloadedBytes = 0;

  for (const { file, destination } of pendingFiles) {
    const requestUrl = new URL(file.url, baseUrl).toString();
    const response = await fetchImpl(requestUrl);
    if (!response.ok) throw new Error(`Failed to download ${file.path}: HTTP ${response.status}`);

    const bytes = await responseBytes(response);
    const actualHash = sha256Buffer(bytes);
    if (bytes.byteLength !== file.size || actualHash !== file.sha256.toUpperCase()) {
      throw new Error(`Downloaded file failed SHA256 verification: ${file.path}`);
    }

    const tempPath = assertInsideDirectory(join(rootDir, 'tmp'), join(rootDir, 'tmp', projectId, file.path));
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

  await removeStaleLauncherOwnedFiles(rootDir, projectId, project.files);

  return {
    status: 'ready',
    downloaded,
    skipped,
    totalBytes,
    downloadedBytes
  };
}
