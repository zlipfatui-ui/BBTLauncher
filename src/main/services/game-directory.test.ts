import { mkdtemp, mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { prepareGameDirectory } from './game-directory';
import { loadSettings, saveSettings } from './settings';

describe('game directory relocation', () => {
  it('copies modpacks, saves, runtime and metadata before committing the directory; retains originals and login location', async () => {
    const root = await mkdtemp(join(tmpdir(), 'bbt-relocate-'));
    const next = join(root, 'new เกม');
    const old = join(root, 'old');
    try {
      for (const file of ['projects/sainam/mods/test.jar', 'projects/sainam/saves/world/level.dat', 'runtimes/java/bin/java.exe', 'metadata/sainam/managed-files.json', 'auth/token.bin', '.bbt-pack-author']) {
        await mkdir(join(old, file, '..'), { recursive: true });
        await writeFile(join(old, file), file);
      }
      await saveSettings(root, { appDirectory: old });
      await saveSettings(root, { appDirectory: next }, (current, proposed) => prepareGameDirectory(current.appDirectory, proposed.appDirectory));
      expect((await loadSettings(root)).appDirectory).toBe(next);
      expect(await readFile(join(next, 'projects/sainam/mods/test.jar'), 'utf8')).toBe('projects/sainam/mods/test.jar');
      expect(await readFile(join(next, 'projects/sainam/saves/world/level.dat'), 'utf8')).toBe('projects/sainam/saves/world/level.dat');
      expect(await readFile(join(next, '.bbt-pack-author'), 'utf8')).toBe('.bbt-pack-author');
      expect(await readFile(join(old, 'auth/token.bin'), 'utf8')).toBe('auth/token.bin');
      await expect(readFile(join(next, 'auth/token.bin'))).rejects.toMatchObject({ code: 'ENOENT' });
      expect(await readFile(join(old, 'projects/sainam/mods/test.jar'), 'utf8')).toBe('projects/sainam/mods/test.jar');
    } finally { await rm(root, { recursive: true, force: true }); }
  });

  it('refuses conflicting destination files without changing settings or overwriting either copy', async () => {
    const root = await mkdtemp(join(tmpdir(), 'bbt-relocate-'));
    const old = join(root, 'old'); const next = join(root, 'new');
    try {
      for (const folder of [old, next]) await mkdir(join(folder, 'projects/sainam/mods'), { recursive: true });
      await writeFile(join(old, 'projects/sainam/mods/a.jar'), 'old');
      await writeFile(join(next, 'projects/sainam/mods/a.jar'), 'different');
      await saveSettings(root, { appDirectory: old });
      await expect(saveSettings(root, { appDirectory: next }, (current, proposed) => prepareGameDirectory(current.appDirectory, proposed.appDirectory))).rejects.toThrow(/different file/i);
      expect((await loadSettings(root)).appDirectory).toBe(old);
      expect(await readFile(join(next, 'projects/sainam/mods/a.jar'), 'utf8')).toBe('different');
    } finally { await rm(root, { recursive: true, force: true }); }
  });

  it('can resume an identical partial copy but rejects nested destination folders', async () => {
    const root = await mkdtemp(join(tmpdir(), 'bbt-relocate-'));
    try {
      const old = join(root, 'old'); const next = join(root, 'new');
      await mkdir(join(old, 'projects'), { recursive: true });
      await writeFile(join(old, 'projects/test.txt'), 'pack');
      await prepareGameDirectory(old, next);
      await expect(prepareGameDirectory(old, next)).resolves.toBeUndefined();
      await expect(prepareGameDirectory(old, join(old, 'nested'))).rejects.toThrow(/inside/i);
    } finally { await rm(root, { recursive: true, force: true }); }
  });
});
