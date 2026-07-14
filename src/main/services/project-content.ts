import { constants, existsSync } from 'node:fs';
import { access, copyFile, lstat, mkdir, readdir, rename, rm, stat } from 'node:fs/promises';
import { basename, extname, join, resolve } from 'node:path';
import type {
  LauncherManifest,
  ProjectContentEntry,
  ProjectContentImportResult,
  ProjectContentKind,
  ProjectContentListResult,
  ProjectContentRejection
} from '../../shared/types.js';
import { NORTHVALE_PROJECT_ID } from '../../shared/types.js';
import { readManagedProjectIndex } from './managed-project-index.js';
import { assertInsideDirectory, normalizeProjectFilePath } from './path-safety.js';

const allowedExtensions: Record<ProjectContentKind, string> = {
  mods: '.jar',
  resourcepacks: '.zip',
  shaderpacks: '.zip'
};

interface ContentContext {
  rootDir: string;
  projectId: string;
  kind: ProjectContentKind;
  manifest?: LauncherManifest | null;
}

interface ManagedClassification {
  paths: Set<string>;
  available: boolean;
}

interface ImportCandidate {
  sourcePath: string;
  destination: string;
  relativePath: string;
  name: string;
}

function assertSupportedProject(projectId: string): void {
  if (projectId !== NORTHVALE_PROJECT_ID) {
    throw new Error(`Project content is not supported for: ${projectId}`);
  }
}

function assertSupportedKind(kind: ProjectContentKind): void {
  if (!(kind in allowedExtensions)) throw new Error(`Unsupported project content kind: ${kind}`);
}

function projectDirectory(rootDir: string, projectId: string): string {
  assertSupportedProject(projectId);
  return assertInsideDirectory(rootDir, join(rootDir, 'projects', projectId));
}

function contentDirectory(rootDir: string, projectId: string, kind: ProjectContentKind): string {
  assertSupportedKind(kind);
  const projectDir = projectDirectory(rootDir, projectId);
  return assertInsideDirectory(projectDir, join(projectDir, kind));
}

function managedIndexFile(rootDir: string, projectId: string): string {
  return assertInsideDirectory(rootDir, join(rootDir, 'metadata', projectId, 'managed-files.json'));
}

function normalizedKey(value: string): string {
  return normalizeProjectFilePath(value).toLowerCase();
}

function sameAbsolutePath(left: string, right: string): boolean {
  const leftPath = resolve(left);
  const rightPath = resolve(right);
  return process.platform === 'win32'
    ? leftPath.toLowerCase() === rightPath.toLowerCase()
    : leftPath === rightPath;
}

async function classifyManagedPaths(
  rootDir: string,
  projectId: string,
  manifest?: LauncherManifest | null
): Promise<ManagedClassification> {
  const paths = new Set<string>();
  const indexExists = existsSync(managedIndexFile(rootDir, projectId));
  let indexAvailable = false;
  if (indexExists) {
    try {
      const index = await readManagedProjectIndex(rootDir, projectId);
      for (const file of index.files) paths.add(normalizedKey(file.path));
      indexAvailable = true;
    } catch {
      indexAvailable = false;
    }
  }

  const project = manifest?.projects.find((entry) => entry.id === projectId);
  for (const file of project?.files ?? []) paths.add(normalizedKey(file.path));

  return {
    paths,
    available: Boolean(project) || indexAvailable
  };
}

function supportsFile(kind: ProjectContentKind, name: string): boolean {
  return extname(name).toLowerCase() === allowedExtensions[kind];
}

function entryFromStat(
  kind: ProjectContentKind,
  relativePath: string,
  name: string,
  fileStat: { size: number; mtime: Date },
  source: 'user' | 'managed'
): ProjectContentEntry {
  return {
    relativePath,
    name,
    kind,
    source,
    size: fileStat.size,
    modifiedAt: fileStat.mtime.toISOString(),
    canDelete: source === 'user'
  };
}

