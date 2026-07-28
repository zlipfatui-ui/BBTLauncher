import { act, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from './App';
import type { LauncherApi } from './launcherApi';
import type {
  AuthErrorCode,
  IpcResult,
  LaunchResult,
  LauncherManifest,
  LauncherSettings,
  LauncherUpdateState,
  ProjectLaunchState,
  ProjectProgressEvent,
  ProjectStateResult,
  SyncResult
} from '../shared/types';

const profile = {
  id: '898da750881840f09da4ea6822260b30',
  name: 'Zlevyn',
  avatarInitial: 'Z',
  provider: 'microsoft' as const
};

const defaultSettings: LauncherSettings = {
  appDirectory: 'C:/Users/zLip/AppData/Roaming/.beforebedtime-launcher',
  width: 1280,
  height: 720,
  fullscreen: false,
  memoryMb: 8192,
  selectedProject: 'northvale'
};

const defaultManifest: LauncherManifest = {
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
        loaderVersion: '47.4.10',
        javaMajor: 17
      },
      artwork: {
        cover: '',
        gallery: []
      },
      files: []
    }
  ]
};

function makeApi(existingProfile: typeof profile | null = null): LauncherApi {
  let launchStateListener: ((state: ProjectLaunchState) => void) | undefined;
  let updaterListener: ((state: LauncherUpdateState) => void) | undefined;
  const windowApi = {
    minimize: vi.fn(async () => undefined),
    toggleMaximize: vi.fn(async () => true),
    setFullscreen: vi.fn(async () => true),
    applyDisplaySettings: vi.fn(async (settings) => settings),
    setContentDrawerOpen: vi.fn(async () => 'overlay' as const),
    onContentDrawerLayout: vi.fn(() => () => undefined),
    close: vi.fn(async () => undefined)
  } as NonNullable<LauncherApi['window']> & {
    setFullscreen: ReturnType<typeof vi.fn>;
    applyDisplaySettings: ReturnType<typeof vi.fn>;
  };

  return {
    auth: {
      getState: vi.fn(async () => ({
        ok: true as const,
        value: {
          status: existingProfile ? ('signed-in' as const) : ('signed-out' as const),
          profile: existingProfile
        }
      })),
      loginMicrosoft: vi.fn(async () => ({ ok: true as const, value: profile })),
      logout: vi.fn(async () => ({ ok: true as const, value: undefined })),
      getProfile: vi.fn(async () => existingProfile)
    },
    settings: {
      load: vi.fn(async () => defaultSettings),
      save: vi.fn(async (settings) => ({
        appDirectory: settings.appDirectory || 'C:/Users/zLip/AppData/Roaming/.beforebedtime-launcher',
        width: settings.width || 1280,
        height: settings.height || 720,
        fullscreen: Boolean(settings.fullscreen),
        memoryMb: settings.memoryMb || 8192,
        selectedProject: settings.selectedProject || 'northvale'
      })),
      selectAppDirectory: vi.fn(async () => 'D:/Games/BeforeBedtime')
    },
    manifest: {
      refresh: vi.fn(async () => defaultManifest)
    },
    project: {
      getState: vi.fn(async () => ({ state: 'ready' as const, missing: 0, changed: 0, stale: 0 })),
      getLaunchState: vi.fn(async () => ({ status: 'idle' as const })),
      sync: vi.fn(async () => ({ status: 'ready' as const, downloaded: 0, skipped: 0, totalBytes: 0, downloadedBytes: 0 })),
      launch: vi.fn(async () => ({ ok: true as const, value: { pid: 1234 } })),
      stop: vi.fn(async () => {
        const state = { status: 'idle' as const };
        launchStateListener?.(state);
        return state;
      }),
      content: {
        list: vi.fn(async () => ({ entries: [], classificationAvailable: true })),
        importFiles: vi.fn(async () => ({ status: 'complete' as const, imported: [], conflicts: [], rejected: [] })),
        trash: vi.fn(async () => undefined),
        setEnabled: vi.fn(async () => undefined),
        openFolder: vi.fn(async () => undefined)
      },
      onProgress: vi.fn(() => () => undefined)
      ,
      onLaunchState: vi.fn((listener) => {
        launchStateListener = listener;
        return () => undefined;
      })
    },
    updater: {
      getState: vi.fn(async () => ({ status: 'idle' as const })),
      check: vi.fn(async () => ({ status: 'idle' as const })),
      download: vi.fn(async () => ({ status: 'idle' as const })),
      quitAndInstall: vi.fn(async () => undefined),
      onState: vi.fn((listener) => {
        updaterListener = listener;
        return () => undefined;
      })
    },
    shell: {
      openExternal: vi.fn(async () => undefined)
    },
    window: windowApi
  };
}

beforeEach(() => {
  vi.useRealTimers();
});

