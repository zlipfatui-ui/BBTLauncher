import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { LauncherSettings, SafeMinecraftProfile } from "../shared/types";
import {
  fallbackManifest,
  getLauncherApi,
  type LauncherApi,
} from "./launcherApi";
import { resolveRendererAssetUrl } from "./assets";
import { Icon, IconDefinitions, Starfield } from "./Visuals";
import { move, resetMotion } from "./motion";
import { MainView } from "./MainView";
import { operationError } from "./operation-error";
import { version } from "../../package.json";
import "./styles.css";

type Route = "start" | "login" | "main";
export const initialSettings: LauncherSettings = {
  appDirectory: "",
  width: 1280,
  height: 720,
  fullscreen: false,
  memoryMb: 0,
  selectedProject: "sainam",
  starMotion: true,
};
export const socialLinks = [
  { name: "discord", label: "Discord", url: "https://discord.gg/V5KaAfDpzw" },
  {
    name: "tiktok",
    label: "TikTok",
    url: "https://www.tiktok.com/@beforebedtimeproject",
  },
  {
    name: "youtube",
    label: "YouTube",
    url: "https://www.youtube.com/@BeforeBedtimeProject",
  },
];
export function Socials({
  api,
  className = "social-links",
}: {
  api: LauncherApi;
  className?: string;
}) {
  return (
    <nav className={className} aria-label="โซเชียล BeforeBedtime">
      {socialLinks.map((link) => (
        <a
          key={link.name}
          href={link.url}
          onClick={(event) => {
            event.preventDefault();
            void api.shell.openExternal(link.url);
          }}
          aria-label={link.label}
        >
          <Icon name={link.name} />
          <span>{link.label}</span>
        </a>
      ))}
    </nav>
  );
}

async function prepareArtwork() {
  await Promise.all([
    document.fonts?.load('700 80px "Barlow Condensed"'),
    document.fonts?.load('400 28px "Inter Tight"'),
    document.fonts?.load('400 14px Plex'),
    document.fonts?.load('500 14px Plex'),
    document.fonts?.ready,
  ]);
  const image = new Image();
  image.src = resolveRendererAssetUrl("/assets/launcher/sainam-forest.png");
  if (image.decode) await image.decode();
}

