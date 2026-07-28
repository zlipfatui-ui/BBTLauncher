import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { getRuntimeRoot, loadSettings, saveSettings } from './settings';

describe('launcher settings', () => {
  it('loads Northvale defaults when settings.json does not exist', async () => {
    const root = await mkdtemp(join(tmpdir(), 'bbt-settings-'));
    try {
      const settings = await loadSettings(root);

      expect(settings.appDirectory).toBe(root);
      expect(settings.width).toBe(1280);
      expect(settings.height).toBe(720);
      expect(settings.fullscreen).toBe(false);
      expect(settings.memoryMb).toBe(8192);
      expect(settings.selectedProject).toBe('northvale');
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('saves and reloads user settings', async () => {
    const root = await mkdtemp(join(tmpdir(), 'bbt-settings-'));
    try {
      await saveSettings(root, {
        width: 1600,
        height: 900,
        fullscreen: true,
        memoryMb: 6144,
        selectedProject: 'northvale'
      });

      const settings = await loadSettings(root);

      expect(settings.width).toBe(1600);
      expect(settings.height).toBe(900);
      expect(settings.fullscreen).toBe(true);
      expect(settings.memoryMb).toBe(6144);
      expect(settings.selectedProject).toBe('northvale');
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('saves and reloads SaiNam as a known project', async () => {
    const root = await mkdtemp(join(tmpdir(), 'bbt-settings-'));
    try {
      const saved = await saveSettings(root, {
        selectedProject: 'sainam' as never
      });

      expect(saved.selectedProject).toBe('sainam');
      await expect(loadSettings(root)).resolves.toMatchObject({
        selectedProject: 'sainam'
      });
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('falls back to Northvale for an unknown project id', async () => {
    const root = await mkdtemp(join(tmpdir(), 'bbt-settings-'));
    try {
      const saved = await saveSettings(root, {
        selectedProject: 'unknown' as never
      });

      expect(saved.selectedProject).toBe('northvale');
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('uses appDirectory as the runtime root while keeping settings in launcherRoot', () => {
    expect(getRuntimeRoot({
      appDirectory: 'D:/NorthvaleLauncherData',
      width: 1920,
      height: 1080,
      fullscreen: true,
      memoryMb: 8192,
      selectedProject: 'northvale'
    })).toBe('D:/NorthvaleLauncherData');
  });
});
