import type { EventEmitter } from 'node:events';
import type { LauncherUpdateState } from '../../shared/types.js';

export interface AutoUpdaterLike extends EventEmitter {
  autoDownload: boolean;
  checkForUpdates(): Promise<unknown>;
  downloadUpdate(): Promise<unknown>;
  quitAndInstall(): void;
}

export interface LauncherUpdateService {
  getState(): LauncherUpdateState;
  check(): Promise<LauncherUpdateState>;
  download(): Promise<LauncherUpdateState>;
  quitAndInstall(): void;
}

export interface LauncherUpdateServiceOptions {
  updater: AutoUpdaterLike;
  onStateChange?: (state: LauncherUpdateState) => void;
}

interface UpdateInfoLike {
  version?: string;
}

interface ProgressInfoLike {
  percent?: number;
}

function messageFromError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function createLauncherUpdateService({ updater, onStateChange }: LauncherUpdateServiceOptions): LauncherUpdateService {
  updater.autoDownload = false;
  let state: LauncherUpdateState = { status: 'idle' };

  function emit(next: LauncherUpdateState): LauncherUpdateState {
    state = { ...state, ...next };
    onStateChange?.(state);
    return state;
  }

  updater.on('checking-for-update', () => emit({ status: 'checking', message: undefined }));
  updater.on('update-available', (info: UpdateInfoLike) =>
    emit({ status: 'available', version: info?.version, percent: undefined, message: undefined })
  );
  updater.on('update-not-available', (info: UpdateInfoLike) =>
    emit({ status: 'not-available', version: info?.version, percent: undefined, message: undefined })
  );
  updater.on('download-progress', (progress: ProgressInfoLike) =>
    emit({ status: 'downloading', percent: Math.round(Number(progress?.percent || 0)) })
  );
  updater.on('update-downloaded', (info: UpdateInfoLike) =>
    emit({ status: 'downloaded', version: info?.version || state.version, percent: 100, message: undefined })
  );
  updater.on('error', (error: unknown) =>
    emit({ status: 'error', message: messageFromError(error) })
  );

  return {
    getState() {
      return state;
    },
    async check() {
      emit({ status: 'checking', message: undefined });
      try {
        await updater.checkForUpdates();
      } catch (error) {
        emit({ status: 'error', message: messageFromError(error) });
      }
      return state;
    },
    async download() {
      emit({ status: 'downloading', percent: 0, message: undefined });
      try {
        await updater.downloadUpdate();
      } catch (error) {
        emit({ status: 'error', message: messageFromError(error) });
      }
      return state;
    },
    quitAndInstall() {
      updater.quitAndInstall();
    }
  };
}
