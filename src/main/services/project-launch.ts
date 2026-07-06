import type {
  LaunchProgress,
  LaunchResult,
  LauncherManifest,
  LauncherSettings,
  SyncResult
} from '../../shared/types.js';
import type { MinecraftSession } from './auth.js';
import { launchProject, type LaunchProjectOptions } from './launcher.js';

export interface RunProjectLaunchOptions {
  rootDir: string;
  projectId: string;
  manifest: LauncherManifest;
  settings: LauncherSettings;
  ensureSession: () => Promise<MinecraftSession>;
  sync: () => Promise<SyncResult>;
  launch?: (options: LaunchProjectOptions) => Promise<LaunchResult>;
  onProgress?: (progress: LaunchProgress) => void;
}

export async function runProjectLaunch({
  rootDir,
  projectId,
  manifest,
  settings,
  ensureSession,
  sync,
  launch = launchProject,
  onProgress
}: RunProjectLaunchOptions): Promise<LaunchResult> {
  onProgress?.({
    phase: 'AUTHENTICATING',
    message: 'Refreshing Microsoft and Minecraft session'
  });
  const session = await ensureSession();

  onProgress?.({
    phase: 'SYNCING',
    message: 'Checking Northvale files'
  });
  await sync();

  return launch({
    rootDir,
    projectId,
    manifest,
    settings,
    profile: session.profile,
    minecraftAccessToken: session.accessToken,
    onProgress
  });
}
