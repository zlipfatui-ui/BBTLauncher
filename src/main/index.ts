import { app, BrowserWindow, dialog, ipcMain, safeStorage, shell } from 'electron';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createManifestClient } from './services/manifest-client.js';
import { AuthServiceError, MinecraftAuthService, type MinecraftSession } from './services/auth.js';
import {
  createSafeStorageTokenCache,
  clearSafeTokenCache,
  createSafeTextStore
} from './services/secure-token-cache.js';
import { toIpcResult } from './services/ipc-result.js';
import { getRuntimeRoot, loadSettings, resolveLauncherRoot, saveSettings } from './services/settings.js';
import { syncProject } from './services/sync.js';
import { inspectProjectState } from './services/project-state.js';
import { runProjectLaunch } from './services/project-launch.js';
import type { AuthState, LauncherManifest, LauncherSettings, SafeMinecraftProfile } from '../shared/types.js';
import { LegacyLiveAuthService, extractLegacyLiveCode } from './services/legacy-live-auth.js';
import { selectAppDirectory } from './services/directory-dialog.js';
import { applyDisplaySettingsToWindow, createBrowserWindowOptions } from './services/window-settings.js';
import { createProjectLaunchManager } from './services/project-launch-manager.js';
import { writeLaunchDiagnostics } from './services/diagnostics.js';
import { createLauncherUpdateService } from './services/updater.js';
import {
  ensureProjectContentDirectory,
  importProjectContent,
  listProjectContent,
  setProjectContentEnabled,
  trashProjectContent
} from './services/project-content.js';
import { createContentDrawerWindowController } from './services/content-drawer-window.js';
import electronUpdater from 'electron-updater';

const __dirname = dirname(fileURLToPath(import.meta.url));
const launcherRoot = resolveLauncherRoot();
const manifestBaseUrl =
  process.env.BBT_MANIFEST_BASE_URL || 'https://webbbt.zlipfatui.workers.dev';
const manifestClient = createManifestClient({ baseUrl: manifestBaseUrl });
let cachedManifest: LauncherManifest | null = null;
const msalCachePath = join(launcherRoot, 'auth', 'msal-cache.bin');
const legacyRefreshTokenPath = join(launcherRoot, 'auth', 'legacy-live-refresh-token.bin');

interface AuthSessionService {
  getState(): Promise<AuthState>;
  loginMicrosoft(): Promise<SafeMinecraftProfile>;
  logout(): Promise<void>;
  getProfile(): Promise<SafeMinecraftProfile | null>;
  ensureSession(): Promise<MinecraftSession>;
}

function openLegacyLiveAuthWindow(url: string, redirectUri: string): Promise<{ code: string }> {
  return new Promise((resolve, reject) => {
    let settled = false;
    const parent = BrowserWindow.getFocusedWindow() ?? undefined;
    const authWindow = new BrowserWindow({
      width: 560,
      height: 720,
      title: 'Microsoft Login',
      parent,
      modal: false,
      autoHideMenuBar: true,
      backgroundColor: '#ffffff',
      webPreferences: {
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true
      }
    });

    const finish = (callback: () => void) => {
      if (settled) return;
      settled = true;
      callback();
      if (!authWindow.isDestroyed()) authWindow.close();
    };

    const inspectUrl = (targetUrl: string) => {
      try {
        const code = extractLegacyLiveCode(targetUrl, redirectUri);
        if (code) {
          finish(() => resolve({ code }));
        }
      } catch (error) {
        finish(() => reject(error));
      }
    };

    authWindow.webContents.on('will-redirect', (_event, targetUrl) => inspectUrl(targetUrl));
    authWindow.webContents.on('will-navigate', (_event, targetUrl) => inspectUrl(targetUrl));
    authWindow.webContents.on('did-navigate', (_event, targetUrl) => inspectUrl(targetUrl));
    authWindow.once('closed', () => {
      if (!settled) {
        settled = true;
        reject(new AuthServiceError('AUTH_CANCELLED', 'Microsoft login was cancelled.'));
      }
    });

    authWindow.loadURL(url).catch((error) => {
      finish(() => reject(error));
    });
  });
}

function createAuthService(): AuthSessionService {
  if (process.env.BBT_AUTH_PROVIDER === 'msal') {
    return new MinecraftAuthService({
      openExternal: (url) => shell.openExternal(url),
      tokenCachePlugin: createSafeStorageTokenCache(msalCachePath, safeStorage),
      clearTokenCache: () => clearSafeTokenCache(msalCachePath)
    });
  }

  const refreshTokenStore = createSafeTextStore(legacyRefreshTokenPath, safeStorage);
  return new LegacyLiveAuthService({
    openAuthWindow: openLegacyLiveAuthWindow,
    loadRefreshToken: refreshTokenStore.load,
    saveRefreshToken: refreshTokenStore.save,
    clearRefreshToken: refreshTokenStore.clear
  });
}

