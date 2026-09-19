import { contextBridge, ipcRenderer, webUtils } from 'electron';
import type {
  ContentDrawerLayout,
  LauncherSettings,
  LauncherUpdateState,
  ProjectContentKind,
  ProjectLaunchState,
  ProjectProgressEvent
} from '../shared/types.js';

contextBridge.exposeInMainWorld('bbtLauncher', {
  auth: {
    getState: () => ipcRenderer.invoke('auth:getState'),
    loginMicrosoft: () => ipcRenderer.invoke('auth:loginMicrosoft'),
    cancelLogin: () => ipcRenderer.invoke('auth:cancelLogin'),
    logout: () => ipcRenderer.invoke('auth:logout'),
    getProfile: () => ipcRenderer.invoke('auth:getProfile')
  },
  system: {
    getMemoryInfo: () => ipcRenderer.invoke('system:getMemoryInfo')
  },
  settings: {
    load: () => ipcRenderer.invoke('settings:load'),
    save: (settings: Partial<LauncherSettings>) => ipcRenderer.invoke('settings:save', settings),
    selectAppDirectory: (defaultPath?: string) => ipcRenderer.invoke('settings:selectAppDirectory', defaultPath)
  },
  manifest: {
    refresh: () => ipcRenderer.invoke('manifest:refresh')
  },
  project: {
    getState: (projectId: string) => ipcRenderer.invoke('project:getState', projectId),
    getLaunchState: (projectId: string) => ipcRenderer.invoke('project:getLaunchState', projectId),
    sync: (projectId: string) => ipcRenderer.invoke('project:sync', projectId),
    launch: (projectId: string) => ipcRenderer.invoke('project:launch', projectId),
    stop: (projectId: string) => ipcRenderer.invoke('project:stop', projectId),
    screenshots: {
      list: (projectId: string) => ipcRenderer.invoke('project:screenshots:list', projectId),
      read: (projectId: string, relativePath: string, thumbnail = false) =>
        ipcRenderer.invoke('project:screenshots:read', projectId, relativePath, thumbnail),
      openFile: (projectId: string, relativePath: string) => ipcRenderer.invoke('project:screenshots:openFile', projectId, relativePath),
      revealFile: (projectId: string, relativePath: string) => ipcRenderer.invoke('project:screenshots:revealFile', projectId, relativePath),
      openFolder: (projectId: string) => ipcRenderer.invoke('project:screenshots:openFolder', projectId)
    },
    content: {
      list: (projectId: string, kind: ProjectContentKind) =>
        ipcRenderer.invoke('project:content:list', projectId, kind),
      importFiles: (projectId: string, kind: ProjectContentKind, files: File[], overwrite = false) => {
        const sourcePaths = files
          .map((file) => webUtils.getPathForFile(file))
          .filter((path): path is string => Boolean(path));
        return ipcRenderer.invoke('project:content:import', projectId, kind, sourcePaths, overwrite);
      },
      trash: (projectId: string, kind: ProjectContentKind, relativePath: string) =>
        ipcRenderer.invoke('project:content:trash', projectId, kind, relativePath),
      setEnabled: (projectId: string, kind: ProjectContentKind, relativePath: string, enabled: boolean) =>
        ipcRenderer.invoke('project:content:setEnabled', projectId, kind, relativePath, enabled),
      openFolder: (projectId: string, kind: ProjectContentKind) =>
        ipcRenderer.invoke('project:content:openFolder', projectId, kind)
    },
    onProgress: (callback: (progress: ProjectProgressEvent) => void) => {
      const listener = (_event: Electron.IpcRendererEvent, progress: ProjectProgressEvent) => callback(progress);
      ipcRenderer.on('project:progress', listener);
      return () => ipcRenderer.removeListener('project:progress', listener);
    },
    onLaunchState: (callback: (state: ProjectLaunchState) => void) => {
      const listener = (_event: Electron.IpcRendererEvent, state: ProjectLaunchState) => callback(state);
      ipcRenderer.on('project:launchState', listener);
      return () => ipcRenderer.removeListener('project:launchState', listener);
    }
  },
  updater: {
    getState: () => ipcRenderer.invoke('updater:getState'),
    check: () => ipcRenderer.invoke('updater:check'),
    download: () => ipcRenderer.invoke('updater:download'),
    quitAndInstall: () => ipcRenderer.invoke('updater:quitAndInstall'),
    onState: (callback: (state: LauncherUpdateState) => void) => {
      const listener = (_event: Electron.IpcRendererEvent, state: LauncherUpdateState) => callback(state);
      ipcRenderer.on('updater:state', listener);
      return () => ipcRenderer.removeListener('updater:state', listener);
    }
  },
  shell: {
    openExternal: (url: string) => ipcRenderer.invoke('shell:openExternal', url)
  },
  window: {
    minimize: () => ipcRenderer.invoke('window:minimize'),
    toggleMaximize: () => ipcRenderer.invoke('window:toggleMaximize'),
    setFullscreen: (fullscreen: boolean) => ipcRenderer.invoke('window:setFullscreen', fullscreen),
    applyDisplaySettings: (settings: Pick<LauncherSettings, 'width' | 'height' | 'fullscreen'>) =>
      ipcRenderer.invoke('window:applyDisplaySettings', settings),
    setContentDrawerOpen: (open: boolean) => ipcRenderer.invoke('window:setContentDrawerOpen', open),
    onContentDrawerLayout: (callback: (layout: ContentDrawerLayout) => void) => {
      const listener = (_event: Electron.IpcRendererEvent, layout: ContentDrawerLayout) => callback(layout);
      ipcRenderer.on('window:contentDrawerLayout', listener);
      return () => ipcRenderer.removeListener('window:contentDrawerLayout', listener);
    },
    close: () => ipcRenderer.invoke('window:close')
  }
});