describe('App', () => {
  it('keeps the splash wordmark large without a white glow', () => {
    const css = readFileSync(resolve(process.cwd(), 'src/renderer/styles.css'), 'utf8');
    const splashWordmarkRule = css.match(/\.splash-wordmark\s*\{([^}]*)\}/s)?.[1] || '';

    expect(splashWordmarkRule).toContain('font-size: 80px');
    expect(splashWordmarkRule).not.toMatch(/text-shadow:\s*[^;]*255,\s*255,\s*255/i);
    expect(splashWordmarkRule).not.toMatch(/filter:\s*drop-shadow/i);
  });

  it('uses a text wordmark on the splash screen and the BBT image asset in the topbar', async () => {
    const user = userEvent.setup();
    render(<App api={makeApi(profile)} />);

    expect(screen.getByText('BEFOREBEDTIME')).toHaveClass('splash-wordmark');
    expect(screen.queryByRole('img', { name: 'BeforeBedtime' })).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /click to start/i }));
    await screen.findByText('NORTHVALE / SEASON 01');

    const topbarLogo = screen.getByTestId('brand-logo');
    expect(topbarLogo).toHaveAttribute('src', expect.stringContaining('/assets/images/logos/BBT.png'));
  });

  it('selects SaiNam, persists it, scopes project actions, and returns to Northvale', async () => {
    const user = userEvent.setup();
    const api = makeApi(profile);
    render(<App api={api} />);

    await user.click(screen.getByRole('button', { name: /click to start/i }));
    await screen.findByText('NORTHVALE / SEASON 01');

    const projectNavigation = screen.getByRole('navigation', { name: 'Main tabs' });
    const projectTrigger = within(projectNavigation).getByRole('button', { name: 'Project' });
    expect(projectTrigger.querySelector('.project-trigger-artwork')).toHaveAttribute(
      'src',
      expect.stringContaining('/assets/images/logos/ss0-cover.jpg')
    );
    expect(projectTrigger).not.toHaveTextContent('01 / 02');

    await user.click(projectTrigger);

    const projectMenu = screen.getByRole('menu', { name: 'Projects' });
    expect(within(projectMenu).getByText('NORTHVALE')).toBeInTheDocument();
    expect(within(projectMenu).getByText('SAINAM')).toBeInTheDocument();

    const sainamMenuItem = within(projectMenu).getByRole('menuitem', { name: /SAINAM/i });
    expect(sainamMenuItem).toHaveTextContent('SEASON TEST · UP TO DATE');
    await user.click(sainamMenuItem);

    expect(projectTrigger).toHaveTextContent('SAINAM');
    expect(projectTrigger).toHaveTextContent('SEASON TEST · UP TO DATE');
    expect(api.settings.save).toHaveBeenCalledWith({ selectedProject: 'sainam' });
    expect(api.project.getState).toHaveBeenLastCalledWith('sainam');
    expect(screen.queryByText('NORTHVALE / SEASON 01')).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 1, name: 'SAINAM' })).toBeInTheDocument();
    expect(screen.getByText('สายน้ำไหลหลาก')).toBeInTheDocument();
    expect(screen.queryByRole('img', { name: /SaiNam gallery image/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Gallery image/i })).not.toBeInTheDocument();
    expect(projectTrigger.querySelector('.project-trigger-artwork')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /manage content/i }));
    expect(await screen.findByText('SAINAM LIBRARY')).toBeInTheDocument();
    expect(api.project.content.list).toHaveBeenCalledWith('sainam', 'mods');

    await user.click(projectTrigger);
    await user.click(within(screen.getByRole('menu', { name: 'Projects' })).getByRole('menuitem', { name: /NORTHVALE/i }));

    expect(await screen.findByText('NORTHVALE / SEASON 01')).toBeInTheDocument();
    expect(projectTrigger).toHaveTextContent('SEASON 01 · UP TO DATE');
    expect(screen.getByRole('img', { name: /Northvale gallery image/i })).toBeInTheDocument();
  }, 10_000);

  it('returns from Shop and Settings without opening the season menu, then toggles it from Project', async () => {
    const user = userEvent.setup();
    render(<App api={makeApi(profile)} />);

    await user.click(screen.getByRole('button', { name: /click to start/i }));
    await screen.findByText('NORTHVALE / SEASON 01');

    const projectNavigation = screen.getByRole('navigation', { name: 'Main tabs' });
    const projectTrigger = within(projectNavigation).getByRole('button', { name: 'Project' });

    await user.click(within(projectNavigation).getByRole('button', { name: 'Shop' }));
    await user.click(projectTrigger);
    expect(screen.getByText('NORTHVALE / SEASON 01')).toBeInTheDocument();
    expect(screen.queryByRole('menu', { name: 'Projects' })).not.toBeInTheDocument();

    await user.click(within(projectNavigation).getByRole('button', { name: 'Settings' }));
    await user.click(projectTrigger);
    expect(screen.getByText('NORTHVALE / SEASON 01')).toBeInTheDocument();
    expect(screen.queryByRole('menu', { name: 'Projects' })).not.toBeInTheDocument();

    await user.click(projectTrigger);
    expect(screen.getByRole('menu', { name: 'Projects' })).toBeInTheDocument();
  });

  it('presents the approved Northvale story and opens project content from the hero', async () => {
    const user = userEvent.setup();
    const api = makeApi(profile);
    const { container } = render(<App api={api} />);

    await user.click(screen.getByRole('button', { name: /click to start/i }));

    expect(await screen.findByText('NORTHVALE / SEASON 01')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'เริ่มการผจญภัยแห่งนี้' })).toBeInTheDocument();
    expect(screen.getByText('ความฝันหรือความจริงกันแน่ ?')).toBeInTheDocument();
    expect(screen.queryByText('Connected')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Shop' }).querySelector('svg')).toBeInTheDocument();

    const manageContent = screen.getByRole('button', { name: /manage content/i });
    expect(manageContent.querySelector('svg')).toBeInTheDocument();
    expect(manageContent).not.toHaveTextContent('□');
    expect(container.querySelector('.content-drawer-handle')).not.toBeInTheDocument();

    await user.click(manageContent);

    expect(api.window?.setContentDrawerOpen).toHaveBeenCalledWith(true);
    expect(screen.getByRole('complementary', { name: /content library/i })).toHaveAttribute('aria-hidden', 'false');
    expect(screen.getByText('NORTHVALE LIBRARY')).toBeInTheDocument();
    expect(screen.getByText('SEASON 01 · MANAGE PROJECT CONTENT')).toBeInTheDocument();
    expect(await screen.findByRole('tab', { name: 'MODS 0' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'RESOURCE PACKS 0' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'SHADERS 0' })).toBeInTheDocument();
  });

  it('keeps the restored star field decorative and the minimal CTA as the only splash transition trigger', async () => {
    vi.useFakeTimers();

    try {
      const { container } = render(<App api={makeApi()} />);
      const startButton = screen.getByRole('button', { name: /click to start/i });

      expect(container.querySelectorAll('.splash-stars .star-particle')).toHaveLength(52);
      expect(container.querySelectorAll('.splash-stars .star-particle path')).toHaveLength(52);
      expect(startButton.querySelector('svg')).not.toBeInTheDocument();
      expect(startButton).toHaveTextContent(/^Click to start$/);

      fireEvent.click(container.querySelector('.splash') as HTMLElement);
      expect(screen.queryByRole('button', { name: /login to microsoft/i })).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /^beforebedtime$/i })).not.toBeInTheDocument();

      fireEvent.mouseEnter(startButton);
      fireEvent.focus(startButton);
      await act(async () => {
        vi.advanceTimersByTime(220);
        await Promise.resolve();
      });

      expect(container.querySelector('.splash.is-exiting')).not.toBeInTheDocument();
      expect(container.querySelector('.auth')).not.toBeInTheDocument();
      expect(container.querySelector('.main')).not.toBeInTheDocument();

      fireEvent.click(startButton);
      await act(async () => {
        await Promise.resolve();
      });
      expect(container.querySelector('.splash.is-exiting')).toBeInTheDocument();

      await act(async () => {
        vi.advanceTimersByTime(220);
        await Promise.resolve();
      });
      expect(screen.getByRole('button', { name: /login to microsoft/i })).toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });

  it('opens the published Terms of Service and Privacy Policy pages', async () => {
    const user = userEvent.setup();
    const api = makeApi();
    render(<App api={api} />);

    await user.click(screen.getByRole('button', { name: /click to start/i }));
    await user.click(await screen.findByRole('button', { name: 'Terms of Service' }));
    expect(api.shell.openExternal).toHaveBeenCalledWith('https://beforebedtime.net/launcher/terms');

    await user.click(screen.getByRole('button', { name: 'Privacy Policy' }));
    expect(api.shell.openExternal).toHaveBeenCalledWith('https://beforebedtime.net/launcher/privacy');
  });

  it('plays only a lightweight zoom transition from splash into the main launcher', async () => {
    vi.useFakeTimers();
    const api = makeApi(profile);
    const { container } = render(<App api={api} />);

    fireEvent.click(screen.getByRole('button', { name: /click to start/i }));
    await act(async () => {
      await Promise.resolve();
    });

    expect(container.querySelector('.splash.is-exiting')).toBeInTheDocument();
    expect(container.querySelector('.route-transition')).not.toBeInTheDocument();

    await act(async () => {
      vi.advanceTimersByTime(220);
      await Promise.resolve();
    });

    expect(container.querySelector('.main.route-enter')).toBeInTheDocument();
    expect(screen.getByText('NORTHVALE / SEASON 01')).toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(320);
    });
    expect(container.querySelector('.route-transition')).not.toBeInTheDocument();
  });

  it('skips Microsoft auth after Click to start when a session was restored', async () => {
    const user = userEvent.setup();
    render(<App api={makeApi(profile)} />);

    await user.click(screen.getByRole('button', { name: /click to start/i }));

    expect(await screen.findByText('NORTHVALE / SEASON 01')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /login to microsoft/i })).not.toBeInTheDocument();
  });

  it('shows a clean renderer-safe Microsoft login error', async () => {
    const user = userEvent.setup();
    const api = makeApi();
    api.auth.loginMicrosoft = vi.fn(async () => ({
      ok: false as const,
      error: {
        code: 'AUTH_CONFIG_MISSING' as AuthErrorCode,
        message: 'Microsoft Login is not configured for this build.'
      }
    }));
    render(<App api={api} />);

    await user.click(screen.getByRole('button', { name: /click to start/i }));
    await user.click(await screen.findByLabelText(/accept the terms/i));
    await user.click(screen.getByRole('button', { name: /login to microsoft/i }));

    expect(await screen.findByText('Microsoft Login is not configured for this build.')).toBeInTheDocument();
    expect(screen.queryByText(/error invoking remote method/i)).not.toBeInTheDocument();
  });

  it('returns to Microsoft auth after logout', async () => {
    const user = userEvent.setup();
    const api = makeApi(profile);
    render(<App api={api} />);

    await user.click(screen.getByRole('button', { name: /click to start/i }));
    await screen.findByText('NORTHVALE / SEASON 01');
    await user.click(within(screen.getByRole('navigation', { name: 'Main tabs' })).getByRole('button', { name: 'Settings' }));
    await user.click(screen.getByRole('button', { name: /^Logout$/i }));

    expect(await screen.findByRole('button', { name: /login to microsoft/i })).toBeInTheDocument();
    expect(api.auth.logout).toHaveBeenCalledOnce();
  });

  it('shows managed Java launch progress from the main process', async () => {
    const user = userEvent.setup();
    const api = makeApi(profile);
    let progressListener: ((progress: ProjectProgressEvent) => void) | undefined;
    api.project.onProgress = vi.fn((listener) => {
      progressListener = listener;
      return () => undefined;
    });
    api.project.launch = vi.fn(
      () => new Promise<IpcResult<LaunchResult>>(() => undefined)
    );
    render(<App api={api} />);

    await user.click(screen.getByRole('button', { name: /click to start/i }));
    await screen.findByText('NORTHVALE / SEASON 01');
    await user.click(await screen.findByRole('button', { name: /^play$/i }));
    act(() => {
      progressListener?.({
        projectId: 'northvale',
        phase: 'DOWNLOADING_JAVA',
        percent: 42,
        message: 'Downloading Java 17'
      });
    });

    expect(await screen.findByText('DOWNLOADING JAVA 42%')).toBeInTheDocument();
  });

  it('shows CHECKING RUNTIME without claiming Java is downloading', async () => {
    const user = userEvent.setup();
    const api = makeApi(profile);
    let progressListener: ((progress: ProjectProgressEvent) => void) | undefined;
    api.project.onProgress = vi.fn((listener) => {
      progressListener = listener;
      return () => undefined;
    });
    api.project.launch = vi.fn(
      () => new Promise<IpcResult<LaunchResult>>(() => undefined)
    );
    render(<App api={api} />);

    await user.click(screen.getByRole('button', { name: /click to start/i }));
    await screen.findByText('NORTHVALE / SEASON 01');
    await user.click(await screen.findByRole('button', { name: /^play$/i }));
    act(() => {
      progressListener?.({
        projectId: 'northvale',
        phase: 'CHECKING_RUNTIME',
        message: 'Checking cached runtime'
      });
    });

    expect(await screen.findByText('CHECKING RUNTIME')).toBeInTheDocument();
    expect(screen.queryByText(/DOWNLOADING JAVA/)).not.toBeInTheDocument();
  });

  it('shows STOP while Minecraft is running and returns to PLAY after stopping', async () => {
    const user = userEvent.setup();
    const api = makeApi(profile);
    let launchStateListener: ((state: ProjectLaunchState) => void) | undefined;
    api.project.onLaunchState = vi.fn((listener) => {
      launchStateListener = listener;
      return () => undefined;
    });
    api.project.stop = vi.fn(async () => {
      const state = { status: 'idle' as const };
      launchStateListener?.(state);
      return state;
    });
    api.project.launch = vi.fn(async () => {
      launchStateListener?.({
        status: 'running',
        projectId: 'northvale',
        pid: 1234,
        startedAt: '2026-07-06T00:00:00.000Z'
      });
      return { ok: true as const, value: { pid: 1234 } };
    });
    render(<App api={api} />);

    await user.click(screen.getByRole('button', { name: /click to start/i }));
    await screen.findByText('NORTHVALE / SEASON 01');
    await user.click(await screen.findByRole('button', { name: /^play$/i }));

    expect(await screen.findByRole('button', { name: /^stop$/i })).toBeInTheDocument();
    expect(api.project.launch).toHaveBeenCalledOnce();

    await user.click(screen.getByRole('button', { name: /^stop$/i }));

    expect(api.project.stop).toHaveBeenCalledWith('northvale');
    expect(await screen.findByRole('button', { name: /^play$/i })).toBeInTheDocument();
  });

  it('auto-downloads launcher updates without blocking PLAY when update checks fail', async () => {
    const user = userEvent.setup();
    const api = makeApi(profile);
    let updaterListener: ((state: LauncherUpdateState) => void) | undefined;
    api.updater.onState = vi.fn((listener) => {
      updaterListener = listener;
      return () => undefined;
    });
    api.updater.download = vi.fn(async (): Promise<LauncherUpdateState> => ({ status: 'downloading', version: '0.1.1', percent: 45 }));
    render(<App api={api} />);

    await user.click(screen.getByRole('button', { name: /click to start/i }));
    await screen.findByText('NORTHVALE / SEASON 01');
    act(() => {
      updaterListener?.({ status: 'error', message: 'GitHub offline' });
    });
    expect(await screen.findByRole('button', { name: /^play$/i })).toBeEnabled();

    act(() => {
      updaterListener?.({ status: 'available', version: '0.1.1' });
    });
    expect(await screen.findByRole('button', { name: /downloading update/i })).toBeDisabled();
    expect(screen.queryByRole('button', { name: /update launcher/i })).not.toBeInTheDocument();
    expect(api.updater.download).not.toHaveBeenCalled();

    act(() => {
      updaterListener?.({ status: 'downloading', version: '0.1.1', percent: 45 });
    });
    expect(await screen.findByText('45%')).toBeInTheDocument();

    act(() => {
      updaterListener?.({ status: 'downloaded', version: '0.1.1' });
    });
    await user.click(await screen.findByRole('button', { name: /restart to update/i }));
    expect(api.updater.quitAndInstall).toHaveBeenCalledOnce();
  });

  it('shows INSTALL for a fresh project and syncs without launching', async () => {
    const user = userEvent.setup();
    const api = makeApi(profile);
    api.project.getState = vi.fn(async () => ({ state: 'install' as const, missing: 320, changed: 0, stale: 0 }));
    render(<App api={api} />);

    await user.click(screen.getByRole('button', { name: /click to start/i }));
    expect(await screen.findByRole('button', { name: /^install$/i })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /^install$/i }));

    expect(api.project.sync).toHaveBeenCalledWith('northvale');
    expect(api.project.launch).not.toHaveBeenCalled();
    expect(await screen.findByRole('button', { name: /^play$/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^play$/i })).toBeInTheDocument();
  });

  it('does not flash INSTALL while rechecking after returning from settings', async () => {
    const user = userEvent.setup();
    const api = makeApi(profile);
    let resolveRecheck: ((state: ProjectStateResult) => void) | undefined;
    api.project.getState = vi
      .fn()
      .mockResolvedValueOnce({ state: 'ready' as const, missing: 0, changed: 0, stale: 0 })
      .mockReturnValueOnce(new Promise<ProjectStateResult>((resolve) => {
        resolveRecheck = resolve;
      }));
    render(<App api={api} />);

    await user.click(screen.getByRole('button', { name: /click to start/i }));
    expect(await screen.findByRole('button', { name: /^play$/i })).toBeInTheDocument();
    await user.click(within(screen.getByRole('navigation', { name: 'Main tabs' })).getByRole('button', { name: 'Settings' }));
    await user.click(within(screen.getByRole('navigation', { name: 'Main tabs' })).getByRole('button', { name: 'Project' }));

    expect(screen.getByRole('button', { name: /^checking$/i })).toBeDisabled();
    expect(screen.queryByRole('button', { name: /^install$/i })).not.toBeInTheDocument();

    act(() => {
      resolveRecheck?.({ state: 'ready', missing: 0, changed: 0, stale: 0 });
    });

    expect(await screen.findByRole('button', { name: /^play$/i })).toBeInTheDocument();
  });

  it('shows UPDATE when managed files differ', async () => {
    const user = userEvent.setup();
    const api = makeApi(profile);
    api.project.getState = vi.fn(async () => ({ state: 'update' as const, missing: 1, changed: 2, stale: 1 }));
    render(<App api={api} />);

    await user.click(screen.getByRole('button', { name: /click to start/i }));
    expect(await screen.findByRole('button', { name: /^update$/i })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /^update$/i }));

    expect(api.project.sync).toHaveBeenCalledWith('northvale');
    expect(api.project.launch).not.toHaveBeenCalled();
  });

  it('shows sync progress inside the install/update action', async () => {
    const user = userEvent.setup();
    const api = makeApi(profile);
    let progressListener: ((progress: ProjectProgressEvent) => void) | undefined;
    api.project.getState = vi.fn(async () => ({ state: 'update' as const, missing: 1, changed: 0, stale: 0 }));
    api.project.onProgress = vi.fn((listener) => {
      progressListener = listener;
      return () => undefined;
    });
    api.project.sync = vi.fn(
      () => new Promise<SyncResult>(() => undefined)
    );
    const { container } = render(<App api={api} />);

    await user.click(screen.getByRole('button', { name: /click to start/i }));
    await user.click(await screen.findByRole('button', { name: /^update$/i }));
    act(() => {
      progressListener?.({
        projectId: 'northvale',
        phase: 'SYNCING',
        percent: 42,
        message: 'Downloading Northvale files'
      });
    });

    expect(await screen.findByText('SYNCING 42%')).toBeInTheDocument();
    const syncingAction = screen.getByRole('button', { name: /syncing 42%/i });
    expect(syncingAction).toBeDisabled();
    expect(within(syncingAction).getByText('SYNCING 42%')).toBeInTheDocument();
    expect(screen.getAllByText('SYNCING 42%')).toHaveLength(1);
    expect(container.querySelector('.play-progress-fill')).toHaveStyle({ width: '42%' });
  });

  it('ignores progress events from a different project', async () => {
    const user = userEvent.setup();
    const api = makeApi(profile);
    let progressListener: ((progress: ProjectProgressEvent) => void) | undefined;
    api.project.getState = vi.fn(async () => ({ state: 'update' as const, missing: 1, changed: 0, stale: 0 }));
    api.project.onProgress = vi.fn((listener) => {
      progressListener = listener;
      return () => undefined;
    });
    render(<App api={api} />);

    await user.click(screen.getByRole('button', { name: /click to start/i }));
    expect(await screen.findByRole('button', { name: /^update$/i })).toBeInTheDocument();

    act(() => {
      progressListener?.({
        projectId: 'season-two',
        phase: 'DOWNLOADING_JAVA',
        percent: 88,
        message: 'Downloading another project runtime'
      });
    });

    expect(screen.getByRole('button', { name: /^update$/i })).toBeInTheDocument();
    expect(screen.queryByText('DOWNLOADING JAVA 88%')).not.toBeInTheDocument();
  });

  it('shows working window controls on the splash screen', async () => {
    const user = userEvent.setup();
    const api = makeApi();
    render(<App api={api} />);

    await user.click(screen.getByRole('button', { name: 'Minimize' }));
    await user.click(screen.getByRole('button', { name: 'Maximize' }));
    await user.click(screen.getByRole('button', { name: 'Close' }));

    expect(api.window?.minimize).toHaveBeenCalledOnce();
    expect(api.window?.toggleMaximize).toHaveBeenCalledOnce();
    expect(api.window?.close).toHaveBeenCalledOnce();
  });

  it('keeps working window controls available across every main tab', async () => {
    const user = userEvent.setup();
    const api = makeApi(profile);
    render(<App api={api} />);

    await user.click(screen.getByRole('button', { name: /click to start/i }));
    await screen.findByText('NORTHVALE / SEASON 01');

    const projectNavigation = screen.getByRole('navigation', { name: 'Main tabs' });
    for (const tab of ['Project', 'Shop', 'Settings']) {
      if (tab !== 'Project') {
        await user.click(within(projectNavigation).getByRole('button', { name: tab }));
      }
      expect(screen.getByRole('button', { name: 'Minimize' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Maximize' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Close' })).toBeInTheDocument();
    }

    await user.click(screen.getByRole('button', { name: 'Minimize' }));
    await user.click(screen.getByRole('button', { name: 'Maximize' }));
    await user.click(screen.getByRole('button', { name: 'Close' }));

    expect(api.window?.minimize).toHaveBeenCalledOnce();
    expect(api.window?.toggleMaximize).toHaveBeenCalledOnce();
    expect(api.window?.close).toHaveBeenCalledOnce();
  });

  it('requires Terms acceptance before Microsoft login and opens Northvale project after login', async () => {
    const user = userEvent.setup();
    const api = makeApi();
    render(<App api={api} />);

    await user.click(screen.getByRole('button', { name: /click to start/i }));
    expect(await screen.findByRole('button', { name: /login to microsoft/i })).toBeDisabled();

    await user.click(screen.getByLabelText(/accept the terms/i));
    await user.click(screen.getByRole('button', { name: /login to microsoft/i }));

    expect(await screen.findByText('NORTHVALE / SEASON 01')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^Project$/i })).toHaveClass('active');
  });

  it('uses the Minecraft profile UUID to render the account skin in settings', async () => {
    const user = userEvent.setup();
    render(<App api={makeApi(profile)} />);

    await user.click(screen.getByRole('button', { name: /click to start/i }));
    await screen.findByText('NORTHVALE / SEASON 01');
    await user.click(within(screen.getByRole('navigation', { name: 'Main tabs' })).getByRole('button', { name: 'Settings' }));

    const skin = await screen.findByAltText('Zlevyn Minecraft skin');
    expect(skin).toHaveAttribute('src', expect.stringContaining(profile.id));
  });

  it('keeps tab hit areas aligned with the visible tab blocks', () => {
    const css = readFileSync(resolve(process.cwd(), 'src/renderer/styles.css'), 'utf8');
    const rootRule = css.match(/:root\s*\{([^}]*)\}/s)?.[1] || '';
    const windowChromeRule = css.match(/\.window-chrome\s*\{([^}]*)\}/s)?.[1] || '';
    const controlsRule = css.match(/\.window-controls\s*\{([^}]*)\}/s)?.[1] || '';
    const controlButtonRule = css.match(/\.window-controls button\s*\{([^}]*)\}/s)?.[1] || '';
    const maximizeIconRule = css.match(/\.maximize-icon\s*\{([^}]*)\}/s)?.[1] || '';
    const restoreIconRule = css.match(/\.maximize-icon\.restore\s*\{([^}]*)\}/s)?.[1] || '';
    const restoreLayersRule = css.match(
      /\.maximize-icon\.restore::before,\s*\.maximize-icon\.restore::after\s*\{([^}]*)\}/s
    )?.[1] || '';
    const dragRule = css.match(/\.window-drag-region\s*\{([^}]*)\}/s)?.[1] || '';
    const splashRule = css.match(/\.splash\s*\{([^}]*)\}/s)?.[1] || '';
    const authRule = css.match(/\.auth\s*\{([^}]*)\}/s)?.[1] || '';
    const topbarRule = css.match(/\.topbar\s*\{([^}]*)\}/s)?.[1] || '';
    const tabsRule = css.match(/\.tabs\s*\{([^}]*)\}/s)?.[1] || '';
    const tabRule = css.match(/\.tab\s*\{([^}]*)\}/s)?.[1] || '';

    expect(rootRule).toContain('--window-controls-clearance: 118px');
    expect(dragRule).toContain('position: fixed');
    expect(dragRule).toContain('right: var(--window-controls-clearance)');
    expect(dragRule).toContain('-webkit-app-region: drag');
    expect(windowChromeRule).toContain('width: max-content');
    expect(windowChromeRule).toContain('pointer-events: auto');
    expect(windowChromeRule).toContain('-webkit-app-region: no-drag');
    expect(windowChromeRule).toContain('z-index: 1300');
    expect(windowChromeRule).not.toContain('left: 0');
    expect(controlsRule).toContain('position: static');
    expect(controlsRule).toContain('-webkit-app-region: no-drag');
    expect(controlButtonRule).toContain('-webkit-app-region: no-drag');
    expect(maximizeIconRule).toContain('position: relative');
    expect(maximizeIconRule).toContain('box-sizing: border-box');
    expect(restoreIconRule).toContain('width: 12px');
    expect(restoreIconRule).toContain('height: 12px');
    expect(restoreIconRule).toContain('border: 0');
    expect(restoreLayersRule).toContain('width: 8px');
    expect(restoreLayersRule).toContain('height: 8px');
    expect(restoreLayersRule).toContain('box-sizing: border-box');
    expect(splashRule).not.toContain('-webkit-app-region: drag');
    expect(authRule).not.toContain('-webkit-app-region: drag');
    expect(topbarRule).not.toContain('-webkit-app-region: drag');
    expect(topbarRule).toContain('z-index: 1000');
    expect(tabsRule).toContain('display: flex');
    expect(tabsRule).toContain('align-items: stretch');
    expect(tabsRule).toContain('-webkit-app-region: no-drag');
    expect(tabRule).toContain('-webkit-app-region: no-drag');
  });

  it('keeps the connected header proportional with a flexible drag region', () => {
    const css = readFileSync(resolve(process.cwd(), 'src/renderer/styles.css'), 'utf8');
    const topbarRule = css.match(/\.topbar\s*\{([^}]*)\}/s)?.[1] || '';
    const tabsRule = css.match(/\.tabs\s*\{([^}]*)\}/s)?.[1] || '';
    const pickerRule = css.match(/\.project-picker\s*\{([^}]*)\}/s)?.[1] || '';
    const topbarDragRule = css.match(/\.topbar-drag-region\s*\{([^}]*)\}/s)?.[1] || '';
    const topbarActionRule = css.match(/\.topbar-action\s*\{([^}]*)\}/s)?.[1] || '';

    expect(topbarRule).toContain('position: relative');
    expect(topbarRule).toContain('grid-template-columns: auto minmax(0, 1fr) auto');
    expect(tabsRule).toContain('display: flex');
    expect(pickerRule).toContain('width: 302px');
    expect(topbarDragRule).toContain('flex: 1 1 auto');
    expect(topbarDragRule).toContain('-webkit-app-region: drag');
    expect(topbarActionRule).toContain('width: 112px');
  });

  it('keeps the launcher update action clear of fixed window controls', () => {
    const css = readFileSync(resolve(process.cwd(), 'src/renderer/styles.css'), 'utf8');
    const topbarRule = css.match(/\.topbar\s*\{([^}]*)\}/s)?.[1] || '';
    const updateButtonRule = css.match(/\.update-button\s*\{([^}]*)\}/s)?.[1] || '';

    expect(topbarRule).toContain('padding: 0 calc(var(--window-controls-clearance) + 8px) 0 14px');
    expect(updateButtonRule).toContain('display: inline-flex');
    expect(updateButtonRule).toContain('align-items: center');
    expect(updateButtonRule).toContain('justify-content: center');
    expect(updateButtonRule).toContain('-webkit-app-region: no-drag');
  });

  it('keeps the project background static while retaining lightweight interface animation', () => {
    const css = readFileSync(resolve(process.cwd(), 'src/renderer/styles.css'), 'utf8');
    const projectPanelRule = css.match(/\.project-panel\s*\{([^}]*)\}/s)?.[1] || '';
    const projectPanelBeforeRule = css.match(/\.project-panel::before\s*\{([^}]*)\}/s)?.[1] || '';
    const projectStageAfterRule = css.match(/\.project-stage::after\s*\{([^}]*)\}/s)?.[1] || '';
    const projectStageRule = css.match(/\.project-stage\s*\{([^}]*)\}/s)?.[1] || '';
    const projectImageRule = css.match(/\.project-image\s*\{([^}]*)\}/s)?.[1] || '';
    const splashExitRule = css.match(/\.splash\.is-exiting \.splash-inner\s*\{([^}]*)\}/s)?.[1] || '';
    const mainEnterShellRule = css.match(/\.main\.route-enter \.launcher-shell\s*\{([^}]*)\}/s)?.[1] || '';
    const projectBoardRule = css.match(/\.project-board\s*\{([^}]*)\}/s)?.[1] || '';
    const projectHeroActionsRule = css.match(/\.project-hero-actions\s*\{([^}]*)\}/s)?.[1] || '';
    const projectDotsRule = css.match(/\.project-dots\s*\{([^}]*)\}/s)?.[1] || '';
    const settingsPanelRule = css.match(/\.settings-panel\s*\{([^}]*)\}/s)?.[1] || '';
    const settingsLayoutRule = css.match(/\.settings-layout\s*\{([^}]*)\}/s)?.[1] || '';
    const oldSettingsSpanOverride = css.match(/\.directory-card,\s*\.display-card,\s*\.memory-card\s*\{([^}]*)\}/s)?.[1] || '';

    expect(css).toContain('@keyframes project-board-in');
    expect(css).not.toContain('@keyframes project-image-drift');
    expect(css).toContain('@keyframes splash-zoom-exit');
    expect(css).toContain('@keyframes main-zoom-enter');
    expect(css).not.toContain('@keyframes star-warp');
    expect(css).not.toContain('@keyframes route-wipe');
    expect(css).not.toContain('@keyframes route-scan');
    expect(css).not.toMatch(/\.route-transition/);
    expect(splashExitRule).toContain('animation: splash-zoom-exit');
    expect(mainEnterShellRule).toContain('animation: main-zoom-enter');
    expect(projectStageRule).toContain('animation: project-board-in');
    expect(projectImageRule).not.toContain('animation');
    expect(projectPanelRule).toContain('grid-template-rows: minmax(0, 1fr)');
    expect(projectPanelRule).toContain('position: relative');
    expect(projectPanelRule).toContain('overflow: hidden');
    expect(projectPanelBeforeRule).toContain('display: none');
    expect(projectPanelBeforeRule).not.toContain('animation');
    expect(projectStageAfterRule).not.toContain('linear-gradient(rgba(255, 255, 255, 0.026) 1px, transparent 1px)');
    expect(projectPanelRule).not.toContain('58px');
    expect(projectBoardRule).toContain('padding: 24px');
    expect(projectStageRule).toContain('height: 100%');
    expect(projectStageRule).toContain('border-radius: 22px');
    expect(projectHeroActionsRule).toContain('display: flex');
    expect(projectDotsRule).toContain('position: absolute');
    expect(projectDotsRule).toContain('bottom: 24px');
    expect(projectDotsRule).toContain('animation: project-dots-in');
    expect(settingsPanelRule).toContain('clamp(34px, 4vw, 78px)');
    expect(settingsLayoutRule).toContain('grid-template-areas');
    expect(settingsLayoutRule).toContain('minmax(520px, 1fr)');
    expect(oldSettingsSpanOverride).not.toContain('grid-column');
  });

  it('uses Thai-safe typography for the project headline', () => {
    const css = readFileSync(resolve(process.cwd(), 'src/renderer/styles.css'), 'utf8');
    const appSource = readFileSync(resolve(process.cwd(), 'src/renderer/App.tsx'), 'utf8');
    const packageJson = JSON.parse(readFileSync(resolve(process.cwd(), 'package.json'), 'utf8')) as {
      dependencies: Record<string, string>;
      build: {
        extraResources?: Array<{ from: string; to: string }>;
      };
    };
    const heroHeadingRule = css.match(/\.project-hero-copy h1\s*\{([^}]*)\}/s)?.[1] || '';
    const heroSupportingRule = css.match(/\.project-hero-copy p\s*\{([^}]*)\}/s)?.[1] || '';

    expect(packageJson.dependencies['@ibm/plex-sans-thai']).toBe('1.1.0');
    expect(packageJson.build.extraResources).toContainEqual({
      from: 'node_modules/@ibm/plex-sans-thai/LICENSE.txt',
      to: 'licenses/IBM-Plex-Sans-Thai-OFL-1.1.txt'
    });
    expect(appSource.indexOf("@ibm/plex-sans-thai/css/ibm-plex-sans-thai-default.css")).toBeLessThan(
      appSource.indexOf("'./styles.css'")
    );
    expect(heroHeadingRule).toContain('"IBM Plex Sans Thai"');
    expect(heroHeadingRule).toContain('font-weight: 600');
    expect(heroHeadingRule).toContain('font-size: clamp(40px, 4.15vw, 58px)');
    expect(heroHeadingRule).toContain('line-height: 1.16');
    expect(heroHeadingRule).toContain('letter-spacing: 0');
    expect(heroHeadingRule).toContain('max-width: 680px');
    expect(heroSupportingRule).toContain('"IBM Plex Sans Thai"');
    expect(heroSupportingRule).toContain('font-weight: 400');
    expect(heroSupportingRule).toContain('line-height: 1.6');
  });

  it('keeps the content drawer neutral and free of decorative glow', () => {
    const css = readFileSync(resolve(process.cwd(), 'src/renderer/project-content-drawer.css'), 'utf8');
    const panelRule = css.match(/\.project-panel\s*\{([^}]*)\}/s)?.[1] || '';
    const drawerHeaderRule = css.match(/\.content-drawer-header\s*\{([^}]*)\}/s)?.[1] || '';
    const drawerFooterRule = css.match(/\.content-drawer-footer\s*\{([^}]*)\}/s)?.[1] || '';
    const toggleFocusRule = css.match(/\.content-toggle:hover,\s*\.content-toggle:focus-visible\s*\{([^}]*)\}/s)?.[1] || '';

    expect(panelRule).toContain('--content-drawer-width: clamp(420px, 36vw, 480px)');
    expect(drawerHeaderRule).toContain('border-bottom: 0');
    expect(drawerFooterRule).toContain('border-top: 0');
    expect(toggleFocusRule).not.toContain('box-shadow');
    expect(css).not.toMatch(/content-(?:drawer|toggle)-star/);
    expect(css).not.toContain('.content-drawer-handle');
  });

  it('keeps PLAY readable across hover, pressed, focus, disabled, and progress states', () => {
    const css = readFileSync(resolve(process.cwd(), 'src/renderer/styles.css'), 'utf8');
    const playRule = css.match(/\.play-button\s*\{([^}]*)\}/s)?.[1] || '';
    const hoverRule = css.match(/\.play-button:hover:not\(:disabled\)\s*\{([^}]*)\}/s)?.[1] || '';
    const pressedRule = css.match(/\.play-button:active:not\(:disabled\)\s*\{([^}]*)\}/s)?.[1] || '';
    const focusRule = css.match(/\.play-button:focus-visible\s*\{([^}]*)\}/s)?.[1] || '';
    const disabledRule = css.match(/\.play-button:disabled\s*\{([^}]*)\}/s)?.[1] || '';
    const progressRule = css.match(/\.play-progress-fill\s*\{([^}]*)\}/s)?.[1] || '';
    const genericDarkHover = css.match(
      /\.settings-button:hover,\s*\.project-pill:hover,\s*\.project-arrow:hover\s*\{([^}]*)\}/s
    )?.[0] || '';

    expect(playRule).toContain('background: #f4f4f2');
    expect(playRule).toContain('color: #0b0b0b');
    expect(hoverRule).toContain('background: #fff');
    expect(hoverRule).toContain('color: #050505');
    expect(hoverRule).toContain('transform: translateY(-1px)');
    expect(pressedRule).toContain('background: #d9d9d6');
    expect(pressedRule).toContain('transform: translateY(0)');
    expect(focusRule).toContain('outline: 1px solid');
    expect(focusRule).not.toContain('box-shadow');
    expect(disabledRule).toContain('opacity: 1');
    expect(disabledRule).toContain('color:');
    expect(progressRule).toContain('background:');
    expect(genericDarkHover).not.toContain('.play-button:hover');
  });

  it('keeps route transition animation lightweight enough for Electron', () => {
    const css = readFileSync(resolve(process.cwd(), 'src/renderer/styles.css'), 'utf8');
    const transitionKeyframes = [
      css.match(/@keyframes splash-zoom-exit\s*\{([\s\S]*?)\n\}/)?.[1] || '',
      css.match(/@keyframes main-zoom-enter\s*\{([\s\S]*?)\n\}/)?.[1] || '',
    ].join('\n');

    expect(transitionKeyframes).not.toMatch(/filter\s*:/);
    expect(transitionKeyframes).not.toMatch(/blur\(/);
    expect(css).not.toMatch(/\.route-transition/);
  });

  it('keeps fullscreen local until Save applies display settings', async () => {
    const user = userEvent.setup();
    const api = makeApi(profile);
    const windowApi = api.window as NonNullable<LauncherApi['window']> & {
      setFullscreen: ReturnType<typeof vi.fn>;
      applyDisplaySettings: ReturnType<typeof vi.fn>;
    };
    render(<App api={api} />);

    await user.click(screen.getByRole('button', { name: /click to start/i }));
    await screen.findByText('NORTHVALE / SEASON 01');
    await user.click(within(screen.getByRole('navigation', { name: 'Main tabs' })).getByRole('button', { name: 'Settings' }));
    await user.click(screen.getByRole('checkbox', { name: /fullscreen/i }));

    expect(windowApi.setFullscreen).not.toHaveBeenCalled();
    expect(windowApi.applyDisplaySettings).not.toHaveBeenCalled();
    expect(screen.getByRole('checkbox', { name: /fullscreen/i })).toBeChecked();

    await user.click(screen.getByRole('combobox', { name: /resolution/i }));
    await user.click(screen.getByRole('option', { name: '1920 x 1080' }));
    await user.click(screen.getByRole('button', { name: /^Save$/i }));

    expect(api.settings.save).toHaveBeenCalledWith(expect.objectContaining({
      width: 1920,
      height: 1080,
      fullscreen: true
    }));
    expect(windowApi.applyDisplaySettings).toHaveBeenCalledWith({
      width: 1920,
      height: 1080,
      fullscreen: true
    });
    expect(await screen.findByText('Saved')).toBeInTheDocument();
  });

  it('uses a custom themed resolution picker instead of a native select menu', async () => {
    const user = userEvent.setup();
    render(<App api={makeApi(profile)} />);

    await user.click(screen.getByRole('button', { name: /click to start/i }));
    await screen.findByText('NORTHVALE / SEASON 01');
    await user.click(within(screen.getByRole('navigation', { name: 'Main tabs' })).getByRole('button', { name: 'Settings' }));

    expect(screen.queryByRole('spinbutton', { name: /window width/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('spinbutton', { name: /window height/i })).not.toBeInTheDocument();

    const resolution = screen.getByRole('combobox', { name: /resolution/i });
    expect(resolution.tagName).not.toBe('SELECT');
    expect(resolution).toHaveAttribute('aria-expanded', 'false');

    await user.click(resolution);
    expect(resolution).toHaveAttribute('aria-expanded', 'true');

    await user.click(screen.getByRole('option', { name: '1920 x 1080' }));
    expect(screen.queryByRole('listbox', { name: /resolution options/i })).not.toBeInTheDocument();
    expect(resolution).toHaveTextContent('1920 x 1080');
  });

  it('styles the resolution picker as a dark launcher overlay', () => {
    const css = readFileSync(resolve(process.cwd(), 'src/renderer/styles.css'), 'utf8');
    const triggerRule = css.match(/\.resolution-trigger\s*\{([^}]*)\}/s)?.[1] || '';
    const menuRule = css.match(/\.resolution-menu\s*\{([^}]*)\}/s)?.[1] || '';
    const optionRule = css.match(/\.resolution-option\s*\{([^}]*)\}/s)?.[1] || '';
    const selectedRule = css.match(/\.resolution-option\.selected\s*\{([^}]*)\}/s)?.[1] || '';
    const displayCardRule = css.match(/\.display-card\s*\{([^}]*)\}/s)?.[1] || '';

    expect(displayCardRule).toContain('overflow: visible');
    expect(displayCardRule).toContain('z-index: 5');
    expect(triggerRule).toContain('border-radius: 999px');
    expect(menuRule).toContain('background: #020202');
    expect(menuRule).toContain('border: 1px solid #2a2a2a');
    expect(menuRule).toContain('border-radius: 16px');
    expect(optionRule).toContain('background: transparent');
    expect(selectedRule).toContain('background: rgba(255, 255, 255, 0.12)');
  });

  it('browses for an app directory and keeps the current path on cancel', async () => {
    const user = userEvent.setup();
    const api = makeApi(profile);
    const settingsApi = api.settings as LauncherApi['settings'] & { selectAppDirectory: ReturnType<typeof vi.fn> };
    render(<App api={api} />);

    await user.click(screen.getByRole('button', { name: /click to start/i }));
    await screen.findByText('NORTHVALE / SEASON 01');
    await user.click(within(screen.getByRole('navigation', { name: 'Main tabs' })).getByRole('button', { name: 'Settings' }));

    const directoryInput = screen.getByLabelText('App Directory');
    expect(directoryInput).toHaveValue('C:/Users/zLip/AppData/Roaming/.beforebedtime-launcher');
    expect(directoryInput).toHaveAttribute('readonly');

    await user.click(screen.getByRole('button', { name: /browse/i }));
    expect(settingsApi.selectAppDirectory).toHaveBeenCalledWith('C:/Users/zLip/AppData/Roaming/.beforebedtime-launcher');
    expect(directoryInput).toHaveValue('D:/Games/BeforeBedtime');

    settingsApi.selectAppDirectory.mockResolvedValueOnce(null);
    await user.click(screen.getByRole('button', { name: /browse/i }));
    expect(directoryInput).toHaveValue('D:/Games/BeforeBedtime');
  });

  it('shows a safe save failure instead of a raw IPC error', async () => {
    const user = userEvent.setup();
    const api = makeApi(profile);
    api.settings.save = vi.fn(async () => {
      throw new Error('Error invoking remote method settings:save stack trace');
    });
    render(<App api={api} />);

    await user.click(screen.getByRole('button', { name: /click to start/i }));
    await screen.findByText('NORTHVALE / SEASON 01');
    await user.click(within(screen.getByRole('navigation', { name: 'Main tabs' })).getByRole('button', { name: 'Settings' }));
    await user.click(screen.getByRole('button', { name: /^Save$/i }));

    expect(await screen.findByText('Save failed')).toBeInTheDocument();
    expect(screen.queryByText(/error invoking remote method/i)).not.toBeInTheDocument();
  });

  it('makes the app directory control read as a full block', () => {
    const css = readFileSync(resolve(process.cwd(), 'src/renderer/styles.css'), 'utf8');
    const directoryCardRule = css.match(/\.directory-card\s*\{([^}]*)\}/s)?.[1] || '';
    const directoryControlRule = css.match(/\.directory-control\s*\{([^}]*)\}/s)?.[1] || '';
    const directoryInputRule = css.match(/\.directory-input\s*\{([^}]*)\}/s)?.[1] || '';

    expect(directoryCardRule).toContain('min-height: 164px');
    expect(directoryCardRule).toContain('display: grid');
    expect(directoryControlRule).toContain('grid-template-columns: minmax(0, 1fr) auto');
    expect(directoryInputRule).toContain('height: 50px');
    expect(directoryInputRule).toContain('border-radius: 14px');
  });

  it('shows only three gallery dots while keeping the full gallery in rotation', async () => {
    const user = userEvent.setup();
    render(<App api={makeApi()} />);

    await user.click(screen.getByRole('button', { name: /click to start/i }));
    await user.click(await screen.findByLabelText(/accept the terms/i));
    await user.click(screen.getByRole('button', { name: /login to microsoft/i }));

    const dots = await screen.findAllByRole('button', { name: /gallery image/i });
    expect(dots).toHaveLength(3);
  });
});
