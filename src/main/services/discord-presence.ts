import { SAINAM_PROJECT_ID, type ProjectLaunchState } from '../../shared/types.js';
import type { DiscordActivity, DiscordRpcClient } from './discord-rpc.js';

export interface DiscordPresenceService {
  start(): void;
  updateLaunchState(state: ProjectLaunchState): void;
  stop(): void;
}

export interface PresenceProjectInfo {
  title: string;
  minecraftVersion: string;
  loaderVersion: string;
}

interface DiscordPresenceOptions {
  rpc: DiscordRpcClient;
  now?: () => number;
  /** Looks up dashboard-managed projects in the current manifest. */
  describeProject?: (projectId: string) => PresenceProjectInfo | undefined;
}

function launcherActivity(start: number): DiscordActivity {
  return {
    type: 0,
    details: 'Using BeforeBedtime Launcher',
    state: 'กำลังเลือก Project',
    timestamps: { start },
    assets: { large_image: 'bbt', large_text: 'BeforeBedtime' },
    instance: false
  };
}

function projectActivity(start: number, projectId?: string, info?: PresenceProjectInfo): DiscordActivity {
  const runtime = info ? `Minecraft ${info.minecraftVersion} • Forge ${info.loaderVersion}` : 'Minecraft 1.20.1 • Forge 47.4.20';
  if (projectId === SAINAM_PROJECT_ID) {
    return {
      type: 0,
      details: 'กำลังเล่น SAINAM',
      state: runtime,
      timestamps: { start },
      assets: { large_image: 'sainam', large_text: 'SAINAM' },
      instance: false
    };
  }

  return {
    type: 0,
    details: `กำลังเล่น ${info?.title ?? 'Northvale'}`,
    state: runtime,
    timestamps: { start },
    assets: { large_image: 'bbt', large_text: 'BeforeBedtime' },
    instance: false
  };
}

export function createDiscordPresenceService(options: DiscordPresenceOptions): DiscordPresenceService {
  const now = options.now ?? Date.now;
  let mode: 'launcher' | 'project' = 'launcher';

  return {
    start(): void {
      options.rpc.start();
      options.rpc.setActivity(launcherActivity(Math.floor(now() / 1_000)));
    },
    updateLaunchState(state: ProjectLaunchState): void {
      if (state.status === 'running' && mode === 'launcher') {
        mode = 'project';
        options.rpc.setActivity(projectActivity(
          Math.floor(now() / 1_000),
          state.projectId,
          state.projectId ? options.describeProject?.(state.projectId) : undefined
        ));
      }
      if (state.status === 'idle' && mode === 'project') {
        mode = 'launcher';
        options.rpc.setActivity(launcherActivity(Math.floor(now() / 1_000)));
      }
    },
    stop(): void {
      options.rpc.stop();
    }
  };
}