const authService = createAuthService();
const { autoUpdater } = electronUpdater;
const contentDrawerWindowController = createContentDrawerWindowController();

function sendToAllWindows(channel: string, payload: unknown) {
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) win.webContents.send(channel, payload);
  }
}

const updateService = createLauncherUpdateService({
  updater: autoUpdater,
  onStateChange: (state) => sendToAllWindows('updater:state', state)
});

const projectLaunchManager = createProjectLaunchManager({
  onStateChange: (state) => sendToAllWindows('project:launchState', state),
  collectDiagnostics: async (state) => {
    if (!state.projectId) return;
    const settings = await loadSettings(launcherRoot);
    const runtimeRoot = getRuntimeRoot(settings);
    const manifest = cachedManifest || await manifestClient.refresh();
    const project = manifest.projects.find((entry) => entry.id === state.projectId);
    await writeLaunchDiagnostics({
      rootDir: runtimeRoot,
      projectId: state.projectId,
      pid: state.pid,
      runtime: {
        minecraftVersion: project?.minecraft.version || '1.20.1',
        loaderVersion: project?.minecraft.loaderVersion || '47.4.20',
        javaPath: join(runtimeRoot, 'runtimes', 'microsoft-jdk-17-x64', 'bin', 'java.exe')
      }
    });
  }
});

function resolveAppIconPath(): string {
  const builtIcon = join(__dirname, '..', '..', 'dist', 'renderer', 'assets', 'images', 'logos', 'BBT.ico');
  if (existsSync(builtIcon)) return builtIcon;
  return join(__dirname, '..', '..', 'public', 'assets', 'images', 'logos', 'BBT.ico');
}

