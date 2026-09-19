import { expect, it } from 'vitest';
import { createRuntimeOperations } from './runtime-operations';

it('blocks directory changes while downloading and releases the lock after failure', async () => {
  const operations = createRuntimeOperations();
  let finish!: () => void;
  const job = operations.run(() => new Promise<void>((resolve) => { finish = resolve; }));
  await expect(operations.changeDirectory(async () => {})).rejects.toThrow(/current download/);
  finish(); await job;
  await expect(operations.changeDirectory(async () => { throw new Error('copy failed'); })).rejects.toThrow('copy failed');
  await expect(operations.run(async () => 'ready')).resolves.toBe('ready');
});

it('blocks game operations until a folder copy and commit complete', async () => {
  const operations = createRuntimeOperations();
  let finish!: () => void;
  const job = operations.changeDirectory(() => new Promise<void>((resolve) => { finish = resolve; }));
  await expect(operations.run(async () => {})).rejects.toThrow(/being copied/);
  finish(); await job;
  await expect(operations.run(async () => 'ready')).resolves.toBe('ready');
});

it('allows concurrent read leases during downloads while preserving migration and updater guards', async () => {
  const operations = createRuntimeOperations();
  let finishDownload!: () => void;
  const download = operations.run(() => new Promise<void>((resolve) => { finishDownload = resolve; }));
  let finishRead!: () => void;
  const firstRead = operations.read(() => new Promise<string>((resolve) => { finishRead = () => resolve('thumbnail'); }));
  await expect(operations.read(async () => 'full image')).resolves.toBe('full image');
  await expect(operations.run(async () => 'another mutation')).rejects.toThrow(/current download/);
  finishDownload(); await download;
  expect(() => operations.assertIdle()).toThrow(/current download/);
  await expect(operations.changeDirectory(async () => undefined)).rejects.toThrow(/current download/);
  finishRead();
  await expect(firstRead).resolves.toBe('thumbnail');
  expect(() => operations.assertIdle()).not.toThrow();
  await expect(operations.changeDirectory(async () => 'copied')).resolves.toBe('copied');
});

it('rejects read leases during migration and releases a failed read lease', async () => {
  const operations = createRuntimeOperations();
  let finishCopy!: () => void;
  const copy = operations.changeDirectory(() => new Promise<void>((resolve) => { finishCopy = resolve; }));
  await expect(operations.read(async () => undefined)).rejects.toThrow(/being copied/);
  finishCopy(); await copy;
  await expect(operations.read(async () => { throw new Error('image removed'); })).rejects.toThrow('image removed');
  expect(() => operations.assertIdle()).not.toThrow();
});
