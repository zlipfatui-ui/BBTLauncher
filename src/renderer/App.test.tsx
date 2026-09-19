import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { App } from "./App";
import { fallbackApi, type LauncherApi } from "./launcherApi";
import type {
  LauncherSettings,
  IpcResult,
  SafeMinecraftProfile,
} from "../shared/types";
const profile: SafeMinecraftProfile = {
  id: "898da750881840f09da4ea6822260b30",
  name: "Player",
  avatarInitial: "P",
  provider: "microsoft",
};
const saved: LauncherSettings = {
  appDirectory: "D:/Games",
  width: 1280,
  height: 720,
  fullscreen: false,
  memoryMb: 8192,
  selectedProject: "sainam",
  starMotion: true,
};
function makeApi(signedIn = true) {
  let settings = { ...saved };
  const api: LauncherApi = {
    ...fallbackApi,
    auth: {
      ...fallbackApi.auth,
      getState: vi.fn(async () => ({
        ok: true as const,
        value: {
          status: signedIn ? ("signed-in" as const) : ("signed-out" as const),
          profile: signedIn ? profile : null,
        },
      })),
      loginMicrosoft: vi.fn(async () => ({
        ok: true as const,
        value: profile,
      })),
      cancelLogin: vi.fn(async () => ({ ok: true as const, value: undefined })),
      logout: vi.fn(async () => ({ ok: true as const, value: undefined })),
    },
    settings: {
      load: vi.fn(async () => settings),
      save: vi.fn(async (next) => (settings = { ...settings, ...next })),
      selectAppDirectory: vi.fn(async () => "E:/NewGames"),
    },
    system: {
      getMemoryInfo: vi.fn(async () => ({
        ok: true as const,
        value: { totalMb: 32703, maxMb: 32640 },
      })),
    },
    project: {
      ...fallbackApi.project,
      getState: vi.fn(async () => ({
        state: "ready" as const,
        missing: 0,
        changed: 0,
        stale: 0,
      })),
      getLaunchState: vi.fn(async () => ({ status: "idle" as const })),
      sync: vi.fn(async () => ({
        status: "ready" as const,
        downloaded: 1,
        skipped: 0,
        totalBytes: 100,
        downloadedBytes: 100,
      })),
      launch: vi.fn(async () => ({ ok: true as const, value: { pid: 42 } })),
      stop: vi.fn(async () => ({ status: "idle" as const })),
      onLaunchState: vi.fn(() => () => undefined),
      onProgress: vi.fn(() => () => undefined),
      content: {
        ...fallbackApi.project.content,
        list: vi.fn(async () => ({
          entries: [],
          classificationAvailable: true,
        })),
        importFiles: vi.fn(async () => ({
          status: "complete" as const,
          imported: [],
          conflicts: [],
          rejected: [],
        })),
        openFolder: vi.fn(async () => undefined),
      },
      screenshots: {
        list: vi.fn(async () => ({
          ok: true as const,
          value: { entries: [], directoryExists: true },
        })),
        read: vi.fn(async () => ({
          ok: true as const,
          value: { dataUrl: "data:image/png;base64,aGVsbG8=" },
        })),
        openFile: vi.fn(async () => ({ ok: true as const, value: undefined })),
        revealFile: vi.fn(async () => ({
          ok: true as const,
          value: undefined,
        })),
        openFolder: vi.fn(async () => ({
          ok: true as const,
          value: undefined,
        })),
      },
    },
    updater: {
      ...fallbackApi.updater,
      onState: vi.fn(() => () => undefined),
      quitAndInstall: vi.fn(async () => undefined),
    },
    shell: { openExternal: vi.fn(async () => undefined) },
    window: {
      minimize: vi.fn(async () => undefined),
      toggleMaximize: vi.fn(async () => true),
      close: vi.fn(async () => undefined),
      setFullscreen: vi.fn(async () => true),
      applyDisplaySettings: vi.fn(async (value) => value),
      setContentDrawerOpen: vi.fn(async () => "overlay" as const),
      onContentDrawerLayout: vi.fn(() => () => undefined),
    },
  };
  return api;
}
function pending<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((next) => (resolve = next));
  return { promise, resolve };
}
async function enter(api = makeApi()) {
  const result = render(<App api={api} />);
  fireEvent.click(screen.getByRole("button", { name: "Click to start" }));
  await screen.findByRole("button", { name: "ตั้งค่า Launcher" });
  await waitFor(() =>
    expect(
      screen.queryByRole("button", { name: /กำลังตรวจสอบ/ }),
    ).not.toBeInTheDocument(),
  );
  return { api, ...result };
}
async function settings(api = makeApi()) {
  const result = await enter(api);
  fireEvent.click(screen.getByRole("button", { name: "ตั้งค่า Launcher" }));
  await screen.findByRole("slider");
  return result;
}
async function login(api = makeApi(false)) {
  const result = render(<App api={api} />);
  fireEvent.click(screen.getByRole("button", { name: "Click to start" }));
  await screen.findByRole("button", { name: "Login with Microsoft" });
  return { api, ...result };
}
async function closePanel() {
  fireEvent.click(screen.getByRole("button", { name: "ปิดแผง" }));
  await waitFor(() =>
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
  );
}