export async function listProjectContent({
  rootDir,
  projectId,
  kind,
  manifest
}: ContentContext): Promise<ProjectContentListResult> {
  const directory = contentDirectory(rootDir, projectId, kind);
  await mkdir(directory, { recursive: true });
  const classification = await classifyManagedPaths(rootDir, projectId, manifest);
  const entries = await readdir(directory, { withFileTypes: true });
  const result: ProjectContentEntry[] = [];

  for (const directoryEntry of entries) {
    if (!directoryEntry.isFile() || !supportsFile(kind, directoryEntry.name)) continue;
    const relativePath = normalizeProjectFilePath(`${kind}/${directoryEntry.name}`);
    const isManaged = classification.paths.has(normalizedKey(relativePath));

    if (kind === 'mods' && (isManaged || !classification.available)) continue;

    const source = kind === 'shaderpacks'
      ? 'user'
      : isManaged || (kind === 'resourcepacks' && !classification.available)
        ? 'managed'
        : 'user';
    const absolutePath = assertInsideDirectory(directory, join(directory, directoryEntry.name));
    const fileStat = await stat(absolutePath);
    result.push(entryFromStat(kind, relativePath, directoryEntry.name, fileStat, source));
  }

  result.sort((left, right) => left.name.localeCompare(right.name, undefined, { numeric: true, sensitivity: 'base' }));
  return { entries: result, classificationAvailable: kind === 'shaderpacks' || classification.available };
}

function rejection(
  name: string,
  reason: ProjectContentRejection['reason'],
  message: string
): ProjectContentRejection {
  return { name, reason, message };
}

export async function importProjectContent({
  rootDir,
  projectId,
  kind,
  manifest,
  sourcePaths,
  overwrite = false
}: ContentContext & { sourcePaths: string[]; overwrite?: boolean }): Promise<ProjectContentImportResult> {
  const directory = contentDirectory(rootDir, projectId, kind);
  await mkdir(directory, { recursive: true });
  const classification = await classifyManagedPaths(rootDir, projectId, manifest);
  const rejected: ProjectContentRejection[] = [];
  const conflicts: string[] = [];
  const candidates: ImportCandidate[] = [];
  const names = sourcePaths.map((sourcePath) => basename(String(sourcePath)));
  const duplicateNames = new Set(
    names
      .map((name) => name.toLowerCase())
      .filter((name, index, all) => all.indexOf(name) !== index)
  );

  for (const rawSourcePath of sourcePaths) {
    const sourcePath = resolve(String(rawSourcePath));
    const name = basename(sourcePath);
    const relativePath = normalizeProjectFilePath(`${kind}/${name}`);
    const destination = assertInsideDirectory(directory, join(directory, name));

    if (!name || !supportsFile(kind, name)) {
      rejected.push(rejection(name || 'Unknown file', 'unsupported-type', `Expected ${allowedExtensions[kind]} file.`));
      continue;
    }
    if (duplicateNames.has(name.toLowerCase())) {
      rejected.push(rejection(name, 'duplicate-name', 'The same filename was dropped more than once.'));
      continue;
    }
    if (sameAbsolutePath(sourcePath, destination)) {
      rejected.push(rejection(name, 'already-in-folder', 'The file is already in this project folder.'));
      continue;
    }

    try {
      const sourceStat = await lstat(sourcePath);
      if (!sourceStat.isFile() || sourceStat.isSymbolicLink()) {
        rejected.push(rejection(name, 'not-file', 'Only regular files can be imported.'));
        continue;
      }
      await access(sourcePath, constants.R_OK);
    } catch {
      rejected.push(rejection(name, 'unreadable', 'The source file could not be read.'));
      continue;
    }

    let destinationExists = false;
    if (classification.paths.has(normalizedKey(relativePath))) {
      rejected.push(rejection(name, 'managed-conflict', 'This filename is managed by the Northvale manifest.'));
      continue;
    }
    if (kind !== 'shaderpacks' && !classification.available) {
      rejected.push(rejection(name, 'classification-unavailable', 'Managed file ownership could not be verified.'));
      continue;
    }
    try {
      const destinationStat = await lstat(destination);
      destinationExists = true;
      if (!destinationStat.isFile() || destinationStat.isSymbolicLink()) {
        rejected.push(rejection(name, 'not-file', 'The destination is not a regular file.'));
        continue;
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        rejected.push(rejection(name, 'unreadable', 'The existing destination could not be inspected.'));
        continue;
      }
    }
    if (destinationExists && !overwrite) {
      conflicts.push(name);
      continue;
    }

    candidates.push({ sourcePath, destination, relativePath, name });
  }

  if (conflicts.length > 0) {
    return {
      status: 'needs-confirmation',
      imported: [],
      conflicts: conflicts.sort((a, b) => a.localeCompare(b, undefined, { numeric: true })),
      rejected
    };
  }

  const imported: ProjectContentEntry[] = [];
  let tempCounter = 0;
  for (const candidate of candidates) {
    const token = `${process.pid}-${Date.now()}-${tempCounter++}`;
    const tempPath = assertInsideDirectory(
      directory,
      join(directory, `.bbt-import-${token}.tmp`)
    );
    const backupPath = assertInsideDirectory(directory, join(directory, `.bbt-backup-${token}.tmp`));
    try {
      await copyFile(candidate.sourcePath, tempPath);
      if (existsSync(candidate.destination)) await rename(candidate.destination, backupPath);
      await rename(tempPath, candidate.destination);
      if (existsSync(backupPath)) await rm(backupPath, { force: true });
      const fileStat = await stat(candidate.destination);
      imported.push(entryFromStat(kind, candidate.relativePath, candidate.name, fileStat, 'user'));
    } catch {
      if (!existsSync(candidate.destination) && existsSync(backupPath)) {
        await rename(backupPath, candidate.destination).catch(() => undefined);
      }
      rejected.push(rejection(candidate.name, 'unreadable', 'The file could not be copied into Northvale.'));
    } finally {
      if (existsSync(tempPath)) await rm(tempPath, { force: true });
      if (existsSync(backupPath)) await rm(backupPath, { force: true });
    }
  }

  return { status: 'complete', imported, conflicts: [], rejected };
}

