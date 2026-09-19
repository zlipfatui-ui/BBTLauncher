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
  it('only restarts for a completed download and requests silent install with relaunch once', () => {
    const updater = makeUpdater();
    const prepareToInstall = vi.fn();
    const service = createLauncherUpdateService({ updater, prepareToInstall });
    service.quitAndInstall();
    expect(updater.quitAndInstall).not.toHaveBeenCalled();
    updater.emit('update-downloaded', { version: '0.3.7' });
    service.quitAndInstall();
    service.quitAndInstall();
    expect(prepareToInstall).toHaveBeenCalledOnce();
    expect(updater.quitAndInstall).toHaveBeenCalledExactlyOnceWith(true, true);
  });

  it('keeps the app available when preparation refuses an update and allows retry', () => {
    const updater = makeUpdater();
    const prepareToInstall = vi.fn().mockImplementationOnce(() => { throw new Error('Stop Minecraft first.'); });
    const service = createLauncherUpdateService({ updater, prepareToInstall });
    updater.emit('update-downloaded', { version: '0.3.7' });
    service.quitAndInstall();
    expect(updater.quitAndInstall).not.toHaveBeenCalled();
    expect(service.getState()).toMatchObject({ status: 'downloaded', message: 'Stop Minecraft first.' });
    service.quitAndInstall();
    expect(updater.quitAndInstall).toHaveBeenCalledExactlyOnceWith(true, true);
  });

  it('checks GitHub update feed and lets electron-updater auto-download available releases', async () => {
    const updater = makeUpdater();
    const service = createLauncherUpdateService({ updater });

    await service.check();

    expect(updater.autoDownload).toBe(true);
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