describe("production routes and authentication", () => {
  it("requires consent and sends Microsoft login through IPC", async () => {
    const { api } = await login();
    expect(
      screen.getByRole("button", { name: "Login with Microsoft" }),
    ).toBeDisabled();
    fireEvent.click(screen.getByRole("checkbox", { name: /ยอมรับข้อกำหนด/ }));
    fireEvent.click(
      screen.getByRole("button", { name: "Login with Microsoft" }),
    );
    await screen.findByRole("button", { name: "ตั้งค่า Launcher" });
    expect(api.auth.loginMicrosoft).toHaveBeenCalledTimes(1);
  });
  it("opens the existing terms and privacy links", async () => {
    const { api } = await login();
    fireEvent.click(screen.getByRole("link", { name: "ข้อกำหนดการใช้งาน" }));
    fireEvent.click(
      screen.getByRole("link", { name: "นโยบายความเป็นส่วนตัว" }),
    );
    expect(api.shell.openExternal).toHaveBeenNthCalledWith(
      1,
      "https://beforebedtime.net/launcher/terms",
    );
    expect(api.shell.openExternal).toHaveBeenNthCalledWith(
      2,
      "https://beforebedtime.net/launcher/privacy",
    );
  });
  it("keeps Start visible during session restoration", async () => {
    const api = makeApi(),
      restore = pending<Awaited<ReturnType<LauncherApi["auth"]["getState"]>>>();
    vi.mocked(api.auth.getState).mockReturnValue(restore.promise);
    render(<App api={api} />);
    fireEvent.click(screen.getByRole("button", { name: "Click to start" }));
    expect(
      screen.getByRole("heading", { name: "BEFOREBEDTIME" }),
    ).toBeVisible();
    expect(
      screen.queryByRole("button", { name: "ตั้งค่า Launcher" }),
    ).toBeNull();
    await act(async () =>
      restore.resolve({
        ok: true as const,
        value: { status: "signed-in", profile },
      }),
    );
    await screen.findByRole("button", { name: "ตั้งค่า Launcher" });
  });
  it("keeps Start visible until local settings are ready", async () => {
    const api = makeApi(),
      load = pending<LauncherSettings>();
    vi.mocked(api.settings.load).mockReturnValue(load.promise);
    render(<App api={api} />);
    fireEvent.click(screen.getByRole("button", { name: "Click to start" }));
    await act(async () => {});
    expect(
      screen.getByRole("heading", { name: "BEFOREBEDTIME" }),
    ).toBeVisible();
    await act(async () => load.resolve(saved));
    await screen.findByRole("button", { name: "ตั้งค่า Launcher" });
  });
  it("ignores successful login arriving after cancellation", async () => {
    const api = makeApi(false),
      result = pending<IpcResult<SafeMinecraftProfile>>();
    vi.mocked(api.auth.loginMicrosoft).mockReturnValue(result.promise);
    await login(api);
    fireEvent.click(screen.getByRole("checkbox", { name: /ยอมรับข้อกำหนด/ }));
    fireEvent.click(
      screen.getByRole("button", { name: "Login with Microsoft" }),
    );
    fireEvent.click(await screen.findByRole("button", { name: "ยกเลิก" }));
    await act(async () =>
      result.resolve({ ok: true as const, value: profile }),
    );
    expect(api.auth.cancelLogin).toHaveBeenCalledTimes(1);
    expect(
      screen.queryByRole("button", { name: "ตั้งค่า Launcher" }),
    ).toBeNull();
    expect(
      screen.getByRole("button", { name: "Login with Microsoft" }),
    ).toBeEnabled();
  });
  it("cancels pending login when going back and ignores its late result", async () => {
    const api = makeApi(false),
      result = pending<IpcResult<SafeMinecraftProfile>>();
    vi.mocked(api.auth.loginMicrosoft).mockReturnValue(result.promise);
    await login(api);
    fireEvent.click(screen.getByRole("checkbox", { name: /ยอมรับข้อกำหนด/ }));
    fireEvent.click(
      screen.getByRole("button", { name: "Login with Microsoft" }),
    );
    fireEvent.click(screen.getByRole("button", { name: "กลับหน้าเริ่มต้น" }));
    await act(async () =>
      result.resolve({ ok: true as const, value: profile }),
    );
    expect(
      screen.getByRole("button", { name: "Click to start" }),
    ).toBeVisible();
  });
  it("shows a login failure without replacing the screen", async () => {
    const api = makeApi(false);
    vi.mocked(api.auth.loginMicrosoft).mockResolvedValue({
      ok: false,
      error: { code: "NETWORK_ERROR", message: "เชื่อมต่อไม่ได้" },
    });
    await login(api);
    fireEvent.click(screen.getByRole("checkbox", { name: /ยอมรับข้อกำหนด/ }));
    fireEvent.click(
      screen.getByRole("button", { name: "Login with Microsoft" }),
    );
    expect(await screen.findByText("เชื่อมต่อไม่ได้")).toBeVisible();
  });
  it("does not reuse restored session after logout and back to Start", async () => {
    const { api } = await enter();
    fireEvent.click(screen.getByRole("button", { name: "บัญชีผู้เล่น" }));
    fireEvent.click(screen.getByRole("button", { name: "ออกจากระบบ" }));
    await screen.findByRole("button", { name: "Login with Microsoft" });
    fireEvent.click(screen.getByRole("button", { name: "กลับหน้าเริ่มต้น" }));
    fireEvent.click(screen.getByRole("button", { name: "Click to start" }));
    expect(
      await screen.findByRole("button", { name: "Login with Microsoft" }),
    ).toBeVisible();
    expect(api.auth.logout).toHaveBeenCalledTimes(1);
  });
  it("uses real Electron controls and social destinations", async () => {
    const { api } = await enter();
    fireEvent.click(screen.getByRole("button", { name: "Minimize" }));
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Maximize" }));
    });
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    fireEvent.click(screen.getByRole("link", { name: "YouTube" }));
    expect(api.window?.minimize).toHaveBeenCalledOnce();
    expect(api.window?.toggleMaximize).toHaveBeenCalledOnce();
    expect(api.window?.close).toHaveBeenCalledOnce();
    expect(api.shell.openExternal).toHaveBeenCalledWith(
      "https://www.youtube.com/@BeforeBedtimeProject",
    );
  });
  it("shows the profile skin in the account panel", async () => {
    await enter();
    fireEvent.click(screen.getByRole("button", { name: "บัญชีผู้เล่น" }));
    expect(screen.getByRole("img", { name: "Player" })).toHaveAttribute(
      "src",
      "https://mc-heads.net/avatar/" + profile.id + "/96",
    );
    expect(screen.getByRole("textbox", { name: "Minecraft UUID" })).toHaveValue(
      profile.id,
    );
  });
});

