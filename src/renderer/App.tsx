import { useEffect, useMemo, useRef, useState } from 'react';
import type {
  LauncherUpdateState,
  LauncherManifest,
  LauncherSettings,
  SafeMinecraftProfile
} from '../shared/types';
import { NORTHVALE_PROJECT_ID } from '../shared/types';
import type { LauncherApi } from './launcherApi';
import { fallbackManifest, getLauncherApi } from './launcherApi';
import { DiscordIcon, TikTokIcon, YouTubeIcon } from './icons';
import { LauncherHeader } from './LauncherHeader';
import { ProjectPanel as ProjectPage } from './ProjectPanel';
import './styles.css';

type Screen = 'splash' | 'auth' | 'main';
type Tab = 'project' | 'shop' | 'settings';
type SaveState = 'idle' | 'saving' | 'saved' | 'failed';
type TransitionPhase = 'idle' | 'splash-exit' | 'auth-enter' | 'main-enter';

const routeSwitchDelayMs = 180;
const routeTransitionDurationMs = 430;

const socialLinks = [
  { label: 'YouTube', href: 'https://www.youtube.com/@BeforeBedtimeProject', icon: <YouTubeIcon /> },
  { label: 'TikTok', href: 'https://www.tiktok.com/@beforebedtimeproject', icon: <TikTokIcon /> },
  { label: 'Discord', href: 'https://discord.gg/V5KaAfDpzw', icon: <DiscordIcon /> }
];

const resolutionPresets = [
  { label: '1280 x 720', width: 1280, height: 720 },
  { label: '1366 x 768', width: 1366, height: 768 },
  { label: '1600 x 900', width: 1600, height: 900 },
  { label: '1920 x 1080', width: 1920, height: 1080 },
  { label: '2560 x 1440', width: 2560, height: 1440 }
];

const splashStars = Array.from({ length: 52 }, (_, index) => ({
  left: `${(index * 37 + 7) % 96}%`,
  top: `${(index * 53 + 19) % 108}%`,
  size: `${8 + (index % 5) * 3.2}px`,
  duration: `${11 + (index % 7) * 1.3}s`,
  delay: `-${(index * 1.17) % 13}s`,
  opacity: `${0.34 + (index % 4) * 0.1}`
}));

function MicrosoftMark() {
  return (
    <span className="microsoft-mark" aria-hidden="true">
      <span />
      <span />
      <span />
      <span />
    </span>
  );
}

function getMinecraftSkinUrl(profile: SafeMinecraftProfile | null): string | null {
  if (!profile?.id || profile.id === 'Not connected') return null;
  return `https://mc-heads.net/avatar/${profile.id}/96`;
}

function getResolutionValue(width: number, height: number): string {
  return `${width}x${height}`;
}

function WindowControls({ api }: { api: LauncherApi }) {
  const [maximized, setMaximized] = useState(false);

  async function toggleMaximize() {
    if (!api.window) return;
    setMaximized(await api.window.toggleMaximize());
  }

  return (
    <>
      <div className="window-drag-region" />
      <div className="window-chrome" aria-label="Window controls">
        <div className="window-controls">
          <button type="button" onClick={() => api.window?.minimize()} aria-label="Minimize">
            <span className="minimize-icon" aria-hidden="true" />
          </button>
          <button type="button" onClick={toggleMaximize} aria-label={maximized ? 'Restore' : 'Maximize'}>
            <span className={`maximize-icon ${maximized ? 'restore' : ''}`} aria-hidden="true" />
          </button>
          <button className="close-control" type="button" onClick={() => api.window?.close()} aria-label="Close">
            <span className="close-icon" aria-hidden="true" />
          </button>
        </div>
      </div>
    </>
  );
}

