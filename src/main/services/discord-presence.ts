import type { ProjectLaunchState } from '../../shared/types.js';
import type { DiscordActivity, DiscordRpcClient } from './discord-rpc.js';

export interface DiscordPresenceService {
  start(): void;
  updateLaunchState(state: ProjectLaunchState): void;
  stop(): void;
}

interface DiscordPresenceOptions {
  rpc: DiscordRpcClient;
  now?: () => number;
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

function projectActivity(start: number): DiscordActivity {
  return {
    type: 0,
    details: 'กำลังเล่น Northvale',
    state: 'Minecraft 1.20.1 • Forge 47.4.20',
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
        options.rpc.setActivity(projectActivity(Math.floor(now() / 1_000)));
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
