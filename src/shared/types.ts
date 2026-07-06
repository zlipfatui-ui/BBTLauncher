export const NORTHVALE_PROJECT_ID = 'northvale';

export type ProjectId = typeof NORTHVALE_PROJECT_ID;

export interface LauncherManifest {
  schemaVersion: 1;
  generatedAt: string;
  projects: LauncherProject[];
}

export interface LauncherProject {
  id: ProjectId;
  title: string;
  statusText: string;
  minecraft: {
    version: '1.20.1';
    loader: 'forge';
    loaderVersion: '47.4.20';
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
}

export interface LauncherSettings {
  appDirectory: string;
  width: number;
  height: number;
  fullscreen: boolean;
  memoryMb: number;
  selectedProject: ProjectId;
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
  | 'AUTH_CONFIG_MISSING';

export interface AuthState {
  status: 'signed-out' | 'restoring' | 'signed-in';
  profile: SafeMinecraftProfile | null;
}

export type IpcResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: { code: AuthErrorCode; message: string } };

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
