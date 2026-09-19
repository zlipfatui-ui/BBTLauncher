import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { App } from "./App";
import { StrictMode } from "react";
import { fallbackApi, type LauncherApi } from "./launcherApi";

const profile = {
  id: "player-uuid",
  name: "Player",
  avatarInitial: "P",
  provider: "microsoft" as const,
};
function apiFor(signedIn = true): LauncherApi {
  return {
    ...fallbackApi,
    auth: {
      ...fallbackApi.auth,
      getState: vi.fn(async () => ({
        ok: true,
        value: {
          status: signedIn ? "signed-in" : "signed-out",
          profile: signedIn ? profile : null,
        },
      })),
      loginMicrosoft: vi.fn(async () => ({ ok: true, value: profile })),
    },
    settings: {
      ...fallbackApi.settings,
      load: vi.fn(async () => ({
        appDirectory: "D:/Games",
        width: 1280,
        height: 720,
        fullscreen: false,
        memoryMb: 8192,
        selectedProject: "northvale",
        starMotion: true,
      })),
    },
    window: {
      ...fallbackApi.window,
      setContentDrawerOpen: vi.fn(),
      onContentDrawerLayout: vi.fn(() => () => undefined),
    },
  } as LauncherApi;
}

describe("0.3.8 production navigation", () => {
  it("keeps the wordmark visible when React replays mounting effects", async () => {
    render(
      <StrictMode>
        <App api={apiFor(false)} />
      </StrictMode>,
    );
    await act(async () => {});
    expect(
      screen.getByRole("heading", { name: "BEFOREBEDTIME" }),
    ).toBeVisible();
  });
  it("keeps the same sky mounted and locks Northvale when a saved session enters SaiNam", async () => {
    const api = apiFor();
    const { container } = render(<App api={api} />);
    const sky = container.querySelector("#entry-stars");
    expect(sky?.children.length).toBe(100);
    fireEvent.click(screen.getByRole("button", { name: "Click to start" }));
    expect(
      await screen.findByRole("button", { name: /Northvale.*ยังไม่เปิด/ }),
    ).toBeDisabled();
    expect(container.querySelector("#entry-stars")).toBe(sky);
    expect(api.auth.loginMicrosoft).not.toHaveBeenCalled();
  });

  it("opens settings over the main page without changing the window size", async () => {
    const api = apiFor();
    render(<App api={api} />);
    fireEvent.click(screen.getByRole("button", { name: "Click to start" }));
    fireEvent.click(
      await screen.findByRole("button", { name: "ตั้งค่า Launcher" }),
    );
    expect(
      await screen.findByRole("dialog", { name: "ตั้งค่า Launcher" }),
    ).toBeVisible();
    expect(api.window?.setContentDrawerOpen).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "ปิดแผง" }));
    await waitFor(() =>
      expect(
        screen.queryByRole("dialog", { name: "ตั้งค่า Launcher" }),
      ).not.toBeInTheDocument(),
    );
  });

  it("returns from Login to Start using the same sky", async () => {
    const { container } = render(<App api={apiFor(false)} />);
    const sky = container.querySelector("#entry-stars");
    fireEvent.click(screen.getByRole("button", { name: "Click to start" }));
    fireEvent.click(
      await screen.findByRole("button", { name: "กลับหน้าเริ่มต้น" }),
    );
    expect(
      await screen.findByRole("button", { name: "Click to start" }),
    ).toBeVisible();
    expect(container.querySelector("#entry-stars")).toBe(sky);
  });
});
