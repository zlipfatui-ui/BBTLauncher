import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { getRuntimeRoot, loadSettings, saveSettings } from './settings';
import { readSystemMemoryInfo } from './system-memory.js';

vi.mock('./system-memory.js', () => ({
  readSystemMemoryInfo: vi.fn(() => ({ totalMb: 32768, maxMb: 32768 }))
}));
afterEach(() => vi.mocked(readSystemMemoryInfo).mockReset().mockReturnValue({ totalMb: 32768, maxMb: 32768 }));

describe('launcher settings', () => {
  it('preserves the custom game directory and display settings when switching projects', async () => {
    const root = await mkdtemp(join(tmpdir(), 'bbt-settings-'));
    try {
      const saved = await saveSettings(root, {
        appDirectory: join(root, 'เกม Before Bedtime'),
        width: 1600,
        height: 900,
        fullscreen: true,
        memoryMb: 6144,
        selectedProject: 'northvale'
      });
      await saveSettings(root, { selectedProject: 'sainam' });
      const reloaded = await loadSettings(root);
      expect(reloaded).toEqual({ ...saved, selectedProject: 'sainam' });
      expect(getRuntimeRoot(reloaded)).toBe(saved.appDirectory);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('preserves independent settings from concurrent saves', async () => {
    const root = await mkdtemp(join(tmpdir(), 'bbt-settings-'));
    try {
      await Promise.all([
        saveSettings(root, { appDirectory: join(root, 'Games') }),
        saveSettings(root, { selectedProject: 'sainam' }),
        saveSettings(root, { memoryMb: 4096 })
      ]);
      expect(await loadSettings(root)).toMatchObject({
        appDirectory: join(root, 'Games'),
        selectedProject: 'sainam',
        memoryMb: 4096
      });
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('loads SaiNam defaults when settings.json does not exist', async () => {
    const root = await mkdtemp(join(tmpdir(), 'bbt-settings-'));
    try {
      const settings = await loadSettings(root);

      expect(settings.appDirectory).toBe(root);
      expect(settings.width).toBe(1280);
      expect(settings.height).toBe(720);
      expect(settings.fullscreen).toBe(false);
      expect(settings.memoryMb).toBe(8192);
      expect(settings.selectedProject).toBe('sainam');
      expect(settings.starMotion).toBe(true);
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
      expect(settings.selectedProject).toBe('sainam');
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

  it('falls back to SaiNam for an unknown project id', async () => {
    const root = await mkdtemp(join(tmpdir(), 'bbt-settings-'));
    try {
      const saved = await saveSettings(root, {
        selectedProject: 'unknown' as never
      });

      expect(saved.selectedProject).toBe('sainam');
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
      selectedProject: 'northvale',
      starMotion: true
    })).toBe('D:/NorthvaleLauncherData');
  });

  it('migrates only project selection and defaults motion while preserving legacy RAM and paths', async () => {
    const root = await mkdtemp(join(tmpdir(), 'bbt-settings-'));
    try {
      await writeFile(join(root, 'settings.json'), JSON.stringify({ appDirectory: 'D:/Existing Games', memoryMb: 1537, selectedProject: 'northvale' }));
      expect(await loadSettings(root)).toMatchObject({ appDirectory: 'D:/Existing Games', memoryMb: 1537, selectedProject: 'sainam', starMotion: true });
      expect(await saveSettings(root, { starMotion: false })).toMatchObject({ memoryMb: 1537, starMotion: false });
      expect(await loadSettings(root)).toMatchObject({ memoryMb: 1537, starMotion: false });
    } finally { await rm(root, { recursive: true, force: true }); }
  });

  it('defaults to half RAM on an 8 GB PC and caps save at installed RAM', async () => {
    vi.mocked(readSystemMemoryInfo).mockReturnValue({ totalMb: 8192, maxMb: 8192 });
    const root = await mkdtemp(join(tmpdir(), 'bbt-settings-'));
    try {
      expect((await loadSettings(root)).memoryMb).toBe(4096);
      expect((await saveSettings(root, { memoryMb: 65536 })).memoryMb).toBe(8192);
    } finally { await rm(root, { recursive: true, force: true }); }
  });

  it('keeps settings readable without inventing RAM when hardware is unavailable, but rejects RAM saves', async () => {
    vi.mocked(readSystemMemoryInfo).mockImplementation(() => { throw Object.assign(new Error('unavailable'), { code: 'SYSTEM_MEMORY_UNAVAILABLE' }); });
    const root = await mkdtemp(join(tmpdir(), 'bbt-settings-'));
    try {
      expect((await loadSettings(root)).memoryMb).toBe(0);
      await expect(saveSettings(root, { memoryMb: 8192 })).rejects.toMatchObject({ code: 'SYSTEM_MEMORY_UNAVAILABLE' });
      await writeFile(join(root, 'settings.json'), JSON.stringify({ memoryMb: 6145 }));
      expect((await loadSettings(root)).memoryMb).toBe(6145);
      expect((await saveSettings(root, { starMotion: false })).memoryMb).toBe(6145);
    } finally { await rm(root, { recursive: true, force: true }); }
  });
});