function Splash({ onStart, api, isExiting }: { onStart: () => void; api: LauncherApi; isExiting: boolean }) {
  return (
    <section className={`screen splash ${isExiting ? 'is-exiting' : ''}`}>
      <div className="splash-stars" aria-hidden="true">
        {splashStars.map((star, index) => (
          <svg
            className="star-particle"
            key={index}
            viewBox="0 0 24 24"
            style={{
              '--star-left': star.left,
              '--star-top': star.top,
              '--star-size': star.size,
              '--star-duration': star.duration,
              '--star-delay': star.delay,
              '--star-opacity': star.opacity
            } as React.CSSProperties}
          >
            <path d="M12 0c.62 7.52 4.48 11.38 12 12-7.52.62-11.38 4.48-12 12C11.38 16.48 7.52 12.62 0 12 7.52 11.38 11.38 7.52 12 0Z" />
          </svg>
        ))}
      </div>
      <div className="splash-inner">
        <div className="logo-hit">
          <div className="splash-wordmark">BEFOREBEDTIME</div>
        </div>
        <div className="family">FAMILY</div>
        <button className="start" type="button" onClick={onStart}>
          <span>Click to start</span>
          <span className="start-line" aria-hidden="true" />
        </button>
        <div className="socials" aria-label="Social links">
          {socialLinks.map((link) => (
            <button className="social" key={link.label} type="button" aria-label={link.label} onClick={() => api.shell.openExternal(link.href)}>
              {link.icon}
            </button>
          ))}
        </div>
      </div>
    </section>
  );
}

