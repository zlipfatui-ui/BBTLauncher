import type {
  AuthState,
  ContentDrawerLayout,
  IpcResult,
  LaunchResult,
  LauncherUpdateState,
  LauncherManifest,
  LauncherSettings,
  ProjectLaunchState,
  ProjectContentImportResult,
  ProjectContentKind,
  ProjectContentListResult,
  ProjectProgressEvent,
  ProjectStateResult,
  ProjectScreenshotListResult,
  ProjectScreenshotReadResult,
  SystemMemoryInfo,
  SafeMinecraftProfile,
  SyncResult
} from '../shared/types';

export interface LauncherApi {
  auth: {
    getState(): Promise<IpcResult<AuthState>>;
    loginMicrosoft(): Promise<IpcResult<SafeMinecraftProfile>>;
    cancelLogin(): Promise<IpcResult<void>>;
    logout(): Promise<IpcResult<void>>;
    getProfile(): Promise<SafeMinecraftProfile | null>;
  };
  system: {
    getMemoryInfo(): Promise<IpcResult<SystemMemoryInfo>>;
  };
  settings: {
    load(): Promise<LauncherSettings>;
    save(settings: Partial<LauncherSettings>): Promise<LauncherSettings>;
    selectAppDirectory(defaultPath?: string): Promise<string | null>;
  };
  manifest: {
    refresh(): Promise<LauncherManifest>;
  };
  project: {
    getState(projectId: string): Promise<ProjectStateResult>;
    getLaunchState(projectId: string): Promise<ProjectLaunchState>;
    sync(projectId: string): Promise<SyncResult>;
    launch(projectId: string): Promise<IpcResult<LaunchResult>>;
    stop(projectId: string): Promise<ProjectLaunchState>;
    screenshots: {
      list(projectId: string): Promise<IpcResult<ProjectScreenshotListResult>>;
      read(projectId: string, relativePath: string, thumbnail?: boolean): Promise<IpcResult<ProjectScreenshotReadResult>>;
      openFile(projectId: string, relativePath: string): Promise<IpcResult<void>>;
      revealFile(projectId: string, relativePath: string): Promise<IpcResult<void>>;
      openFolder(projectId: string): Promise<IpcResult<void>>;
    };
    content: {
      list(projectId: string, kind: ProjectContentKind): Promise<ProjectContentListResult>;
      importFiles(projectId: string, kind: ProjectContentKind, files: File[], overwrite?: boolean): Promise<ProjectContentImportResult>;
      trash(projectId: string, kind: ProjectContentKind, relativePath: string): Promise<void>;
      setEnabled(projectId: string, kind: ProjectContentKind, relativePath: string, enabled: boolean): Promise<void>;
      openFolder(projectId: string, kind: ProjectContentKind): Promise<void>;
    };
    onProgress(listener: (progress: ProjectProgressEvent) => void): () => void;
    onLaunchState(listener: (state: ProjectLaunchState) => void): () => void;
  };
  updater: {
    getState(): Promise<LauncherUpdateState>;
    check(): Promise<LauncherUpdateState>;
    download(): Promise<LauncherUpdateState>;
    quitAndInstall(): Promise<void>;
    onState(listener: (state: LauncherUpdateState) => void): () => void;
  };
  shell: {
    openExternal(url: string): Promise<void>;
  };
  window?: {
    minimize(): Promise<void>;
    toggleMaximize(): Promise<boolean>;
    setFullscreen(fullscreen: boolean): Promise<boolean>;
    applyDisplaySettings(settings: Pick<LauncherSettings, 'width' | 'height' | 'fullscreen'>): Promise<Pick<LauncherSettings, 'width' | 'height' | 'fullscreen'> | null>;
    setContentDrawerOpen(open: boolean): Promise<ContentDrawerLayout>;
    onContentDrawerLayout(listener: (layout: ContentDrawerLayout) => void): () => void;
    close(): Promise<void>;
  };
}

declare global {
  interface Window {
    bbtLauncher?: LauncherApi;
  }
}

