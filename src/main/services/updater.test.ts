import { EventEmitter } from 'node:events';
import { describe, expect, it, vi } from 'vitest';
import { createLauncherUpdateService, type AutoUpdaterLike } from './updater';

function makeUpdater() {
  const emitter = new EventEmitter() as EventEmitter & AutoUpdaterLike;
  emitter.autoDownload = true;
  emitter.checkForUpdates = vi.fn(async () => undefined);
  emitter.downloadUpdate = vi.fn(async () => undefined);
  emitter.quitAndInstall = vi.fn();
  return emitter;
}

describe('launcher update service', () => {
  it('checks GitHub update feed without auto-downloading', async () => {
    const updater = makeUpdater();
    const service = createLauncherUpdateService({ updater });

    await service.check();

    expect(updater.autoDownload).toBe(false);
    expect(updater.checkForUpdates).toHaveBeenCalledOnce();
  });

  it('emits available, download progress, downloaded, and error states', async () => {
    const updater = makeUpdater();
    const states: string[] = [];
    const service = createLauncherUpdateService({
      updater,
      onStateChange: (state) => states.push(state.status)
    });

    updater.emit('update-available', { version: '0.1.1' });
    updater.emit('download-progress', { percent: 56.6 });
    updater.emit('update-downloaded', { version: '0.1.1' });
    updater.emit('error', new Error('GitHub offline'));

    expect(service.getState()).toEqual({
      status: 'error',
      version: '0.1.1',
      percent: 100,
      message: 'GitHub offline'
    });
    expect(states).toEqual(['available', 'downloading', 'downloaded', 'error']);
  });
});
