import { mkdtemp, mkdir, readFile, rm, symlink, utimes, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { afterEach, describe, expect, it } from 'vitest';
import { createProjectScreenshotsService } from './project-screenshots';

const roots: string[] = [];
async function fixture() {
  const rootDir = await mkdtemp(join(tmpdir(), 'bbt-screenshots-'));
  roots.push(rootDir);
  const directory = join(rootDir, 'projects', 'sainam', 'screenshots');
  await mkdir(directory, { recursive: true });
  return { rootDir, directory };
}
const imageDecoder = (bytes: Buffer) => ({
  isEmpty: () => bytes.toString() === 'invalid',
  getSize: () => ({ width: 1920, height: 1080 }),
  toDataURL: () => `data:image/png;base64,${bytes.toString('base64')}`,
  resize: ({ width, height }: { width: number; height: number }) => ({ toDataURL: () => `thumbnail:${width}x${height}` })
});
const service = createProjectScreenshotsService({ imageFromBuffer: imageDecoder });
afterEach(async () => { for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true }); });

describe('project screenshots', () => {
  it('lists only screenshot images, newest first, from the supplied current game root', async () => {
    const oldRoot = await fixture();
    const current = await fixture();
    await writeFile(join(oldRoot.directory, 'old.png'), 'old');
    for (const name of ['first.PNG', 'second.jpeg', 'third.webp', 'ignore.txt']) {
      await writeFile(join(current.directory, name), name);
    }
    await utimes(join(current.directory, 'first.PNG'), 100, 100);
    await utimes(join(current.directory, 'second.jpeg'), 200, 200);
    await utimes(join(current.directory, 'third.webp'), 300, 300);
    const result = await service.list(current.rootDir, 'sainam');
    expect(result.directoryExists).toBe(true);
    expect(result.entries.map((entry) => entry.relativePath)).toEqual(['third.webp', 'second.jpeg', 'first.PNG']);
    expect(result.entries[0]).toMatchObject({ name: 'third.webp', size: 10, modifiedAt: '1970-01-01T00:05:00.000Z' });
  });

  it('distinguishes a missing folder from an empty folder without creating it on list', async () => {
    const { rootDir, directory } = await fixture();
    expect(await service.list(rootDir, 'sainam')).toEqual({ entries: [], directoryExists: true });
    await rm(directory, { recursive: true });
    expect(await service.list(rootDir, 'sainam')).toEqual({ entries: [], directoryExists: false });
  });

  it('reports a folder that cannot be traversed and a removed selected screenshot explicitly', async () => {
    const { rootDir, directory } = await fixture();
    await expect(service.read(rootDir, 'sainam', 'removed.png')).rejects.toMatchObject({ code: 'SCREENSHOT_UNAVAILABLE' });
    await rm(directory, { recursive: true });
    await writeFile(directory, 'not a directory');
    await expect(service.list(rootDir, 'sainam')).rejects.toMatchObject({ code: 'SCREENSHOT_UNAVAILABLE' });
  });

  it('reads a selected full image and produces only a bounded thumbnail for lazy grid requests', async () => {
    const { rootDir, directory } = await fixture();
    await writeFile(join(directory, 'capture.png'), 'image');
    expect(await service.read(rootDir, 'sainam', 'capture.png')).toEqual({ dataUrl: 'data:image/png;base64,aW1hZ2U=' });
    expect(await service.read(rootDir, 'sainam', 'capture.png', true)).toEqual({ dataUrl: 'thumbnail:360x203' });
    await writeFile(join(directory, 'invalid.png'), 'invalid');
    await expect(service.read(rootDir, 'sainam', 'invalid.png')).rejects.toMatchObject({ code: 'SCREENSHOT_UNAVAILABLE' });
  });

  it.each(['../outside.png', 'C:/outside.png', 'nested/capture.png', 'capture.png:secret', 'capture.txt'])('rejects unsafe screenshot name %s', async (name) => {
    const { rootDir } = await fixture();
    await expect(service.read(rootDir, 'sainam', name)).rejects.toMatchObject({ code: 'SCREENSHOT_UNAVAILABLE' });
  });

  it('blocks screenshot and project junctions escaping the selected root', async () => {
    const { rootDir, directory } = await fixture();
    const outside = await fixture();
    await writeFile(join(outside.directory, 'private.png'), 'private');
    await rm(directory, { recursive: true });
    await symlink(outside.directory, directory, 'junction');
    await expect(service.list(rootDir, 'sainam')).rejects.toMatchObject({ code: 'SCREENSHOT_UNAVAILABLE' });
    await expect(service.read(rootDir, 'sainam', 'private.png')).rejects.toMatchObject({ code: 'SCREENSHOT_UNAVAILABLE' });
    await rm(directory, { recursive: true });
    await rm(join(rootDir, 'projects', 'sainam'), { recursive: true });
    await symlink(join(outside.rootDir, 'projects', 'sainam'), join(rootDir, 'projects', 'sainam'), 'junction');
    await expect(service.openFolder(rootDir, 'sainam')).rejects.toMatchObject({ code: 'SCREENSHOT_UNAVAILABLE' });
    expect(await readFile(join(outside.directory, 'private.png'), 'utf8')).toBe('private');
  });

  it('opens/reveals only validated files, creates a missing folder on open and reports shell errors', async () => {
    const { rootDir, directory } = await fixture();
    const opened: string[] = [];
    const revealed: string[] = [];
    const service = createProjectScreenshotsService({ imageFromBuffer: imageDecoder,
      openPath: async (path) => { opened.push(path); return ''; },
      showItemInFolder: (path) => { revealed.push(path); }
    });
    await writeFile(join(directory, 'capture.jpg'), 'image');
    await service.openFile(rootDir, 'sainam', 'capture.jpg');
    await service.revealFile(rootDir, 'sainam', 'capture.jpg');
    expect(opened).toEqual([join(directory, 'capture.jpg')]);
    expect(revealed).toEqual([join(directory, 'capture.jpg')]);
    await rm(directory, { recursive: true });
    await service.openFolder(rootDir, 'sainam');
    expect(await service.list(rootDir, 'sainam')).toEqual({ entries: [], directoryExists: true });
    const brokenShell = createProjectScreenshotsService({ imageFromBuffer: imageDecoder, openPath: async () => 'No application' });
    await expect(brokenShell.openFolder(rootDir, 'sainam')).rejects.toMatchObject({ code: 'SCREENSHOT_UNAVAILABLE' });
  });
});