function validateContentRelativePath(kind: ProjectContentKind, relativePath: string): string {
  const safePath = normalizeProjectFilePath(relativePath);
  const parts = safePath.split('/');
  if (parts.length !== 2 || parts[0] !== kind || !supportsFile(kind, parts[1])) {
    throw new Error(`Invalid project content path: ${relativePath}`);
  }
  return safePath;
}

export async function trashProjectContent({
  rootDir,
  projectId,
  kind,
  relativePath,
  manifest,
  trashItem
}: ContentContext & {
  relativePath: string;
  trashItem(path: string): Promise<void>;
}): Promise<void> {
  const safePath = validateContentRelativePath(kind, relativePath);
  const classification = await classifyManagedPaths(rootDir, projectId, manifest);
  if (kind !== 'shaderpacks' && classification.paths.has(normalizedKey(safePath))) {
    throw new Error('Manifest-managed content cannot be removed from the launcher.');
  }
  if (kind !== 'shaderpacks' && !classification.available) {
    throw new Error('Managed file ownership could not be verified.');
  }

  const projectDir = projectDirectory(rootDir, projectId);
  const destination = assertInsideDirectory(projectDir, join(projectDir, safePath));
  if (!existsSync(destination)) return;
  const fileStat = await lstat(destination);
  if (!fileStat.isFile() || fileStat.isSymbolicLink()) {
    throw new Error('Only regular user files can be moved to the Recycle Bin.');
  }
  await trashItem(resolve(destination));
}

export async function ensureProjectContentDirectory(
  rootDir: string,
  projectId: string,
  kind: ProjectContentKind
): Promise<string> {
  const directory = contentDirectory(rootDir, projectId, kind);
  await mkdir(directory, { recursive: true });
  return resolve(directory);
}
