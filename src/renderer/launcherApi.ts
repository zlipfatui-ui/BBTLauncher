import type {
  AuthState,
  ContentDrawerLayout,
  IpcResult,
  LaunchProgress,
  LaunchResult,
  LauncherUpdateState,
  LauncherManifest,
  LauncherSettings,
  ProjectLaunchState,
  ProjectContentImportResult,
  ProjectContentKind,
  ProjectContentListResult,
  ProjectStateResult,
  SafeMinecraftProfile,
  SyncResult
} from '../shared/types';

export interface LauncherApi {
  auth: {
    getState(): Promise<IpcResult<AuthState>>;
    loginMicrosoft(): Promise<IpcResult<SafeMinecraftProfile>>;
    logout(): Promise<IpcResult<void>>;
    getProfile(): Promise<SafeMinecraftProfile | null>;
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
    content: {
      list(projectId: string, kind: ProjectContentKind): Promise<ProjectContentListResult>;
      importFiles(projectId: string, kind: ProjectContentKind, files: File[], overwrite?: boolean): Promise<ProjectContentImportResult>;
      trash(projectId: string, kind: ProjectContentKind, relativePath: string): Promise<void>;
      openFolder(projectId: string, kind: ProjectContentKind): Promise<void>;
    };
    onProgress(listener: (progress: LaunchProgress) => void): () => void;
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
      return {
        ok: true,
        value: {
          id: '898da750881840f09da4ea6822260b30',
          name: 'Zlevyn',
          avatarInitial: 'Z',
          provider: 'microsoft'
        }
      };
    },
    async logout() {
      return { ok: true, value: undefined };
    },
    async getProfile() {
      return null;
    }
  },
  settings: {
    async load() {
      return {
        appDirectory: 'C:/Users/zLip/AppData/Roaming/.beforebedtime-launcher',
        width: 1280,
        height: 720,
        fullscreen: false,
        memoryMb: 8192,
        selectedProject: 'northvale'
      };
    },
    async save(settings) {
      return {
        appDirectory: settings.appDirectory || 'C:/Users/zLip/AppData/Roaming/.beforebedtime-launcher',
        width: settings.width || 1280,
        height: settings.height || 720,
        fullscreen: Boolean(settings.fullscreen),
        memoryMb: settings.memoryMb || 8192,
        selectedProject: 'northvale'
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
      return { ok: true, value: { pid: undefined } };
    },
    async stop() {
      return { status: 'idle' };
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

export function getLauncherApi(): LauncherApi {
  return window.bbtLauncher || fallbackApi;
}
