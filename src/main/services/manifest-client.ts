import type { LauncherFile, LauncherManifest, LauncherProject } from '../../shared/types.js';
import { isProjectId } from '../../shared/types.js';
import { normalizeProjectFilePath } from './path-safety.js';
import {
  isForbiddenProjectManifestPath,
  isIgnoredPlayerLocalProjectManifestPath,
  isLauncherManagedProjectPath
} from './managed-project-files.js';
import { updateProjectAvailability } from './project-availability.js';

/** Tells the server which manifest shape this launcher understands (dynamic projects, seed shaderpacks). */
export const LAUNCHER_VERSION_HEADER = 'X-BBT-Launcher-Version';

/** The manifest is tiny; if the server has not answered by now, fail so the UI can offer a retry. */
const MANIFEST_TIMEOUT_MS = 15_000;

export interface ManifestClientOptions {
  baseUrl: string;
  fetchImpl?: typeof fetch;
  launcherVersion?: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function expectString(value: unknown, label: string): string {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(`Invalid launcher manifest: ${label} must be a non-empty string.`);
  }
  return value;
}

function validateFile(value: unknown): LauncherFile {
  if (!isRecord(value)) throw new Error('Invalid launcher manifest: file entry must be an object.');

  const path = normalizeProjectFilePath(expectString(value.path, 'file.path'));
  const url = expectString(value.url, 'file.url');
  const sha256 = expectString(value.sha256, 'file.sha256').toUpperCase();
  const size = Number(value.size);

  if (!/^\/[A-Za-z0-9._~:/?#\[\]@!$&'()*+,;=%-]+$/.test(url)) {
    throw new Error(`Invalid launcher manifest: file url must be an absolute asset path: ${url}`);
  }
  if (!/^[A-F0-9]{64}$/.test(sha256)) {
    throw new Error(`Invalid launcher manifest: file sha256 must be 64 hex chars for ${path}.`);
  }
  // Player-owned roots (shaderpacks) are only accepted as seed entries: installed once, never overwritten.
  const seedOnlyRoot = isIgnoredPlayerLocalProjectManifestPath(path) && value.syncMode === 'seed';
  if (!isLauncherManagedProjectPath(path) && !seedOnlyRoot) {
    throw new Error(`Invalid launcher manifest: file path is not launcher-managed: ${path}`);
  }
  if (isForbiddenProjectManifestPath(path)) {
    throw new Error(`Invalid launcher manifest: forbidden file path: ${path}`);
  }
  if (!Number.isInteger(size) || size < 0) {
    throw new Error(`Invalid launcher manifest: file size must be a positive integer for ${path}.`);
  }
  if (value.required !== true) {
    throw new Error(`Invalid launcher manifest: file ${path} must be required in v1.`);
  }
  const syncMode = value.syncMode;
  if (syncMode !== undefined && syncMode !== 'required' && syncMode !== 'seed') {
    throw new Error(`Invalid launcher manifest: file ${path} has an invalid syncMode.`);
  }

  return { path, url, sha256, size, required: true, ...(syncMode ? { syncMode } : {}) };
}

function validateProject(value: unknown): LauncherProject {
  if (!isRecord(value)) throw new Error('Invalid launcher manifest: project must be an object.');
  if (!isProjectId(value.id)) {
    throw new Error(`Invalid launcher manifest: unsupported project id ${String(value.id)}.`);
  }
  const projectId = value.id;

  const minecraft = isRecord(value.minecraft) ? value.minecraft : {};
  if (
    typeof minecraft.version !== 'string' || !/^1\.\d{1,2}(\.\d{1,2})?$/.test(minecraft.version) ||
    minecraft.loader !== 'forge' ||
    typeof minecraft.loaderVersion !== 'string' || !/^\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(minecraft.loaderVersion) ||
    minecraft.javaMajor !== 17
  ) {
    throw new Error(`Invalid launcher manifest: ${projectId} must use Forge with Java 17.`);
  }
  const optionalText = (key: string, max: number) =>
    typeof value[key] === 'string' && (value[key] as string).trim() ? (value[key] as string).slice(0, max) : undefined;

  const artwork = isRecord(value.artwork) ? value.artwork : {};
  const gallery = Array.isArray(artwork.gallery) ? artwork.gallery.map((item) => expectString(item, 'gallery item')) : [];
  if (typeof artwork.cover !== 'string') {
    throw new Error('Invalid launcher manifest: artwork.cover is required.');
  }

  return {
    id: projectId,
    title: expectString(value.title, 'project.title'),
    statusText: expectString(value.statusText, 'project.statusText'),
    ...(value.visibility === 'locked' ? { visibility: 'locked' as const } : {}),
    ...(optionalText('lockedMessage', 200) ? { lockedMessage: optionalText('lockedMessage', 200) } : {}),
    ...(optionalText('seasonLabel', 60) ? { seasonLabel: optionalText('seasonLabel', 60) } : {}),
    ...(optionalText('tagline', 80) ? { tagline: optionalText('tagline', 80) } : {}),
    ...(optionalText('description', 400) ? { description: optionalText('description', 400) } : {}),
    minecraft: {
      version: minecraft.version,
      loader: 'forge',
      loaderVersion: minecraft.loaderVersion,
      javaMajor: 17
    },
    artwork: {
      cover: artwork.cover,
      gallery
    },
    files: Array.isArray(value.files) ? value.files.map(validateFile) : []
  };
}

export function validateLauncherManifest(value: unknown): LauncherManifest {
  if (!isRecord(value)) throw new Error('Invalid launcher manifest: root must be an object.');
  if (value.schemaVersion !== 1) throw new Error('Invalid launcher manifest: schemaVersion must be 1.');
  const generatedAt = expectString(value.generatedAt, 'generatedAt');
  // The server never sends hidden projects; skip any that slip through rather than show them.
  const projects = Array.isArray(value.projects)
    ? value.projects.filter((project) => !isRecord(project) || project.visibility !== 'hidden').map(validateProject)
    : [];
  if (projects.length === 0) throw new Error('Invalid launcher manifest: at least one project is required.');
  const projectIds = projects.map((project) => project.id);
  if (new Set(projectIds).size !== projectIds.length) {
    throw new Error('Invalid launcher manifest: duplicate project ids are not allowed.');
  }
  return { schemaVersion: 1, generatedAt, projects };
}

export function createManifestClient({ baseUrl, fetchImpl = fetch, launcherVersion }: ManifestClientOptions) {
  // The launcher polls; the server answers 304 while this manifest is still current.
  let cached: { etag: string; manifest: LauncherManifest } | null = null;
  return {
    async refresh(): Promise<LauncherManifest> {
      const url = new URL('/api/launcher/manifest', baseUrl);
      const headers: Record<string, string> = {};
      if (launcherVersion) headers[LAUNCHER_VERSION_HEADER] = launcherVersion;
      if (cached) headers['If-None-Match'] = cached.etag;
      const response = await fetchImpl(url.toString(), { headers, signal: AbortSignal.timeout(MANIFEST_TIMEOUT_MS) });
      if (response.status === 304 && cached) return cached.manifest;
      if (!response.ok) {
        throw new Error(`Launcher manifest request failed with HTTP ${response.status}.`);
      }

      const manifest = validateLauncherManifest(await response.json());
      updateProjectAvailability(manifest);
      const etag = response.headers?.get?.('ETag');
      cached = etag ? { etag, manifest } : null;
      return manifest;
    }
  };
}
