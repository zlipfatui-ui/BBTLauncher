export const NORTHVALE_PROJECT_ID = 'northvale';
export const SAINAM_PROJECT_ID = 'sainam';
/** Projects come from the manifest; ids are lowercase slugs that double as folder names. */
export type ProjectId = string;
const PROJECT_ID_PATTERN = /^[a-z][a-z0-9-]{1,31}$/;

export function isProjectId(value: unknown): value is ProjectId {
  return typeof value === 'string' && PROJECT_ID_PATTERN.test(value);
}

export type ProjectVisibility = 'public' | 'locked';

export type ProjectContentKind = 'mods' | 'resourcepacks' | 'shaderpacks';
export type ProjectContentSource = 'user' | 'managed';
export type ContentDrawerLayout = 'expanded' | 'overlay';

export interface ProjectContentEntry {
  relativePath: string;
  name: string;
  kind: ProjectContentKind;
  source: ProjectContentSource;
  size: number;
  modifiedAt: string;
  enabled: boolean;
  canDelete: boolean;
}

export interface ProjectContentListResult {
  entries: ProjectContentEntry[];
  classificationAvailable: boolean;
}

export type ProjectContentRejectionReason =
  | 'unsupported-type'
  | 'not-file'
  | 'unreadable'
  | 'duplicate-name'
  | 'managed-conflict'
  | 'classification-unavailable'
  | 'already-in-folder';

export interface ProjectContentRejection {
  name: string;
  reason: ProjectContentRejectionReason;
  message: string;
}

export interface ProjectContentImportResult {
  status: 'complete' | 'needs-confirmation';
  imported: ProjectContentEntry[];
  conflicts: string[];
  rejected: ProjectContentRejection[];
}

export interface LauncherManifest {
  schemaVersion: 1;
  generatedAt: string;
  projects: LauncherProject[];
}

export interface LauncherProject {
  id: ProjectId;
  title: string;
  statusText: string;
  /** Hidden projects never reach the launcher; missing means public. */
  visibility?: ProjectVisibility;
  lockedMessage?: string;
  seasonLabel?: string;
  tagline?: string;
  description?: string;
  minecraft: {
    version: string;
    loader: 'forge';
    loaderVersion: string;
    javaMajor: 17;
  };
  artwork: {
    cover: string;
    gallery: string[];
  };
  files: LauncherFile[];
}

export interface LauncherFile {
  path: string;
  url: string;
  sha256: string;
  size: number;
  required: true;
  syncMode?: LauncherFileSyncMode;
}

export type LauncherFileSyncMode = 'required' | 'seed';

export interface LauncherSettings {
  appDirectory: string;
  width: number;
  height: number;
  fullscreen: boolean;
  memoryMb: number;
  selectedProject: ProjectId;
  starMotion: boolean;
}

export interface SystemMemoryInfo {
  totalMb: number;
  maxMb: number;
}

export interface ProjectScreenshotEntry {
  relativePath: string;
  name: string;
  size: number;
  modifiedAt: string;
}

export interface ProjectScreenshotListResult {
  entries: ProjectScreenshotEntry[];
  directoryExists: boolean;
}

export interface ProjectScreenshotReadResult {
  dataUrl: string;
}

export interface SafeMinecraftProfile {
  id: string;
  name: string;
  avatarInitial: string;
  provider: 'microsoft';
}

export type AuthErrorCode =
  | 'AUTH_CANCELLED'
  | 'AUTH_TIMEOUT'
  | 'AUTH_REQUIRED'
  | 'NETWORK_ERROR'
  | 'XBOX_ACCOUNT_REQUIRED'
  | 'XSTS_RESTRICTED'
  | 'MINECRAFT_NOT_OWNED'
  | 'MINECRAFT_APP_NOT_APPROVED'
  | 'AUTH_CONFIG_MISSING'
  | 'SYSTEM_MEMORY_UNAVAILABLE'
  | 'SCREENSHOT_UNAVAILABLE'
  | 'PROJECT_LOCKED'
  | 'DESKTOP_UNAVAILABLE';

export interface AuthState {
  status: 'signed-out' | 'restoring' | 'signed-in';
  profile: SafeMinecraftProfile | null;
}

export type IpcResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: { code: AuthErrorCode; message: string } };

export type LogReportErrorCode = 'NO_LOGS' | 'UNAUTHORIZED' | 'RATE_LIMITED' | 'UPLOAD_FAILED' | 'AUTH_REQUIRED';

export type LogReportResult =
  | { ok: true; value: { id: string; files: string[] } }
  | { ok: false; error: { code: LogReportErrorCode; message: string } };

export interface SyncResult {
  status: 'ready';
  downloaded: number;
  skipped: number;
  totalBytes: number;
  downloadedBytes: number;
}

export type ProjectInstallState = 'install' | 'update' | 'ready';

export interface ProjectStateResult {
  state: ProjectInstallState;
  missing: number;
  changed: number;
  stale: number;
}

export type SyncState =
  | 'checking'
  | 'update-available'
  | 'downloading'
  | 'ready'
  | 'failed';

export interface LaunchResult {
  pid?: number;
}

export type LaunchPhase =
  | 'AUTHENTICATING'
  | 'SYNCING'
  | 'CHECKING_RUNTIME'
  | 'DOWNLOADING_JAVA'
  | 'INSTALLING_MINECRAFT'
  | 'INSTALLING_FORGE'
  | 'DOWNLOADING_LIBRARIES'
  | 'LAUNCHING';

export interface LaunchProgress {
  phase: LaunchPhase;
  percent?: number;
  message: string;
}

export interface ProjectProgressEvent extends LaunchProgress {
  projectId: string;
}

export type ProjectLaunchStatus = 'idle' | 'starting' | 'running' | 'stopping';

export interface ProjectLaunchState {
  status: ProjectLaunchStatus;
  projectId?: string;
  pid?: number;
  startedAt?: string;
}

export type LauncherUpdateStatus =
  | 'idle'
  | 'checking'
  | 'available'
  | 'not-available'
  | 'downloading'
  | 'downloaded'
  | 'error';

export interface LauncherUpdateState {
  status: LauncherUpdateStatus;
  version?: string;
  percent?: number;
  message?: string;
}
