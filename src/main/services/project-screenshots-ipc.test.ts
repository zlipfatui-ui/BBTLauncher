import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { expect, it } from 'vitest';
import { createRuntimeOperations } from './runtime-operations';
import { createProjectScreenshotsService } from './project-screenshots';
import { registerProjectScreenshotsIpc } from './project-screenshots-ipc';

it('serves overlapping thumbnail/full/list/open/reveal IPC requests during synchronization', async () => {
  const root = await mkdtemp(join(tmpdir(), 'bbt-screenshot-ipc-'));
  const directory = join(root, 'projects', 'sainam', 'screenshots');
  await mkdir(directory, { recursive: true });
  await writeFile(join(directory, 'capture.png'), 'image');
  const operations = createRuntimeOperations();
  const handlers = new Map<string, (...args: any[]) => Promise<any>>();
  const opened: string[] = [];
  const revealed: string[] = [];
  const service = createProjectScreenshotsService({
    imageFromBuffer: () => ({ isEmpty: () => false, getSize: () => ({ width: 1920, height: 1080 }),
      toDataURL: () => 'full-image', resize: () => ({ toDataURL: () => 'thumbnail' }) }),
    openPath: async (path) => { opened.push(path); return ''; },
    showItemInFolder: (path) => { revealed.push(path); }
  });
  registerProjectScreenshotsIpc({ handle: (channel, handler) => { handlers.set(channel, handler); } }, {
    operations, loadRuntimeRoot: async () => root, service
  });
  const invoke = (method: string, ...args: any[]) => handlers.get(`project:screenshots:${method}`)!({}, 'sainam', ...args);
  let finishSync!: () => void;
  const sync = operations.run(() => new Promise<void>((resolve) => { finishSync = resolve; }));
  try {
    const results = await Promise.all([
      invoke('read', 'capture.png', true), invoke('read', 'capture.png', false),
      invoke('list'), invoke('openFile', 'capture.png'), invoke('revealFile', 'capture.png')
    ]);
    expect(results.every((result) => result.ok)).toBe(true);
    expect(results[0].value).toEqual({ dataUrl: 'thumbnail' });
    expect(results[1].value).toEqual({ dataUrl: 'full-image' });
    expect(results[2].value.entries).toHaveLength(1);
    expect(opened).toEqual([join(directory, 'capture.png')]);
    expect(revealed).toEqual(opened);
    expect((await invoke('openFolder')).ok).toBe(false);
  } finally {
    finishSync(); await sync;
    await rm(root, { recursive: true, force: true });
  }
});

it('holds the screenshot lease while loading the current root and rejects migration until all calls finish', async () => {
  const operations = createRuntimeOperations();
  const handlers = new Map<string, (...args: any[]) => Promise<any>>();
  const pendingRoots: Array<() => void> = [];
  registerProjectScreenshotsIpc({ handle: (channel, handler) => { handlers.set(channel, handler); } }, {
    operations, loadRuntimeRoot: () => new Promise<string>((resolve) => { pendingRoots.push(() => resolve('unused')); }),
    service: {
      list: async () => ({ entries: [], directoryExists: false }),
      read: async () => ({ dataUrl: 'unused' }),
      openFile: async () => undefined,
      revealFile: async () => undefined,
      openFolder: async () => undefined
    }
  });
  const first = handlers.get('project:screenshots:list')!({}, 'sainam');
  const second = handlers.get('project:screenshots:list')!({}, 'sainam');
  expect(pendingRoots).toHaveLength(2);
  await expect(operations.changeDirectory(async () => undefined)).rejects.toThrow();
  pendingRoots.shift()!(); await first;
  expect(() => operations.assertIdle()).toThrow();
  pendingRoots.shift()!(); await second;
  expect(() => operations.assertIdle()).not.toThrow();
});
