import { mkdtemp, mkdir, rename, rm, symlink, unlink, writeFile, type FileHandle } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { afterEach, expect, it, vi } from 'vitest';
import { createProjectScreenshotsService } from './project-screenshots.js';

const hooks = vi.hoisted(() => ({
  readPath: undefined as undefined | ((read: () => Promise<Buffer>) => Promise<Buffer>),
  open: undefined as undefined | ((open: () => Promise<FileHandle>) => Promise<FileHandle>),
  readHandle: undefined as undefined | ((read: () => Promise<Buffer>) => Promise<Buffer>)
}));

// Keep real filesystem I/O; only schedule an adversarial rename/junction swap at its boundary.
vi.mock('./screenshot-file-access.js', async (importOriginal) => {
  const fs = await importOriginal<typeof import('./screenshot-file-access.js')>();
  return {
    ...fs,
    readFile: async (...args: any[]) => {
      const read = () => Reflect.apply(fs.readFile, undefined, args);
      return hooks.readPath ? hooks.readPath(read) : read();
    },
    open: async (...args: any[]) => {
      const open = () => Reflect.apply(fs.open, undefined, args) as Promise<FileHandle>;
      const handle = await (hooks.open ? hooks.open(open) : open());
      const read = handle.readFile.bind(handle);
      handle.readFile = ((...readArgs: any[]) => {
        const readBytes = () => Reflect.apply(read, undefined, readArgs) as Promise<Buffer>;
        return hooks.readHandle ? hooks.readHandle(readBytes) : readBytes();
      }) as FileHandle['readFile'];
      return handle;
    }
  };
});

const roots: string[] = [];
afterEach(async () => {
  hooks.readPath = undefined; hooks.open = undefined; hooks.readHandle = undefined;
  for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true });
});

async function fixture() {
  const rootDir = await mkdtemp(join(tmpdir(), 'bbt-screenshot-race-'));
  roots.push(rootDir);
  const directory = join(rootDir, 'projects', 'sainam', 'screenshots');
  const outside = await mkdtemp(join(tmpdir(), 'bbt-screenshot-outside-'));
  roots.push(outside);
  await mkdir(directory, { recursive: true });
  await writeFile(join(directory, 'capture.png'), 'allowed-image');
  await writeFile(join(outside, 'capture.png'), 'private-outside-image');
  async function swapDuring<T>(operation: () => Promise<T>): Promise<T> {
    const parked = `${directory}.held`;
    await rename(directory, parked);
    await symlink(outside, directory, 'junction');
    try { return await operation(); } finally {
      await unlink(directory);
      await rename(parked, directory);
    }
  }
  const decoded: string[] = [];
  const service = createProjectScreenshotsService({ imageFromBuffer: (bytes) => {
    decoded.push(bytes.toString());
    return { isEmpty: () => false, getSize: () => ({ width: 1, height: 1 }),
      toDataURL: () => bytes.toString(), resize: () => ({ toDataURL: () => bytes.toString() }) };
  } });
  return { rootDir, service, swapDuring, decoded };
}

it('never decodes outside bytes when an ancestor junction swaps only during the read and restores afterward', async () => {
  const { rootDir, service, swapDuring, decoded } = await fixture();
  let attacked = false;
  let blockedSwapCode: string | undefined;
  const readWithSwap = async (read: () => Promise<Buffer>) => {
    attacked = true;
    try { return await swapDuring(read); } catch (error) {
      blockedSwapCode = (error as NodeJS.ErrnoException).code;
      throw error;
    }
  };
  hooks.readPath = readWithSwap;
  hooks.readHandle = readWithSwap;
  const result = await service.read(rootDir, 'sainam', 'capture.png').then(
    (value) => ({ ok: true as const, value }),
    (error: unknown) => ({ ok: false as const, error })
  );
  expect(attacked).toBe(true);
  expect(decoded).not.toContain('private-outside-image');
  if (result.ok) {
    expect(decoded).toEqual(['allowed-image']);
    expect(result.value).toEqual({ dataUrl: 'allowed-image' });
  } else {
    // Windows may deny renaming an ancestor while a child has an open file handle.
    expect(['EPERM', 'EACCES', 'EBUSY']).toContain(blockedSwapCode);
    expect(result.error).toMatchObject({ code: 'SCREENSHOT_UNAVAILABLE' });
    expect(decoded).toEqual([]);
  }
});

it('rejects and closes a different file opened through a temporarily replaced ancestor', async () => {
  const { rootDir, service, swapDuring, decoded } = await fixture();
  let opened: FileHandle | undefined;
  hooks.open = (open) => swapDuring(async () => { opened = await open(); return opened; });
  await expect(service.read(rootDir, 'sainam', 'capture.png')).rejects.toMatchObject({ code: 'SCREENSHOT_UNAVAILABLE' });
  expect(decoded).toEqual([]);
  expect(opened).toBeDefined();
  await expect(opened!.stat()).rejects.toMatchObject({ code: 'EBADF' });
});
