import { describe, expect, it, vi } from 'vitest';
import { applyDisplaySettingsToWindow, createBrowserWindowOptions } from './window-settings';

describe('window display settings', () => {
  it('builds startup window options from saved settings', () => {
    expect(createBrowserWindowOptions({
      width: 1600,
      height: 900,
      fullscreen: true
    })).toEqual({
      width: 1600,
      height: 900,
      fullscreen: true
    });
  });

  it('applies saved window size when not fullscreen', () => {
    const win = {
      setFullScreen: vi.fn(),
      setSize: vi.fn(),
      isFullScreen: vi.fn(() => false)
    };

    const result = applyDisplaySettingsToWindow(win, { width: 1920, height: 1080, fullscreen: false });

    expect(win.setFullScreen).toHaveBeenCalledWith(false);
    expect(win.setSize).toHaveBeenCalledWith(1920, 1080);
    expect(result).toEqual({ width: 1920, height: 1080, fullscreen: false });
  });

  it('applies fullscreen without resizing the fullscreen window', () => {
    const win = {
      setFullScreen: vi.fn(),
      setSize: vi.fn(),
      isFullScreen: vi.fn(() => true)
    };

    const result = applyDisplaySettingsToWindow(win, { width: 2560, height: 1440, fullscreen: true });

    expect(win.setFullScreen).toHaveBeenCalledWith(true);
    expect(win.setSize).not.toHaveBeenCalled();
    expect(result).toEqual({ width: 2560, height: 1440, fullscreen: true });
  });
});
