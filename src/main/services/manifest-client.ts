import type { LauncherFile, LauncherManifest, LauncherProject } from '../../shared/types.js';
import {
  isProjectId,
  NORTHVALE_PROJECT_ID,
  SAINAM_PROJECT_ID
} from '../../shared/types.js';
import { normalizeProjectFilePath } from './path-safety.js';
import { isForbiddenProjectManifestPath, isLauncherManagedProjectPath } from './managed-project-files.js';

export interface ManifestClientOptions {
  baseUrl: string;
  fetchImpl?: typeof fetch;
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

const projectMetadata = {
  [NORTHVALE_PROJECT_ID]: {
    loaderVersion: '47.4.20'
  },
  [SAINAM_PROJECT_ID]: {
    loaderVersion: '47.4.10'
  }
} as const;

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
  if (!isLauncherManagedProjectPath(path)) {
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
  const expected = projectMetadata[projectId];

  const minecraft = isRecord(value.minecraft) ? value.minecraft : {};
  if (
    minecraft.version !== '1.20.1' ||
    minecraft.loader !== 'forge' ||
    minecraft.loaderVersion !== expected.loaderVersion ||
    minecraft.javaMajor !== 17
  ) {
    throw new Error(
      `Invalid launcher manifest: ${projectId} must use Forge 1.20.1-${expected.loaderVersion} and Java 17.`
    );
  }

  const artwork = isRecord(value.artwork) ? value.artwork : {};
  const gallery = Array.isArray(artwork.gallery) ? artwork.gallery.map((item) => expectString(item, 'gallery item')) : [];
  if (typeof artwork.cover !== 'string') {
    throw new Error('Invalid launcher manifest: artwork.cover is required.');
  }

  return {
    id: projectId,
    title: expectString(value.title, 'project.title'),
    statusText: expectString(value.statusText, 'project.statusText'),
    minecraft: {
      version: '1.20.1',
      loader: 'forge',
      loaderVersion: expected.loaderVersion,
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
  const projects = Array.isArray(value.projects) ? value.projects.map(validateProject) : [];
  if (projects.length === 0) throw new Error('Invalid launcher manifest: at least one project is required.');
  const projectIds = projects.map((project) => project.id);
  if (new Set(projectIds).size !== projectIds.length) {
    throw new Error('Invalid launcher manifest: duplicate project ids are not allowed.');
  }
  return { schemaVersion: 1, generatedAt, projects };
}

export function createManifestClient({ baseUrl, fetchImpl = fetch }: ManifestClientOptions) {
  return {
    async refresh(): Promise<LauncherManifest> {
      const url = new URL('/api/launcher/manifest', baseUrl);
      const response = await fetchImpl(url.toString());
      if (!response.ok) {
        throw new Error(`Launcher manifest request failed with HTTP ${response.status}.`);
      }

      return validateLauncherManifest(await response.json());
    }
  };
}