export const fallbackManifest: LauncherManifest = {
  schemaVersion: 1,
  generatedAt: '2026-07-05T00:00:00.000Z',
  projects: [
    {
      id: 'northvale',
      title: 'Northvale',
      statusText: 'UP TO DATE',
      minecraft: {
        version: '1.20.1',
        loader: 'forge',
        loaderVersion: '47.4.20',
        javaMajor: 17
      },
      artwork: {
        cover: '/assets/images/logos/ss0-cover.jpg',
        gallery: [
          '/assets/images/gallery/ss0/01.jpg',
          '/assets/images/gallery/ss0/02.jpg',
          '/assets/images/gallery/ss0/03.png',
          '/assets/images/gallery/ss0/04.png',
          '/assets/images/gallery/ss0/05.png'
        ]
      },
      files: []
    },
    {
      id: 'sainam',
      title: 'SaiNam',
      statusText: 'UP TO DATE',
      minecraft: {
        version: '1.20.1',
        loader: 'forge',
        loaderVersion: '47.4.20',
        javaMajor: 17
      },
      artwork: {
        cover: 'https://webbbt.zlipfatui.workers.dev/assets/images/logos/sainam-logo.png',
        gallery: [
          'https://webbbt.zlipfatui.workers.dev/assets/images/gallery/sainam/01.png'
        ]
      },
      files: []
    }
  ]
};

export const fallbackApi: LauncherApi = {
  auth: {
    async getState() {
      return {
        ok: true,
        value: { status: 'signed-out', profile: null }
      };
    },
    async loginMicrosoft() {
      return desktopUnavailable();
    },
    async cancelLogin() { return desktopUnavailable(); },
    async logout() {
      return { ok: true, value: undefined };
    },
    async getProfile() {
      return null;
    }
  },
  system: {
    async getMemoryInfo() { return desktopUnavailable(); }
  },
  settings: {
    async load() {
      return {
        appDirectory: '',
        width: 1280,
        height: 720,
        fullscreen: false,
        memoryMb: 0,
        selectedProject: 'sainam',
        starMotion: true
      };
    },
    async save(settings) {
      return {
        appDirectory: settings.appDirectory || '',
        width: settings.width || 1280,
        height: settings.height || 720,
        fullscreen: Boolean(settings.fullscreen),
        memoryMb: settings.memoryMb || 0,
        selectedProject: 'sainam',
        starMotion: settings.starMotion ?? true
      };
    },
    async selectAppDirectory() {
      return null;
    }
  },
  manifest: {
    async refresh() {
      return fallbackManifest;
    }
  },
  project: {
    async getState() {
      return { state: 'install', missing: 0, changed: 0, stale: 0 };
    },
    async getLaunchState() {
      return { status: 'idle' };
    },
    async sync() {
      return { status: 'ready', downloaded: 0, skipped: 0, totalBytes: 0, downloadedBytes: 0 };
    },
    async launch() {
      return desktopUnavailable();
    },
    async stop() {
      return { status: 'idle' };
    },
    screenshots: {
      async list() { return desktopUnavailable(); },
      async read() { return desktopUnavailable(); },
      async openFile() { return desktopUnavailable(); },
      async revealFile() { return desktopUnavailable(); },
      async openFolder() { return desktopUnavailable(); }
    },
    content: {
      async list() {
        return { entries: [], classificationAvailable: true };
      },
      async importFiles() {
        return { status: 'complete', imported: [], conflicts: [], rejected: [] };
      },
      async trash() {
        return undefined;
      },
      async setEnabled() {
        return undefined;
      },
      async openFolder() {
        return undefined;
      }
    },
    onProgress() {
      return () => undefined;
    },
    onLaunchState() {
      return () => undefined;
    }
  },
  updater: {
    async getState() {
      return { status: 'idle' };
    },
    async check() {
      return { status: 'idle' };
    },
    async download() {
      return { status: 'idle' };
    },
    async quitAndInstall() {
      return undefined;
    },
    onState() {
      return () => undefined;
    }
  },
  shell: {
    async openExternal(url) {
      window.open(url, '_blank', 'noopener,noreferrer');
    }
  }
};

function desktopUnavailable(): { ok: false; error: { code: 'DESKTOP_UNAVAILABLE'; message: string } } {
  return { ok: false, error: { code: 'DESKTOP_UNAVAILABLE', message: 'This action is available in the BeforeBedtime desktop launcher.' } };
}

export function getLauncherApi(): LauncherApi {
  return window.bbtLauncher || fallbackApi;
}
