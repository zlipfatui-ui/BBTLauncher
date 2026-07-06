import { describe, expect, it, vi } from 'vitest';
import type { LauncherManifest, LauncherSettings } from '../../shared/types';
import { runProjectLaunch } from './project-launch';

const manifest = {
  schemaVersion: 1,
  generatedAt: '2026-07-05T00:00:00.000Z',
  projects: [
    {
      id: 'northvale',
      title: 'Northvale',
      statusText: 'UP TO DATE',
      minecraft: {
        version: '1.20.1',
        loader: 'forge',
        loaderVersion: '47.4.20',
        javaMajor: 17
      },
      artwork: { cover: '', gallery: [] },
      files: []
    }
  ]
} satisfies LauncherManifest;

const settings: LauncherSettings = {
  appDirectory: 'C:/launcher',
  width: 1280,
  height: 720,
  fullscreen: false,
  memoryMb: 8192,
  selectedProject: 'northvale'
};

describe('project launch orchestration', () => {
  it('authenticates, syncs, then launches while forwarding progress', async () => {
    const order: string[] = [];
    const progress = vi.fn();
    const session = {
      profile: {
        id: '898da750881840f09da4ea6822260b30',
        name: 'Zlevyn',
        avatarInitial: 'Z',
        provider: 'microsoft' as const
      },
      accessToken: 'minecraft-token',
      expiresAt: Date.now() + 3_600_000
    };

    const result = await runProjectLaunch({
      rootDir: settings.appDirectory,
      projectId: 'northvale',
      manifest,
      settings,
      ensureSession: async () => {
        order.push('auth');
        return session;
      },
      sync: async () => {
        order.push('sync');
        return { status: 'ready', downloaded: 0, skipped: 1, totalBytes: 10, downloadedBytes: 0 };
      },
      launch: async (options) => {
        order.push('launch');
        options.onProgress?.({ phase: 'DOWNLOADING_JAVA', message: 'Checking Java' });
        return { pid: 1234 };
      },
      onProgress: progress
    });

    expect(order).toEqual(['auth', 'sync', 'launch']);
    expect(progress.mock.calls.map(([event]) => event.phase)).toEqual([
      'AUTHENTICATING',
      'SYNCING',
      'DOWNLOADING_JAVA'
    ]);
    expect(result).toEqual({ pid: 1234 });
  });
});