export function App({ api = getLauncherApi() }: { api?: LauncherApi }) {
  const [route, setRoute] = useState<Route>("start");
  const [profile, setProfile] = useState<SafeMinecraftProfile | null>(null);
  const [settings, setSettings] = useState(initialSettings);
  const [manifest, setManifest] = useState(fallbackManifest);
  const [waiting, setWaiting] = useState(false);
  const [bootError, setBootError] = useState("");
  const [accepted, setAccepted] = useState(false);
  const [loggingIn, setLoggingIn] = useState(false);
  const [loginError, setLoginError] = useState("");
  const [maximized, setMaximized] = useState(false);
  const [backgroundPaused, setBackgroundPaused] = useState(document.hidden);
  const authRevision = useRef(0),
    navigationRevision = useRef(0);
  const sessionProfile = useRef<SafeMinecraftProfile | null>(null);
  const start = useRef<HTMLElement>(null),
    login = useRef<HTMLElement>(null),
    main = useRef<HTMLDivElement>(null),
    entry = useRef<HTMLElement>(null),
    footer = useRef<HTMLElement>(null);
  const previousRoute = useRef<Route | null>(null),
    motionRevision = useRef(0);
  const artwork = useMemo(
    () =>
      prepareArtwork().then(
        () => true,
        () => false,
      ),
    [],
  );
  const restored = useMemo(() => api.auth.getState().catch(() => null), [api]);
  const settingsLoaded = useMemo(() => api.settings.load(), [api]);

  useEffect(() => {
    let active = true;
    const authAtStart = authRevision.current;
    void restored.then((result) => {
      if (active && authRevision.current === authAtStart && result?.ok) {
        sessionProfile.current = result.value.profile;
        setProfile(result.value.profile);
      }
    });
    void settingsLoaded
      .then((next) => {
        if (active)
          setSettings({
            ...next,
            selectedProject: "sainam",
            starMotion: next.starMotion ?? true,
          });
      })
      .catch((error) => {
        if (active) setBootError(operationError(error, "อ่านการตั้งค่าไม่ได้"));
      });
    void api.manifest
      .refresh()
      .then((next) => {
        if (active) setManifest(next);
      })
      .catch(() => undefined);
    // Read physical memory once at startup; the settings drawer reads it again when opened.
    void api.system?.getMemoryInfo();
    const visibility = () => setBackgroundPaused(document.hidden);
    document.addEventListener("visibilitychange", visibility);
    return () => {
      active = false;
      authRevision.current++;
      navigationRevision.current++;
      document.removeEventListener("visibilitychange", visibility);
    };
  }, [api, restored, settingsLoaded]);

  useLayoutEffect(() => {
    const refs = {
      start: start.current!,
      login: login.current!,
      main: main.current!,
    };
    const prev = previousRoute.current,
      next = refs[route],
      rev = ++motionRevision.current;
    const old = prev ? refs[prev] : null;
    const from = old
      ?.querySelector<HTMLElement>(".entry-wordmark")
      ?.getBoundingClientRect();
    previousRoute.current = route;
    document.title = `BeforeBedtime — ${route === "start" ? "Click to start" : route === "login" ? "Login Microsoft" : "Launcher"}`;
    if (!prev) {
      for (const key of ["start", "login", "main"] as Route[])
        refs[key].hidden = key !== route;
      return;
    }
    const brand = next.querySelector<HTMLElement>(".entry-wordmark");
    const nextWasHidden = next.hidden;
    const selector = ".welcome-family,.start-button,.start-switch-account,.welcome-signature,.login-content,.login-brand>p,.entry-back";
    next.hidden = false;
    next
      .querySelectorAll<HTMLElement>(".entry-wordmark")
      .forEach((el) => (el.style.visibility = ""));
    const finish = (work: Promise<unknown>[]) =>
      void Promise.all(work).then(() => {
        if (motionRevision.current !== rev) return;
        for (const key of ["start", "login", "main"] as Route[])
          if (key !== route) refs[key].hidden = true;
      });
    if (route === "main") {
      void move(entry.current!, { opacity: 0 }, 220);
      void move(footer.current!, { opacity: 0 }, 220);
      void move(
        next,
        { opacity: 1, transform: "none" },
        320,
        nextWasHidden ? { opacity: 0 } : undefined,
      );
      finish([
        move(
          next.querySelector(".sidebar")!,
          { opacity: 1, transform: "none" },
          680,
          nextWasHidden ? { opacity: 0, transform: "translateX(-18px)" } : undefined,
        ),
        move(
          next.querySelector(".workspace")!,
          { opacity: 1, transform: "none" },
          680,
          nextWasHidden ? { opacity: 0, transform: "translateY(16px)" } : undefined,
          nextWasHidden ? 70 : 0,
        ),
      ]);
    } else if (prev === "main") {
      next.querySelectorAll<HTMLElement>(selector).forEach(resetMotion);
      if (brand) resetMotion(brand);
      void move(refs.main, { opacity: 0 }, 220);
      void move(entry.current!, { opacity: 1 }, 320);
      void move(footer.current!, { opacity: 1 }, 320);
      finish([
        move(next, { opacity: 1, transform: "none" }, 480, {
          opacity: 0,
          transform: "translateY(12px)",
        }),
      ]);
    } else {
      // The incoming wordmark starts at the previous brand's currently painted bounds.
      refs.start.querySelector<HTMLElement>(
        ".entry-wordmark",
      )!.style.visibility = "";
      refs.login.querySelector<HTMLElement>(
        ".entry-wordmark",
      )!.style.visibility = "";
      resetMotion(next);
      resetMotion(brand!);
      const to = brand!.getBoundingClientRect();
      const oldBrand = old!.querySelector<HTMLElement>(".entry-wordmark")!;
      oldBrand.style.visibility = "hidden";
      brand!.style.transformOrigin = "0 0";
      const jobs: Promise<unknown>[] = [];
      if (from && to.width && to.height)
        jobs.push(
          move(brand!, { transform: "none", opacity: 1 }, 680, {
            opacity: 1,
            transform: `translate(${from.left - to.left}px,${from.top - to.top}px) scale(${from.width / to.width},${from.height / to.height})`,
          }),
        );
      old!.querySelectorAll<HTMLElement>(selector).forEach((el) => {
        jobs.push(
          move(el, { opacity: 0, transform: "translateY(-12px)" }, 200),
        );
      });
      next.querySelectorAll<HTMLElement>(selector).forEach((el, i) => {
        jobs.push(
          move(
            el,
            { opacity: 1, transform: "none" },
            480,
            nextWasHidden ? { opacity: 0, transform: "translateY(12px)" } : undefined,
            nextWasHidden ? 100 + i * 35 : 0,
          ),
        );
      });
      finish(jobs);
    }
  }, [route]);

  async function navigate(next: Route) {
    const id = ++navigationRevision.current;
    if (next !== "start") {
      setWaiting(true);
      setBootError("");
      try {
        if (next === "main") await settingsLoaded;
        if (!(await artwork))
          throw new Error(
            "โหลดภาพหรือฟอนต์ไม่สำเร็จ ลองเปิด Launcher อีกครั้ง",
          );
      } catch (error) {
        if (navigationRevision.current === id) {
          setBootError(operationError(error, "เตรียม Launcher ไม่สำเร็จ กรุณาลองเปิดใหม่"));
          setWaiting(false);
        }
        return;
      }
    }
    if (navigationRevision.current !== id) return;
    setWaiting(false);
    setRoute(next);
  }
  async function begin() {
    if (waiting) return;
    setWaiting(true);
    await restored;
    setWaiting(false);
    void navigate(sessionProfile.current ? "main" : "login");
  }
  async function cancelLogin(goBack = false) {
    authRevision.current++;
    navigationRevision.current++;
    setWaiting(false);
    setLoggingIn(false);
    setLoginError("");
    if (goBack) setRoute("start");
    const result = await api.auth.cancelLogin();
    if (!result.ok && !goBack) setLoginError(result.error.message);
  }
  async function signIn() {
    if (!accepted || loggingIn) return;
    const id = ++authRevision.current;
    setLoggingIn(true);
    setLoginError("");
    try {
      const result = await api.auth.loginMicrosoft();
      if (authRevision.current !== id) return;
      if (!result.ok) {
        if (result.error.code !== "AUTH_CANCELLED")
          setLoginError(result.error.message);
        return;
      }
      sessionProfile.current = result.value;
      setProfile(result.value);
      await navigate("main");
    } catch (error) {
      if (authRevision.current === id) setLoginError(operationError(error));
    } finally {
      if (authRevision.current === id) setLoggingIn(false);
    }
  }
  async function logout() {
    authRevision.current++;
    navigationRevision.current++;
    const result = await api.auth.logout();
    if (!result.ok) throw new Error(result.error.message);
    sessionProfile.current = null;
    setProfile(null);
    setAccepted(false);
    setLoginError("");
    setRoute("login");
  }
  async function toggleStars() {
    const next = !settings.starMotion;
    setSettings((current) => ({ ...current, starMotion: next }));
    try {
      await api.settings.save({ starMotion: next });
    } catch (error) {
      setBootError(operationError(error));
    }
  }
  return (
    <div
      className={`entry-page ${!settings.starMotion || backgroundPaused ? "entry-background-paused" : ""}`}
      data-entry-route={route}
      onDragStart={(event) => {
        if (
          !(event.target instanceof HTMLElement) ||
          !event.target.closest('input,textarea,[contenteditable="true"]')
        )
          event.preventDefault();
      }}
    >
      <IconDefinitions />
      <div className="entry-shell">
        <Starfield />
        <header className="titlebar">
          <span>
            BEFOREBEDTIME <span className="titlebar-divider">/</span> LAUNCHER
          </span>
          <div className="window-controls" aria-label="Window controls">
            <button
              aria-label="Minimize"
              onClick={() => void api.window?.minimize()}
            >
              <svg viewBox="0 0 16 16">
                <path d="M4 8h8" />
              </svg>
            </button>
            <button
              aria-label={maximized ? "Restore" : "Maximize"}
              onClick={() =>
                void api.window?.toggleMaximize().then(setMaximized)
              }
            >
              <svg viewBox="0 0 16 16">
                <rect x="4" y="4" width="8" height="8" />
              </svg>
            </button>
            <button aria-label="Close" onClick={() => void api.window?.close()}>
              <svg viewBox="0 0 16 16">
                <path d="m4 4 8 8m-8 0 8-8" />
              </svg>
            </button>
          </div>
        </header>
        <main
          className="entry-main"
          ref={entry}
          inert={route === "main"}
          aria-hidden={route === "main"}
        >
          <section
            className="entry-screen welcome-screen"
            ref={start}
            inert={route !== "start"}
            aria-hidden={route !== "start"}
          >
            <div className="welcome-content">
              <div className="entry-wordmark">
                <h1>BEFOREBEDTIME</h1>
              </div>
              <p className="welcome-family">FAMILY</p>
              <button
                className="start-button"
                onClick={() => void begin()}
                disabled={waiting}
              >
                <span>{waiting ? "กำลังเตรียม…" : "Click to start"}</span>
              </button>
              {profile && (
                <button
                  className="start-switch-account"
                  onClick={() => void navigate("login")}
                >
                  เข้าสู่ระบบด้วยบัญชีอื่น
                </button>
              )}
            </div>
            <div className="welcome-signature" aria-hidden="true">
              <span />
              <Icon name="star" />
              <span />
            </div>
          </section>
          <section
            className="entry-screen login-screen"
            ref={login}
            inert={route !== "login"}
            aria-hidden={route !== "login"}
          >
            <button
              className="entry-back"
              onClick={() => void cancelLogin(true)}
            >
              <Icon name="arrow" />
              กลับหน้าเริ่มต้น
            </button>
            <div className="login-layout">
              <div className="login-brand">
                <div className="entry-wordmark">
                  <div className="login-wordmark">BEFOREBEDTIME</div>
                </div>
                <p>
                  โลกอีกใบ กำลังรออยู่<span>แล้วเจอกันก่อนเข้านอน</span>
                </p>
              </div>
              <div className="login-content">
                <h1>เข้ามาเล่นด้วยกัน</h1>
                <p className="login-description">
                  เข้าสู่ระบบด้วยบัญชี Microsoft
                  <br />
                  ที่ใช้เล่น Minecraft Java Edition
                </p>
                <button
                  className={`microsoft-login ${loggingIn ? "is-busy" : ""}`}
                  disabled={!accepted || loggingIn || waiting}
                  onClick={() => void signIn()}
                >
                  <Icon name="microsoft" />
                  <span>
                    {loggingIn ? "กำลังเข้าสู่ระบบ…" : "Login with Microsoft"}
                  </span>
                  <Icon className="login-arrow" name="arrow" />
                </button>
                <div className="login-consent">
                  <input
                    id="terms"
                    aria-label="ยอมรับข้อกำหนดและนโยบายความเป็นส่วนตัว"
                    type="checkbox"
                    checked={accepted}
                    disabled={loggingIn}
                    onChange={(event) => setAccepted(event.target.checked)}
                  />
                  <div>
                    <label htmlFor="terms">ยอมรับ </label>
                    <a
                      href="https://beforebedtime.net/launcher/terms"
                      onClick={(event) => {
                        event.preventDefault();
                        void api.shell.openExternal(event.currentTarget.href);
                      }}
                    >
                      ข้อกำหนดการใช้งาน
                    </a>
                    <label htmlFor="terms"> และ</label>
                    <br />
                    <a
                      href="https://beforebedtime.net/launcher/privacy"
                      onClick={(event) => {
                        event.preventDefault();
                        void api.shell.openExternal(event.currentTarget.href);
                      }}
                    >
                      นโยบายความเป็นส่วนตัว
                    </a>
                    <label htmlFor="terms"> เพื่อเข้าสู่ระบบ</label>
                  </div>
                </div>
                <div className="login-status-slot">
                  {(loggingIn || loginError || waiting) && (
                    <div className="login-feedback" role="status">
                      <span
                        className={`login-feedback-icon ${loggingIn ? "is-loading" : ""}`}
                      >
                        {!loggingIn && <Icon name="star" />}
                      </span>
                      <div>
                        <strong>
                          {loginError
                            ? "เข้าสู่ระบบไม่สำเร็จ"
                            : waiting
                              ? "กำลังเตรียมการเดินทาง"
                              : "รอการเข้าสู่ระบบ Microsoft"}
                        </strong>
                        <p>
                          {loginError || "ดำเนินการต่อในหน้าต่างที่เปิดขึ้น"}
                        </p>
                        {loggingIn && (
                          <button
                            className="login-cancel"
                            onClick={() => void cancelLogin()}
                          >
                            ยกเลิก
                          </button>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </section>
        </main>
        <footer
          className="entry-footer"
          ref={footer}
          inert={route === "main"}
          aria-hidden={route === "main"}
        >
          <div className="entry-footer-meta">
            <span className="entry-version">Launcher {version}</span>
            <button
              className="entry-motion-toggle"
              onClick={() => void toggleStars()}
              aria-pressed={settings.starMotion}
            >
              <Icon name="star" />
              <span>{settings.starMotion ? "หยุดดาว" : "เปิดดาว"}</span>
            </button>
          </div>
          <Socials api={api} className="entry-socials" />
          <span className="entry-footer-spacer" />
        </footer>
        <div
          ref={main}
          className="launcher embedded-main"
          inert={route !== "main"}
          aria-hidden={route !== "main"}
        >
          <MainView
            api={api}
            active={route === "main"}
            profile={profile}
            settings={settings}
            setSettings={setSettings}
            manifest={manifest}
            onLogout={logout}
            onToggleStars={toggleStars}
          />
        </div>
        {bootError && (
          <div className="toast" role="alert">
            {bootError}
            <button onClick={() => setBootError("")} aria-label="ปิดข้อความ">
              <Icon name="close" />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