function AuthScreen({
  api,
  onLogin,
  isEntering
}: {
  api: LauncherApi;
  onLogin: (profile: SafeMinecraftProfile) => void;
  isEntering: boolean;
}) {
  const [accepted, setAccepted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function login() {
    if (!accepted || loading) return;
    setLoading(true);
    setError(null);
    try {
      const result = await api.auth.loginMicrosoft();
      if (!result.ok) {
        setError(result.error.message);
        return;
      }
      onLogin(result.value);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className={`screen auth ${isEntering ? 'route-enter' : ''}`}>
      <svg className="auth-waves" viewBox="0 0 1200 700" preserveAspectRatio="none" aria-hidden="true">
        <path className="wave wave-top" d="M-50 180 C 260 105, 455 130, 650 200 S 980 245, 1250 130" />
        <path className="wave wave-bottom" d="M-50 520 C 240 465, 405 520, 620 470 S 960 430, 1250 510" />
      </svg>
      <div className="auth-inner">
        <button className="auth-button" type="button" disabled={!accepted || loading} onClick={login}>
          <MicrosoftMark />
          <span className="auth-arrow" aria-hidden="true">{'->'}</span>
          <span className="auth-text">{loading ? 'Logging in' : 'Login to Microsoft'}</span>
        </button>
        <label className="terms">
          <input
            className="terms-input"
            type="checkbox"
            checked={accepted}
            onChange={(event) => setAccepted(event.target.checked)}
            aria-label="Accept the Terms of Service and Privacy Policy"
          />
          <span className="terms-box" aria-hidden="true">
            <svg viewBox="0 0 16 16">
              <path d="M3.2 8.4 6.5 11.6 12.9 4.7" />
            </svg>
          </span>
          <span>
            I accept the{' '}
            <button type="button" className="link-button" onClick={() => api.shell.openExternal('https://beforebedtime.net/launcher/terms')}>
              Terms of Service
            </button>{' '}
            and{' '}
            <button type="button" className="link-button" onClick={() => api.shell.openExternal('https://beforebedtime.net/launcher/privacy')}>
              Privacy Policy
            </button>
          </span>
        </label>
        {error ? <div className="auth-error">{error}</div> : null}
      </div>
    </section>
  );
}

function SettingsPanel({
  api,
  profile,
  settings,
  setSettings,
  onLogout
}: {
  api: LauncherApi;
  profile: SafeMinecraftProfile | null;
  settings: LauncherSettings;
  setSettings: (settings: LauncherSettings) => void;
  onLogout: () => void;
}) {
  const account = profile || { id: 'Not connected', name: 'Minecraft Name', avatarInitial: 'B', provider: 'microsoft' as const };
  const skinUrl = getMinecraftSkinUrl(profile);
  const [skinFailed, setSkinFailed] = useState(false);
  const [saveState, setSaveState] = useState<SaveState>('idle');
  const [resolutionOpen, setResolutionOpen] = useState(false);
  const resolutionPickerRef = useRef<HTMLDivElement>(null);
  const showSkin = Boolean(skinUrl && !skinFailed);
  const resolutionValue = getResolutionValue(settings.width, settings.height);
  const hasPresetResolution = resolutionPresets.some((preset) => getResolutionValue(preset.width, preset.height) === resolutionValue);
  const resolutionOptions = [
    ...(!hasPresetResolution ? [{ label: `${settings.width} x ${settings.height} Current`, value: resolutionValue }] : []),
    ...resolutionPresets.map((preset) => ({
      label: preset.label,
      value: getResolutionValue(preset.width, preset.height)
    }))
  ];
  const resolutionLabel = resolutionOptions.find((option) => option.value === resolutionValue)?.label || `${settings.width} x ${settings.height}`;

  useEffect(() => {
    setSkinFailed(false);
  }, [skinUrl]);

  useEffect(() => {
    if (!resolutionOpen) return undefined;

    function closeOnOutsidePointer(event: PointerEvent) {
      if (resolutionPickerRef.current?.contains(event.target as Node)) return;
      setResolutionOpen(false);
    }

    document.addEventListener('pointerdown', closeOnOutsidePointer, true);
    return () => document.removeEventListener('pointerdown', closeOnOutsidePointer, true);
  }, [resolutionOpen]);

  async function save() {
    setSaveState('saving');
    try {
      const savedSettings = await api.settings.save(settings);
      await api.window?.applyDisplaySettings?.({
        width: savedSettings.width,
        height: savedSettings.height,
        fullscreen: savedSettings.fullscreen
      });
      setSettings(savedSettings);
      setSaveState('saved');
      window.setTimeout(() => setSaveState('idle'), 1800);
    } catch {
      setSaveState('failed');
    }
  }

  async function logout() {
    const result = await api.auth.logout();
    if (result.ok) onLogout();
  }

  function updateFullscreen(fullscreen: boolean) {
    setSettings({ ...settings, fullscreen });
  }

  async function browseAppDirectory() {
    const selectedPath = await api.settings.selectAppDirectory(settings.appDirectory);
    if (!selectedPath) return;
    setSettings({ ...settings, appDirectory: selectedPath });
  }

  function updateResolution(value: string) {
    const [width, height] = value.split('x').map((part) => Number(part));
    if (!Number.isFinite(width) || !Number.isFinite(height)) return;
    setSettings({ ...settings, width, height });
  }

  function selectResolution(value: string) {
    updateResolution(value);
    setResolutionOpen(false);
  }

  return (
    <section className="settings-panel">
      <div className="settings-layout">
        <section className="settings-card account-card">
          <div className="settings-label">Account</div>
          <div className="account-row">
            <div className={`minecraft-avatar ${showSkin ? 'has-skin' : ''}`}>
              {showSkin && skinUrl ? (
                <img src={skinUrl} alt={`${account.name} Minecraft skin`} onError={() => setSkinFailed(true)} />
              ) : (
                <span>{account.avatarInitial}</span>
              )}
            </div>
            <div>
              <div className="field-caption">Minecraft Name</div>
              <div className="minecraft-name">{account.name}</div>
              <div className="minecraft-uuid">{account.id}</div>
            </div>
          </div>
          <div className="account-meta">
            <span className="status-dot" aria-hidden="true" />
            Microsoft Connected
          </div>
        </section>
        <section className="settings-card directory-card">
          <div className="settings-label">App Directory</div>
          <div className="directory-control">
            <input
              className="settings-input directory-input"
              aria-label="App Directory"
              value={settings.appDirectory}
              readOnly
            />
            <button className="browse-button" type="button" onClick={browseAppDirectory}>Browse</button>
          </div>
        </section>
        <section className="settings-card display-card">
          <div className="settings-label">Resolution</div>
          <div className="resolution-row">
            <div className="resolution-picker" ref={resolutionPickerRef}>
              <button
                className="settings-input resolution-trigger"
                type="button"
                role="combobox"
                aria-label="Resolution"
                aria-expanded={resolutionOpen}
                aria-controls="resolution-options"
                aria-haspopup="listbox"
                onClick={() => setResolutionOpen((open) => !open)}
                onKeyDown={(event) => {
                  if (event.key === 'Escape') setResolutionOpen(false);
                }}
              >
                <span>{resolutionLabel}</span>
                <span className={`resolution-chevron ${resolutionOpen ? 'open' : ''}`} aria-hidden="true" />
              </button>
              {resolutionOpen ? (
                <div className="resolution-menu" id="resolution-options" role="listbox" aria-label="Resolution options">
                  {resolutionOptions.map((option) => (
                    <button
                      className={`resolution-option ${option.value === resolutionValue ? 'selected' : ''}`}
                      key={option.value}
                      type="button"
                      role="option"
                      aria-selected={option.value === resolutionValue}
                      onClick={() => selectResolution(option.value)}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
            <label className="fullscreen-control">
              <span>Fullscreen</span>
              <input type="checkbox" checked={settings.fullscreen} onChange={(event) => updateFullscreen(event.target.checked)} />
            </label>
          </div>
        </section>
        <section className="settings-card memory-card">
          <div className="memory-head">
            <span className="settings-label">Memory</span>
            <span>{settings.memoryMb} MB</span>
          </div>
          <input
            className="memory-range"
            type="range"
            min={1024}
            max={32601}
            step={512}
            value={settings.memoryMb}
            onChange={(event) => setSettings({ ...settings, memoryMb: Number(event.target.value) })}
          />
        </section>
        <section className="settings-card links-card">
          <div className="settings-label">Links</div>
          <div className="support-social-list">
            {socialLinks.map((link) => (
              <button key={link.label} className="support-social" type="button" onClick={() => api.shell.openExternal(link.href)}>
                {link.icon}
                <span>{link.label}</span>
              </button>
            ))}
          </div>
          <button className="logout-button" type="button" onClick={logout}>
            <span aria-hidden="true">↩</span>
            Logout
          </button>
        </section>
        <div className="settings-save-row">
          <span className={`save-status ${saveState === 'failed' ? 'failed' : ''}`} role="status">
            {saveState === 'saved' ? 'Saved' : saveState === 'failed' ? 'Save failed' : ''}
          </span>
          <button className="save-button" type="button" onClick={save} disabled={saveState === 'saving'}>
            {saveState === 'saving' ? 'Saving' : 'Save'}
          </button>
        </div>
      </div>
    </section>
  );
}

function MainShell({
  api,
  profile,
  onLogout,
  isEntering
}: {
  api: LauncherApi;
  profile: SafeMinecraftProfile | null;
  onLogout: () => void;
  isEntering: boolean;
}) {
  const [activeTab, setActiveTab] = useState<Tab>('project');
  const [updateState, setUpdateState] = useState<LauncherUpdateState>({ status: 'idle' });
  const [manifest, setManifest] = useState<LauncherManifest>(fallbackManifest);
  const [settings, setSettings] = useState<LauncherSettings>({
    appDirectory: 'C:/Users/zLip/AppData/Roaming/.beforebedtime-launcher',
    width: 1280,
    height: 720,
    fullscreen: false,
    memoryMb: 8192,
    selectedProject: NORTHVALE_PROJECT_ID
  });

  useEffect(() => {
    void api.manifest.refresh().then(setManifest).catch(() => setManifest(fallbackManifest));
    void api.settings.load().then(setSettings);
  }, [api]);

  useEffect(() => {
    let active = true;
    void api.updater.getState().then((state) => {
      if (active) setUpdateState(state);
    }).catch(() => undefined);
    const dispose = api.updater.onState(setUpdateState);
    return () => {
      active = false;
      dispose();
    };
  }, [api]);

  async function runUpdateAction() {
    if (updateState.status === 'downloaded') {
      await api.updater.quitAndInstall();
    }
  }

  return (
    <section className={`screen main ${isEntering ? 'route-enter' : ''}`}>
      <div className="launcher-shell">
        <LauncherHeader
          activeTab={activeTab}
          project={manifest.projects[0] ?? fallbackManifest.projects[0]}
          updateState={updateState}
          onTabChange={setActiveTab}
          onUpdateAction={runUpdateAction}
        />
        <main className="launcher-content">
          {activeTab === 'project' ? <ProjectPage api={api} manifest={manifest} /> : null}
          {activeTab === 'shop' ? <section className="shop-panel" aria-label="Shop" /> : null}
          {activeTab === 'settings' ? (
            <SettingsPanel
              api={api}
              profile={profile}
              settings={settings}
              setSettings={setSettings}
              onLogout={onLogout}
            />
          ) : null}
        </main>
      </div>
    </section>
  );
}

export function App({ api = getLauncherApi() }: { api?: LauncherApi }) {
  const [screen, setScreen] = useState<Screen>('splash');
  const [profile, setProfile] = useState<SafeMinecraftProfile | null>(null);
  const [transitionPhase, setTransitionPhase] = useState<TransitionPhase>('idle');
  const transitionTimers = useRef<number[]>([]);
  const memoApi = useMemo(() => api, [api]);
  const restoreSession = useMemo(() => memoApi.auth.getState(), [memoApi]);

  function clearTransitionTimers() {
    transitionTimers.current.forEach((timer) => window.clearTimeout(timer));
    transitionTimers.current = [];
  }

  function scheduleTransition(callback: () => void, delay: number) {
    const timer = window.setTimeout(callback, delay);
    transitionTimers.current.push(timer);
  }

  useEffect(() => {
    void restoreSession.then((result) => {
      if (result.ok && result.value.profile) setProfile(result.value.profile);
    });
  }, [restoreSession]);

  useEffect(() => () => clearTransitionTimers(), []);

  function startFromSplash() {
    if (transitionPhase !== 'idle') return;
    clearTransitionTimers();
    setTransitionPhase('splash-exit');

    void restoreSession.then((result) => {
      const nextScreen: Screen = result.ok && result.value.profile ? 'main' : 'auth';
      if (result.ok && result.value.profile) {
        setProfile(result.value.profile);
      }

      scheduleTransition(() => {
        setScreen(nextScreen);
        setTransitionPhase(nextScreen === 'main' ? 'main-enter' : 'auth-enter');
      }, routeSwitchDelayMs);

      scheduleTransition(() => {
        setTransitionPhase('idle');
      }, routeTransitionDurationMs);
    });
  }

  function enterMain(nextProfile: SafeMinecraftProfile) {
    clearTransitionTimers();
    setProfile(nextProfile);
    setScreen('main');
    setTransitionPhase('main-enter');
    scheduleTransition(() => setTransitionPhase('idle'), 360);
  }

  let content;
  if (screen === 'splash') {
    content = (
      <Splash
        api={memoApi}
        isExiting={transitionPhase === 'splash-exit'}
        onStart={startFromSplash}
      />
    );
  } else if (screen === 'auth') {
    content = (
      <AuthScreen
        api={memoApi}
        isEntering={transitionPhase === 'auth-enter'}
        onLogin={enterMain}
      />
    );
  } else {
    content = (
      <MainShell
        api={memoApi}
        profile={profile}
        isEntering={transitionPhase === 'main-enter'}
        onLogout={() => {
          clearTransitionTimers();
          setProfile(null);
          setScreen('auth');
          setTransitionPhase('idle');
        }}
      />
    );
  }

  return (
    <>
      <WindowControls api={memoApi} />
      {content}
    </>
  );
}