function createWindow(settings: LauncherSettings): BrowserWindow {
  const display = createBrowserWindowOptions(settings);
  const win = new BrowserWindow({
    width: display.width,
    height: display.height,
    minWidth: 960,
    minHeight: 620,
    title: 'BeforeBedtime Launcher',
    icon: resolveAppIconPath(),
    backgroundColor: '#000000',
    frame: false,
    webPreferences: {
      preload: join(__dirname, '..', 'preload', 'index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  });
  contentDrawerWindowController.attach(win);

  if (display.fullscreen) {
    win.setFullScreen(true);
  }

  const devServerUrl = process.env.VITE_DEV_SERVER_URL;
  if (devServerUrl) {
    void win.loadURL(devServerUrl);
  } else {
    void win.loadFile(join(__dirname, '..', '..', 'dist', 'renderer', 'index.html'));
  }

  return win;
}

function registerIpc() {
  ipcMain.handle('auth:getState', () => toIpcResult(() => authService.getState()));
  ipcMain.handle('auth:loginMicrosoft', () => toIpcResult(() => authService.loginMicrosoft()));
  ipcMain.handle('auth:logout', () => toIpcResult(() => authService.logout()));
  ipcMain.handle('auth:getProfile', () => authService.getProfile());

  ipcMain.handle('settings:load', () => loadSettings(launcherRoot));
  ipcMain.handle('settings:save', (_event, settings) => saveSettings(launcherRoot, settings));
  ipcMain.handle('settings:selectAppDirectory', (_event, defaultPath?: string) => selectAppDirectory(dialog, defaultPath));

  ipcMain.handle('manifest:refresh', async () => {
    cachedManifest = await manifestClient.refresh();
    return cachedManifest;
  });

  ipcMain.handle('project:getState', async (_event, projectId: string) => {
    const settings = await loadSettings(launcherRoot);
    const runtimeRoot = getRuntimeRoot(settings);
    const manifest = await manifestClient.refresh();
    cachedManifest = manifest;
    return inspectProjectState(runtimeRoot, projectId, manifest);
  });

  ipcMain.handle('project:getLaunchState', (_event, projectId: string) => projectLaunchManager.getState(projectId));

  ipcMain.handle('project:sync', async (event, projectId: string) => {
    const settings = await loadSettings(launcherRoot);
    const runtimeRoot = getRuntimeRoot(settings);
    const manifest = await manifestClient.refresh();
    cachedManifest = manifest;
    return syncProject({
      rootDir: runtimeRoot,
      projectId,
      manifest,
      baseUrl: manifestBaseUrl,
      onProgress: (progress) =>
        event.sender.send('project:progress', {
          phase: 'SYNCING',
          percent: progress.totalBytes
            ? Math.min(100, Math.round((progress.downloadedBytes / progress.totalBytes) * 100))
            : 100,
          message: `Downloading ${progress.file}`
        })
    });
  });

  ipcMain.handle('project:launch', (event, projectId: string) =>
    toIpcResult(async () => {
      const settings = await loadSettings(launcherRoot);
      const runtimeRoot = getRuntimeRoot(settings);
      const manifest = await manifestClient.refresh();
      cachedManifest = manifest;

      return projectLaunchManager.launch(projectId, () =>
        runProjectLaunch({
          rootDir: runtimeRoot,
          projectId,
          manifest,
          settings,
          ensureSession: () => authService.ensureSession(),
          sync: () =>
            syncProject({
              rootDir: runtimeRoot,
              projectId,
              manifest,
              baseUrl: manifestBaseUrl,
              onProgress: (progress) =>
                event.sender.send('project:progress', {
                  phase: 'SYNCING',
                  percent: progress.totalBytes
                    ? Math.min(100, Math.round((progress.downloadedBytes / progress.totalBytes) * 100))
                    : 100,
                  message: `Downloading ${progress.file}`
                })
            }),
          onProgress: (progress) => event.sender.send('project:progress', progress)
        })
      );
    })
  );

  ipcMain.handle('project:stop', (_event, projectId: string) => projectLaunchManager.stop(projectId));

  async function getProjectContentContext(projectId: string) {
    const settings = await loadSettings(launcherRoot);
    const runtimeRoot = getRuntimeRoot(settings);
    let manifest = cachedManifest;
    if (!manifest) {
      try {
        manifest = await manifestClient.refresh();
        cachedManifest = manifest;
      } catch {
        manifest = null;
      }
    }
    return { runtimeRoot, projectId, manifest };
  }

  ipcMain.handle('project:content:list', async (_event, projectId, kind) => {
    const context = await getProjectContentContext(projectId);
    return listProjectContent({
      rootDir: context.runtimeRoot,
      projectId: context.projectId,
      kind,
      manifest: context.manifest
    });
  });

  ipcMain.handle('project:content:import', async (_event, projectId, kind, sourcePaths, overwrite) => {
    const context = await getProjectContentContext(projectId);
    return importProjectContent({
      rootDir: context.runtimeRoot,
      projectId: context.projectId,
      kind,
      manifest: context.manifest,
      sourcePaths,
      overwrite: Boolean(overwrite)
    });
  });

  ipcMain.handle('project:content:trash', async (_event, projectId, kind, relativePath) => {
    const context = await getProjectContentContext(projectId);
    await trashProjectContent({
      rootDir: context.runtimeRoot,
      projectId: context.projectId,
      kind,
      relativePath,
      manifest: context.manifest,
      trashItem: (path) => shell.trashItem(path)
    });
  });

  ipcMain.handle('project:content:setEnabled', async (_event, projectId, kind, relativePath, enabled) => {
    const context = await getProjectContentContext(projectId);
    await setProjectContentEnabled({
      rootDir: context.runtimeRoot,
      projectId: context.projectId,
      kind,
      relativePath,
      enabled: Boolean(enabled),
      manifest: context.manifest
    });
  });

  ipcMain.handle('project:content:openFolder', async (_event, projectId, kind) => {
    const context = await getProjectContentContext(projectId);
    const directory = await ensureProjectContentDirectory(context.runtimeRoot, context.projectId, kind);
    const error = await shell.openPath(directory);
    if (error) throw new Error(error);
  });

  ipcMain.handle('updater:getState', () => updateService.getState());
  ipcMain.handle('updater:check', () => updateService.check());
  ipcMain.handle('updater:download', () => updateService.download());
  ipcMain.handle('updater:quitAndInstall', () => updateService.quitAndInstall());

  ipcMain.handle('shell:openExternal', (_event, url: string) => shell.openExternal(url));
  ipcMain.handle('window:minimize', (event) => BrowserWindow.fromWebContents(event.sender)?.minimize());
  ipcMain.handle('window:toggleMaximize', (event) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (!win) return false;
    if (win.isMaximized()) {
      win.unmaximize();
      return false;
    }
    win.maximize();
    return true;
  });
  ipcMain.handle('window:setFullscreen', (event, fullscreen: boolean) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (!win) return false;
    win.setFullScreen(Boolean(fullscreen));
    return win.isFullScreen();
  });
  ipcMain.handle('window:applyDisplaySettings', (event, settings) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (!win) return null;
    return applyDisplaySettingsToWindow(win, settings);
  });
  ipcMain.handle('window:setContentDrawerOpen', (event, open: boolean) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    return win ? contentDrawerWindowController.setOpen(win, Boolean(open)) : 'overlay';
  });
  ipcMain.handle('window:close', (event) => BrowserWindow.fromWebContents(event.sender)?.close());
}

app.whenReady().then(async () => {
  registerIpc();
  createWindow(await loadSettings(launcherRoot));
  setTimeout(() => {
    void updateService.check();
  }, 1200);

  app.on('activate', async () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow(await loadSettings(launcherRoot));
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
