import { contextBridge, ipcRenderer } from 'electron';
import type { LauncherSettings, LaunchProgress, LauncherUpdateState, ProjectLaunchState } from '../shared/types.js';

contextBridge.exposeInMainWorld('bbtLauncher', {
  auth: {
    getState: () => ipcRenderer.invoke('auth:getState'),
    loginMicrosoft: () => ipcRenderer.invoke('auth:loginMicrosoft'),
    logout: () => ipcRenderer.invoke('auth:logout'),
    getProfile: () => ipcRenderer.invoke('auth:getProfile')
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
    onProgress: (callback: (progress: LaunchProgress) => void) => {
      const listener = (_event: Electron.IpcRendererEvent, progress: LaunchProgress) => callback(progress);
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
    close: () => ipcRenderer.invoke('window:close')
  }
});
