import type { LauncherSettings } from '../../shared/types.js';

export type DisplaySettings = Pick<LauncherSettings, 'width' | 'height' | 'fullscreen'>;

export interface BrowserWindowDisplayTarget {
  setFullScreen(fullscreen: boolean): void;
  setSize(width: number, height: number): void;
  isFullScreen(): boolean;
}

export function normalizeDisplaySettings(settings: DisplaySettings): DisplaySettings {
  return {
    width: Number.isFinite(settings.width) ? Math.max(640, Math.floor(Number(settings.width))) : 1280,
    height: Number.isFinite(settings.height) ? Math.max(480, Math.floor(Number(settings.height))) : 720,
    fullscreen: Boolean(settings.fullscreen)
  };
}

export function createBrowserWindowOptions(settings: DisplaySettings): DisplaySettings {
  return normalizeDisplaySettings(settings);
}

export function applyDisplaySettingsToWindow(
  win: BrowserWindowDisplayTarget,
  settings: DisplaySettings
): DisplaySettings {
  const display = normalizeDisplaySettings(settings);
  win.setFullScreen(display.fullscreen);
  if (!display.fullscreen) {
    win.setSize(display.width, display.height);
  }
  return {
    ...display,
    fullscreen: win.isFullScreen()
  };
}