describe("real game lifecycle", () => {
  it("waits for the stored game directory before reading project state", async () => {
    const api = makeApi(),
      result = pending<LauncherSettings>();
    vi.mocked(api.settings.load).mockReturnValue(result.promise);
    render(<App api={api} />);
    expect(api.project.getState).not.toHaveBeenCalled();
    await act(async () => result.resolve(saved));
    expect(api.project.getState).toHaveBeenCalledExactlyOnceWith("sainam");
  });
  it.each([
    ["install", 0, 0, 0, "ติดตั้งเกม"],
    ["update", 1, 0, 0, "ซ่อมไฟล์"],
    ["update", 0, 1, 0, "ซ่อมไฟล์"],
    ["update", 0, 0, 1, "อัปเดตเกม"],
  ] as const)(
    "syncs %s (%s missing/%s changed/%s stale) before PLAY",
    async (state, missing, changed, stale, label) => {
      const api = makeApi();
      vi.mocked(api.project.getState).mockResolvedValue({
        state,
        missing,
        changed,
        stale,
      });
      await enter(api);
      fireEvent.click(screen.getByRole("button", { name: new RegExp(label) }));
      await screen.findByRole("button", { name: /เข้าเกม/ });
      expect(api.project.sync).toHaveBeenCalledWith("sainam");
      expect(api.project.launch).not.toHaveBeenCalled();
    },
  );
  it("launches SaiNam then stops the running game", async () => {
    const { api } = await enter();
    fireEvent.click(screen.getByRole("button", { name: /เข้าเกม/ }));
    fireEvent.click(await screen.findByRole("button", { name: /หยุดเกม/ }));
    await screen.findByRole("button", { name: /เข้าเกม/ });
    expect(api.project.launch).toHaveBeenCalledWith("sainam");
    expect(api.project.stop).toHaveBeenCalledWith("sainam");
  });
  it("blocks duplicate launches while first request is pending", async () => {
    const api = makeApi(),
      result = pending<IpcResult<{ pid?: number }>>();
    vi.mocked(api.project.launch).mockReturnValue(result.promise);
    await enter(api);
    const button = screen.getByRole("button", { name: /เข้าเกม/ });
    fireEvent.click(button);
    fireEvent.click(button);
    expect(api.project.launch).toHaveBeenCalledTimes(1);
    await act(async () =>
      result.resolve({ ok: true as const, value: { pid: 42 } }),
    );
  });
  it("keeps failed sync retryable and never claims ready", async () => {
    const api = makeApi();
    vi.mocked(api.project.getState).mockResolvedValue({
      state: "install",
      missing: 1,
      changed: 0,
      stale: 0,
    });
    vi.mocked(api.project.sync).mockRejectedValue(
      new Error(
        "Error invoking remote method 'project:sync': Error: SHA256 verification failed",
      ),
    );
    await enter(api);
    fireEvent.click(screen.getByRole("button", { name: /ติดตั้งเกม/ }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "ไฟล์บนเซิร์ฟเวอร์ไม่ตรงกับข้อมูล Modpack",
    );
    expect(screen.getByRole("button", { name: /ติดตั้งเกม/ })).toBeEnabled();
    expect(api.project.launch).not.toHaveBeenCalled();
  });
  it("shows CHECKING RUNTIME without claiming Java is downloading", async () => {
    const { api } = await enter();
    await act(async () =>
      vi.mocked(api.project.onProgress).mock.calls[0][0]({
        projectId: "sainam",
        phase: "CHECKING_RUNTIME",
        message: "CHECKING RUNTIME",
      }),
    );
    expect(screen.getByRole("status")).toHaveTextContent("CHECKING RUNTIME");
    expect(screen.getByRole("status")).not.toHaveTextContent(
      "DOWNLOADING JAVA",
    );
  });
  it("ignores another project progress event", async () => {
    const { api } = await enter();
    await act(async () =>
      vi.mocked(api.project.onProgress).mock.calls[0][0]({
        projectId: "northvale",
        phase: "SYNCING",
        message: "wrong project",
      }),
    );
    expect(screen.queryByText("wrong project")).toBeNull();
  });
  it("keeps game state mounted across settings and shop", async () => {
    const { api } = await enter();
    const calls = vi.mocked(api.project.getState).mock.calls.length;
    fireEvent.click(screen.getByRole("button", { name: "ตั้งค่า Launcher" }));
    await closePanel();
    fireEvent.click(screen.getByRole("button", { name: "ร้านค้า เร็ว ๆ นี้" }));
    await closePanel();
    expect(vi.mocked(api.project.getState).mock.calls.length).toBe(calls);
    expect(screen.getByRole("button", { name: /เข้าเกม/ })).toBeEnabled();
  });
  it("enables Restart only after download and disables it while game runs", async () => {
    const { api } = await enter();
    const update = vi.mocked(api.updater.onState).mock.calls[0][0];
    await act(async () =>
      update({ status: "downloading", percent: 50, version: "0.3.8" }),
    );
    expect(
      screen.getByRole("button", { name: /กำลังดาวน์โหลดอัปเดต/ }),
    ).toBeDisabled();
    await act(async () => update({ status: "downloaded", version: "0.3.8" }));
    fireEvent.click(screen.getByRole("button", { name: /Restart to update/ }));
    expect(api.updater.quitAndInstall).toHaveBeenCalledOnce();
    await act(async () =>
      vi
        .mocked(api.project.onLaunchState)
        .mock.calls[0][0]({ status: "running", projectId: "sainam", pid: 42 }),
    );
    expect(
      screen.getByRole("button", { name: /Restart to update/ }),
    ).toBeDisabled();
  });
  it("does not block game launch when updater fails", async () => {
    const { api } = await enter();
    await act(async () =>
      vi
        .mocked(api.updater.onState)
        .mock.calls[0][0]({ status: "error", message: "No network" }),
    );
    expect(screen.getByRole("button", { name: /เข้าเกม/ })).toBeEnabled();
  });
});

describe("machine settings and content", () => {
  it.each([1537, 6145])(
    "represents unaligned legacy %s MB exactly and allows the physical maximum",
    async (memoryMb) => {
      const api = makeApi();
      vi.mocked(api.settings.load).mockResolvedValue({ ...saved, memoryMb });
      await settings(api);
      await waitFor(() => expect(screen.getByRole("slider")).toBeEnabled());
      expect(screen.getByRole("slider")).toHaveValue(String(memoryMb));
      fireEvent.keyDown(screen.getByRole("slider"), { key: "End" });
      expect(screen.getByRole("slider")).toHaveValue("32640");
      fireEvent.click(screen.getByRole("button", { name: "บันทึกการตั้งค่า" }));
      await screen.findByText("บันทึกการตั้งค่าแล้ว");
      expect(api.settings.save).toHaveBeenCalledWith(
        expect.objectContaining({ memoryMb: 32640 }),
      );
    },
  );
  it.each([4096, 8192, 16384, 32768, 65536, 32640])(
    "uses physical %s MB as slider maximum",
    async (maxMb) => {
      const api = makeApi();
      vi.mocked(api.system.getMemoryInfo).mockResolvedValue({
        ok: true as const,
        value: { totalMb: maxMb, maxMb },
      });
      await settings(api);
      await waitFor(() =>
        expect(screen.getByRole("slider")).toHaveAttribute(
          "max",
          String(maxMb),
        ),
      );
      expect(screen.getByRole("slider")).toHaveAttribute("step", "64");
      expect(api.system.getMemoryInfo).toHaveBeenCalledTimes(2);
    },
  );
  it("preserves legacy smaller RAM and expands minimum", async () => {
    const api = makeApi();
    vi.mocked(api.settings.load).mockResolvedValue({
      ...saved,
      memoryMb: 1024,
    });
    await settings(api);
    await waitFor(() =>
      expect(screen.getByRole("slider")).toHaveAttribute("min", "1024"),
    );
    expect(screen.getByRole("slider")).toHaveValue("1024");
  });
  it("shows hardware error and disables slider without fake maximum", async () => {
    const api = makeApi();
    vi.mocked(api.system.getMemoryInfo).mockResolvedValue({
      ok: false,
      error: { code: "SYSTEM_MEMORY_UNAVAILABLE", message: "อ่าน RAM ไม่ได้" },
    });
    await settings(api);
    expect(await screen.findByText("อ่าน RAM ไม่ได้")).toBeVisible();
    expect(screen.getByRole("slider")).toBeDisabled();
    expect(screen.queryByText("16384 MB")).toBeNull();
  });
  it("updates memory on input and saves exactly that MB value", async () => {
    const { api } = await settings();
    await waitFor(() => expect(screen.getByRole("slider")).toBeEnabled());
    fireEvent.change(screen.getByRole("slider"), {
      target: { value: "10240" },
    });
    fireEvent.click(screen.getByRole("button", { name: "บันทึกการตั้งค่า" }));
    await screen.findByText("บันทึกการตั้งค่าแล้ว");
    expect(api.settings.save).toHaveBeenCalledWith(
      expect.objectContaining({ memoryMb: 10240 }),
    );
  });
  it("keeps display changes local until Save", async () => {
    const { api } = await settings();
    fireEvent.click(screen.getByRole("checkbox", { name: "เต็มหน้าจอ" }));
    expect(api.window?.applyDisplaySettings).not.toHaveBeenCalled();
    fireEvent.change(screen.getByRole("combobox", { name: "ขนาดหน้าต่าง" }), {
      target: { value: "1920x1080" },
    });
    fireEvent.click(screen.getByRole("button", { name: "บันทึกการตั้งค่า" }));
    await screen.findByText("บันทึกการตั้งค่าแล้ว");
    expect(api.window?.applyDisplaySettings).toHaveBeenCalledWith({
      width: 1920,
      height: 1080,
      fullscreen: true,
    });
  });
  it("browses Path and refreshes screenshots after Save", async () => {
    const { api } = await settings();
    const calls = vi.mocked(api.project.screenshots.list).mock.calls.length;
    fireEvent.click(screen.getByRole("button", { name: "เปลี่ยน Path" }));
    fireEvent.click(screen.getByRole("button", { name: "เลือกโฟลเดอร์" }));
    await waitFor(() =>
      expect(screen.getByRole("textbox", { name: "Path ใหม่" })).toHaveValue(
        "E:/NewGames",
      ),
    );
    fireEvent.click(screen.getByRole("button", { name: "บันทึกการตั้งค่า" }));
    await screen.findByText("บันทึกการตั้งค่าแล้ว");
    expect(api.settings.save).toHaveBeenCalledWith(
      expect.objectContaining({ appDirectory: "E:/NewGames" }),
    );
    expect(
      vi.mocked(api.project.screenshots.list).mock.calls.length,
    ).toBeGreaterThan(calls);
  });
  it("keeps Path on system folder picker cancel", async () => {
    const api = makeApi();
    vi.mocked(api.settings.selectAppDirectory).mockResolvedValue(null);
    await settings(api);
    fireEvent.click(screen.getByRole("button", { name: "เปลี่ยน Path" }));
    fireEvent.click(screen.getByRole("button", { name: "เลือกโฟลเดอร์" }));
    await act(async () => {});
    expect(screen.getByRole("textbox", { name: "Path ใหม่" })).toHaveValue(
      "D:/Games",
    );
  });
  it("shows safe save failure retaining unsaved values", async () => {
    const api = makeApi();
    vi.mocked(api.settings.save).mockRejectedValue(
      new Error("Error invoking remote method 'settings:save': Error: ENOSPC"),
    );
    await settings(api);
    fireEvent.click(screen.getByRole("button", { name: "บันทึกการตั้งค่า" }));
    expect(
      await screen.findByText(
        "พื้นที่ในไดรฟ์ไม่เพียงพอ กรุณาเลือกโฟลเดอร์เกมในไดรฟ์อื่น",
      ),
    ).toBeVisible();
    expect(screen.getByRole("slider")).toHaveValue("8192");
  });
  it("opens content overlay and retains SaiNam file drops", async () => {
    const { api, container } = await enter();
    fireEvent.click(screen.getByRole("button", { name: "จัดการคอนเทนต์" }));
    const file = new File(["jar"], "my-mod.jar", {
      type: "application/java-archive",
    });
    fireEvent.drop(container.querySelector(".content-drop-zone")!, {
      dataTransfer: { files: [file] },
    });
    await waitFor(() =>
      expect(api.project.content.importFiles).toHaveBeenCalledWith(
        "sainam",
        "mods",
        [file],
        false,
      ),
    );
    expect(api.window?.setContentDrawerOpen).not.toHaveBeenCalled();
  });
  it("filters content through editable search", async () => {
    const api = makeApi();
    vi.mocked(api.project.content.list).mockResolvedValue({
      classificationAvailable: true,
      entries: [
        {
          relativePath: "mods/user.jar",
          name: "user.jar",
          kind: "mods",
          source: "user",
          size: 12,
          modifiedAt: "2026-09-19",
          enabled: true,
          canDelete: true,
        },
      ],
    });
    await enter(api);
    fireEvent.click(screen.getByRole("button", { name: "จัดการคอนเทนต์" }));
    await screen.findByText("user.jar");
    fireEvent.change(screen.getByRole("textbox", { name: "ค้นหาคอนเทนต์" }), {
      target: { value: "nothing" },
    });
    expect(screen.queryByText("user.jar")).toBeNull();
  });
  it("shows empty screenshots instead of sample artwork", async () => {
    const { api } = await enter();
    fireEvent.click(
      screen.getByRole("button", { name: "เปิดแกลเลอรีรูป SAINAM" }),
    );
    expect(await screen.findByText(/ยังไม่มีรูปที่ถ่ายไว้/)).toBeVisible();
    expect(api.project.screenshots.read).not.toHaveBeenCalled();
    fireEvent.click(
      screen.getByRole("button", { name: "เปิดโฟลเดอร์ screenshots" }),
    );
    expect(api.project.screenshots.openFolder).toHaveBeenCalledWith("sainam");
  });
  it("refreshes screenshots on focus", async () => {
    const { api } = await enter();
    const before = vi.mocked(api.project.screenshots.list).mock.calls.length;
    fireEvent(window, new Event("focus"));
    await waitFor(() =>
      expect(
        vi.mocked(api.project.screenshots.list).mock.calls.length,
      ).toBeGreaterThan(before),
    );
  });
  it("reads thumbnails separately and full image only when viewed", async () => {
    const api = makeApi();
    const entries = ["one.png", "two.png"].map((name) => ({
      relativePath: name,
      name,
      size: 5,
      modifiedAt: "2026-09-19",
    }));
    vi.mocked(api.project.screenshots.list).mockResolvedValue({
      ok: true as const,
      value: { entries, directoryExists: true },
    });
    await enter(api);
    expect(api.project.screenshots.read).not.toHaveBeenCalledWith(
      "sainam",
      "one.png",
      false,
    );
    fireEvent.click(
      screen.getByRole("button", { name: "เปิดแกลเลอรีรูป SAINAM" }),
    );
    await waitFor(() =>
      expect(api.project.screenshots.read).toHaveBeenCalledWith(
        "sainam",
        "one.png",
        false,
      ),
    );
    expect(api.project.screenshots.read).not.toHaveBeenCalledWith(
      "sainam",
      "two.png",
      false,
    );
    fireEvent.click(screen.getByRole("button", { name: "รูปถัดไป" }));
    await waitFor(() =>
      expect(api.project.screenshots.read).toHaveBeenCalledWith(
        "sainam",
        "two.png",
        false,
      ),
    );
  });
  it("does not fabricate a browser Microsoft login", async () => {
    expect(await fallbackApi.auth.loginMicrosoft()).toMatchObject({
      ok: false,
      error: { code: "DESKTOP_UNAVAILABLE" },
    });
  });
});
