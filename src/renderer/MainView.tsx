import { useEffect, useState, type Dispatch, type SetStateAction } from "react";
import type {
  LauncherManifest,
  LauncherSettings,
  LauncherUpdateState,
  SafeMinecraftProfile,
} from "../shared/types";
import type { LauncherApi } from "./launcherApi";
import { fallbackManifest } from "./launcherApi";
import { resolveRendererAssetUrl as asset } from "./assets";
import { Icon } from "./Visuals";
import { Overlay } from "./motion";
import { Socials } from "./App";
import { SettingsView } from "./SettingsView";
import { ProjectContentDrawer } from "./ProjectContentDrawer";
import {
  ScreenshotGallery,
  ScreenshotThumbnail,
  useScreenshots,
} from "./ScreenshotGallery";
import { useProject } from "./useProject";
import { operationError } from "./operation-error";
import { version } from "../../package.json";

type Panel = "settings" | "account" | "shop" | "details" | "content";
export function MainView({
  api,
  active,
  profile,
  settings,
  setSettings,
  manifest,
  onLogout,
  onToggleStars,
}: {
  api: LauncherApi;
  active: boolean;
  profile: SafeMinecraftProfile | null;
  settings: LauncherSettings;
  setSettings: Dispatch<SetStateAction<LauncherSettings>>;
  manifest: LauncherManifest;
  onLogout(): Promise<void>;
  onToggleStars(): Promise<void>;
}) {
  const project =
    manifest.projects.find((item) => item.id === "sainam") ??
    fallbackManifest.projects.find((item) => item.id === "sainam")!;
  const game = useProject(api, project, settings.appDirectory);
  const [panel, setPanel] = useState<Panel>("settings"),
    [panelOpen, setPanelOpen] = useState(false),
    [galleryOpen, setGalleryOpen] = useState(false);
  const [update, setUpdate] = useState<LauncherUpdateState>({ status: "idle" }),
    [notice, setNotice] = useState(""),
    [loggingOut, setLoggingOut] = useState(false);
  const library = useScreenshots(
    api,
    project.id,
    settings.appDirectory,
    active,
    galleryOpen,
  );
  const busy = game.busy || game.launch.status !== "idle";
  useEffect(() => {
    let live = true;
    void api.updater
      .getState()
      .then((state) => {
        if (live) setUpdate(state);
      })
      .catch(() => undefined);
    const off = api.updater.onState(setUpdate);
    return () => {
      live = false;
      off();
    };
  }, [api]);
  useEffect(() => {
    if (!active) {
      setPanelOpen(false);
      setGalleryOpen(false);
    }
  }, [active]);
  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(""), 5000);
    return () => clearTimeout(timer);
  }, [notice]);
  const open = (name: Panel) => {
    setPanel(name);
    setPanelOpen(true);
  };
  const close = () => setPanelOpen(false);
  const showGallery = () => {
    setPanelOpen(false);
    setGalleryOpen(true);
  };
  async function updateAction() {
    try {
      await api.updater.quitAndInstall();
    } catch (error) {
      setNotice(operationError(error));
    }
  }
  async function logout() {
    if (loggingOut) return;
    setLoggingOut(true);
    try {
      await onLogout();
      close();
    } catch (error) {
      setNotice(operationError(error));
    } finally {
      setLoggingOut(false);
    }
  }
  const titles = {
    settings: "ตั้งค่า Launcher",
    account: "บัญชีผู้เล่น",
    shop: "ร้านค้า",
    details: "SaiNam",
    content: "จัดการคอนเทนต์",
  };
  const updateVisible = ["available", "downloading", "downloaded"].includes(
    update.status,
  );
  const overlayOpen = panelOpen || galleryOpen;
  return (
    <>
      <aside className="sidebar" inert={overlayOpen}>
        <button
          className="brand"
          aria-label="BeforeBedtime หน้าหลัก"
          onClick={close}
        >
          <span className="brand-mark">
            <Icon name="star" />
            <Icon name="star" />
          </span>
          <span>
            Before
            <span className="brand-second">
              Bedtime<span className="brand-period">.</span>
            </span>
          </span>
        </button>
        <div className="library-label">
          โลกของเรา<span>2</span>
        </div>
        <nav className="projects" aria-label="เลือกโปรเจกต์">
          <button
            className="project-button selected"
            aria-label="SaiNam Season Test"
            aria-pressed="true"
            onClick={close}
          >
            <img
              className="sainam-thumb"
              src={asset("/assets/images/logos/SAINAM.png")}
              alt=""
              draggable={false}
            />
            <span>
              <strong>SaiNam</strong>
              <small>Season Test</small>
            </span>
            <span className="project-dot" />
          </button>
          <button
            className="project-button project-locked"
            disabled
            aria-label="Northvale — ยังไม่เปิดให้เล่น"
          >
            <span className="project-monogram">N</span>
            <span className="project-copy">
              <strong>Northvale</strong>
              <small>ยังไม่เปิดให้เล่น</small>
            </span>
            <Icon className="project-lock" name="lock" />
          </button>
        </nav>
        <div className="sidebar-rule" />
        <nav className="utility-nav" aria-label="เครื่องมือ">
          <button onClick={() => open("content")} aria-label="จัดการคอนเทนต์">
            <Icon name="folder" />
            <span>จัดการคอนเทนต์</span>
          </button>
          <button onClick={showGallery} aria-label="รูปที่ถ่ายไว้ใน SAINAM">
            <Icon name="photo" />
            <span>รูปที่ถ่ายไว้</span>
          </button>
          <button onClick={() => open("shop")} aria-label="ร้านค้า เร็ว ๆ นี้">
            <Icon name="bag" />
            <span>ร้านค้า</span>
            <small>เร็ว ๆ นี้</small>
          </button>
          <button
            onClick={() => open("settings")}
            aria-label="ตั้งค่า Launcher"
          >
            <Icon name="settings" />
            <span>ตั้งค่า Launcher</span>
          </button>
        </nav>
        <div className="sidebar-bottom">
          <p className="social-caption">เจอกันก่อนเข้านอน</p>
          <Socials api={api} />
          <button
            className="account"
            onClick={() => open("account")}
            aria-label="บัญชีผู้เล่น"
          >
            <span className="avatar">{profile?.avatarInitial ?? "?"}</span>
            <span>
              <strong>{profile?.name ?? "เข้าสู่ระบบ"}</strong>
              <small>Microsoft {profile ? "Connected" : ""}</small>
            </span>
            <Icon name="chevron" />
          </button>
          <div className="version">
            <span>Launcher {version}</span>
            <span className="version-star">
              <Icon name="star" />
            </span>
          </div>
        </div>
      </aside>
      <main className="workspace" inert={overlayOpen}>
        <header className="page-heading">
          <div>
            <h1>
              คืนนี้ ไปโลกไหนดี<span>?</span>
            </h1>
            <p>อีกหนึ่งเรื่องราว ก่อนถึงเวลาเข้านอน</p>
          </div>
          <div className="heading-actions">
            {updateVisible && (
              <button
                className={`launcher-update-button ${update.status === "downloading" ? "is-updating" : ""}`}
                onClick={() => void updateAction()}
                disabled={update.status !== "downloaded" || busy}
                title={
                  busy ? "ปิดเกมและรอให้งานไฟล์เสร็จก่อนอัปเดต" : undefined
                }
              >
                <Icon name="restart" />
                <span>
                  <strong>
                    {update.status === "downloaded"
                      ? "Restart to update"
                      : "กำลังดาวน์โหลดอัปเดต"}
                  </strong>
                  <small>
                    {update.status === "downloaded"
                      ? busy
                        ? "รอให้เกมและงานไฟล์เสร็จ"
                        : "อัปเดต Launcher พร้อมแล้ว"
                      : `${Math.round(update.percent ?? 0)}% · ${update.version ?? ""}`}
                  </small>
                </span>
              </button>
            )}
            <button
              className="ambience-button"
              onClick={() => void onToggleStars()}
              aria-pressed={settings.starMotion}
              aria-label="ดาวเคลื่อนไหว"
            >
              <Icon name="star" />
              <span>Starlight</span>
            </button>
          </div>
        </header>
        <section className="world-feature" aria-label="โลก SaiNam">
          <img
            className="hero-image"
            src={asset("/assets/launcher/sainam-forest.png")}
            alt="ภาพวาดป่าและสายน้ำของ SaiNam"
            draggable={false}
          />
          <div className="hero-shade" />
          <div className="hero-top">
            <span className="season">SEASON TEST</span>
            <span className="edition">MINECRAFT JAVA EDITION</span>
          </div>
          <div className="hero-copy">
            <div className="world-symbol">
              <Icon name="star" />
              <span />
            </div>
            <h2>SAINAM</h2>
            <p className="world-tagline">สาย-น้ำ</p>
            <p className="world-description">
              ใบไม้ที่ร่วงโรย แสงแดดอันอบอุ่น และค่ายฤดูใบไม้ร่วง
              <br />
              ที่ไม่มีใคร…กลับออกมาเหมือนเดิม
            </p>
            <button className="text-button" onClick={() => open("details")}>
              รู้จักโลกใบนี้
              <Icon name="arrow" />
            </button>
          </div>
          <span className="hero-signature">A BEFOREBEDTIME STORY</span>
          <div className="corner-star" aria-hidden="true">
            <Icon name="star" />
          </div>
        </section>
        <section className="world-info" aria-label="ข้อมูลโปรเจกต์">
          <div className="world-info-title">
            <Icon name="world" />
            <span>
              SaiNam<small>Season Test</small>
            </span>
          </div>
          <button
            className="screenshot-entry"
            onClick={showGallery}
            aria-label="เปิดแกลเลอรีรูป SAINAM"
          >
            <ScreenshotThumbnail
              key={settings.appDirectory}
              api={api}
              projectId={project.id}
              entry={library.entries[0]}
            />
            <span>
              รูปที่ถ่ายไว้
              <small>
                {library.error
                  ? "อ่านรูปไม่ได้"
                  : `${library.entries.length} รูป`}
              </small>
            </span>
            <Icon name="chevron" />
          </button>
          <div className="world-spec">
            <span>Minecraft</span>
            <strong>{project.minecraft.version}</strong>
          </div>
          <div className="world-spec">
            <span>Forge</span>
            <strong>{project.minecraft.loaderVersion}</strong>
          </div>
          <button
            className="info-settings"
            onClick={() => open("settings")}
            aria-label="ตั้งค่าการเล่น"
          >
            <Icon name="settings" />
          </button>
        </section>
        <footer
          className={`launch-dock ${game.launch.status === "running" ? "running" : ""}`}
        >
          <div className="launch-details">
            <span className="install-state" role="status">
              <span className="status-dot" />
              {game.status}
            </span>
            <p>
              {game.state?.state === "ready"
                ? "ไฟล์เกมเป็นเวอร์ชันล่าสุด"
                : game.state?.state === "install"
                  ? "ดาวน์โหลดไฟล์เพื่อเริ่มเล่น"
                  : "ตรวจสอบและเตรียมไฟล์เกม"}
              <span>·</span>RAM {settings.memoryMb} MB
            </p>
            {game.progress && (
              <div className="progress-track">
                <progress
                  max={100}
                  value={game.progress.percent}
                  aria-label="ความคืบหน้าการเตรียมเกม"
                />
              </div>
            )}
            {game.error && (
              <p className="project-action-error feedback-motion" role="alert">
                {game.error}
              </p>
            )}
          </div>
          <div className="launch-actions">
            <button
              className="manage-button"
              onClick={() => open("content")}
              aria-label="จัดการม็อดและคอนเทนต์"
            >
              <Icon name="folder" />
              <span>จัดการ</span>
            </button>
            <button
              className="launch-button"
              onClick={() => void game.act()}
              disabled={game.disabled}
            >
              <Icon
                name={game.launch.status === "running" ? "close" : "play"}
              />
              <span>
                <strong>{game.label}</strong>
                <small>
                  {game.launch.status === "running"
                    ? "SEE YOU SOON"
                    : "LET’S GET LOST"}
                </small>
              </span>
              <Icon className="launch-spark" name="star" />
            </button>
          </div>
        </footer>
      </main>
      <Overlay
        open={panelOpen}
        title={titles[panel]}
        subtitle={
          panel === "settings"
            ? "จัดพื้นที่ให้การผจญภัยครั้งต่อไป"
            : panel === "content"
              ? "SaiNam · ไฟล์ในโปรเจกต์"
              : "BeforeBedtime"
        }
        onClose={close}
      >
        {panel === "settings" && (
          <SettingsView
            api={api}
            settings={settings}
            onSaved={setSettings}
            open={panelOpen}
          />
        )}
        {panel === "shop" && (
          <div className="quiet-state">
            <Icon name="bag" />
            <h3>ไว้เจอกันที่ร้าน</h3>
            <p>
              พื้นที่ร้านค้ายังไม่เปิดให้ใช้งาน
              <br />
              ระหว่างนี้ ออกเดินทางไปด้วยกันก่อน
            </p>
            <button className="panel-button" onClick={close}>
              กลับไปหน้าโปรเจกต์
              <Icon name="arrow" />
            </button>
          </div>
        )}
        {panel === "account" && (
          <>
            <div className="account-profile">
              <span className="avatar">
                {profile && (
                  <img
                    src={`https://mc-heads.net/avatar/${profile.id}/96`}
                    alt={profile.name}
                    onError={(event) =>
                      (event.currentTarget.style.display = "none")
                    }
                  />
                )}
                <span>{profile?.avatarInitial}</span>
              </span>
              <h3>{profile?.name}</h3>
              <p>Microsoft Connected</p>
              <input
                aria-label="Minecraft UUID"
                className="select-field account-uuid"
                readOnly
                value={profile?.id ?? ""}
              />
            </div>
            <button
              className="panel-button secondary"
              disabled={loggingOut || busy}
              onClick={() => void logout()}
            >
              {loggingOut ? "กำลังออกจากระบบ…" : "ออกจากระบบ"}
            </button>
            {busy && (
              <p className="field-help">
                ปิดเกมและรอให้งานไฟล์เสร็จก่อนออกจากระบบ
              </p>
            )}
          </>
        )}
        {panel === "details" && (
          <>
            <img
              className="details-image"
              src={asset("/assets/launcher/sainam-forest.png")}
              alt="SaiNam"
            />
            <p className="details-copy">
              ใบไม้ที่ร่วงโรย แสงแดดอันอบอุ่น
              และค่ายฤดูใบไม้ร่วงที่ไม่มีใคร…กลับออกมาเหมือนเดิม
            </p>
            {[
              ["โปรเจกต์", "SaiNam"],
              ["ซีซัน", "Season Test"],
              ["Minecraft", project.minecraft.version],
              ["Forge", project.minecraft.loaderVersion],
              ["Java", project.minecraft.javaMajor],
            ].map(([name, value]) => (
              <div key={name} className="detail-row">
                <span>{name}</span>
                <strong>{value}</strong>
              </div>
            ))}
            <button className="panel-button" onClick={close}>
              กลับไปเตรียมเข้าเกม
              <Icon name="arrow" />
            </button>
          </>
        )}
        {panel === "content" && (
          <ProjectContentDrawer
            api={api}
            projectId={project.id}
            projectTitle={project.title}
            projectSeason="Season Test"
            projectMonogram="SN"
            open={panelOpen}
            layout="overlay"
            refreshKey={game.revision}
            onOpenChange={setPanelOpen}
            onLayoutChange={() => undefined}
          />
        )}
      </Overlay>
      <ScreenshotGallery
        api={api}
        projectId={project.id}
        path={settings.appDirectory}
        library={library}
        open={galleryOpen}
        onClose={() => setGalleryOpen(false)}
      />
      {notice && (
        <div className="toast feedback-motion" role="status">
          {notice}
        </div>
      )}
    </>
  );
}
