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
