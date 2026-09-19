import { act, fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type {
  IpcResult,
  ProjectScreenshotEntry,
  ProjectScreenshotListResult,
} from "../shared/types";
import { fallbackApi, type LauncherApi } from "./launcherApi";
import { ScreenshotGallery, ScreenshotThumbnail, useScreenshots } from "./ScreenshotGallery";

const entries: ProjectScreenshotEntry[] = ["one.png", "two.png"].map((name) => ({
  name,
  relativePath: name,
  modifiedAt: "2026-09-19T12:00:00.000Z",
  size: 100,
}));
const listed = (items = entries): IpcResult<ProjectScreenshotListResult> => ({
  ok: true,
  value: { entries: items, directoryExists: true },
});
const failed = { ok: false as const, error: { code: "SCREENSHOT_UNAVAILABLE" as const, message: "Temporarily unreadable" } };
const imageUrl = (name: string) => `data:image/png;base64,${btoa(name)}`;

function makeApi() {
  return {
    ...fallbackApi,
    project: {
      ...fallbackApi.project,
      screenshots: {
        ...fallbackApi.project.screenshots,
        list: vi.fn(async () => listed()),
        read: vi.fn(async (_project: string, name: string, thumbnail?: boolean) => ({
          ok: true as const,
          value: { dataUrl: imageUrl(`${thumbnail ? "thumb" : "full"}:${name}`) },
        })),
        openFile: vi.fn(async () => ({ ok: true as const, value: undefined })),
        revealFile: vi.fn(async () => ({ ok: true as const, value: undefined })),
      },
    },
  } satisfies LauncherApi;
}

function Gallery({ api, projectId = "sainam", path = "D:/Games" }: {
  api: LauncherApi;
  projectId?: string;
  path?: string;
}) {
  const library = useScreenshots(api, projectId, path, true, true);
  return <>
    <div aria-label="Latest screenshot">
      <ScreenshotThumbnail api={api} projectId={projectId} entry={library.entries[0]} />
    </div>
    <ScreenshotGallery api={api} projectId={projectId} path={path} open onClose={() => undefined} library={library} />
  </>;
}

function pending<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}

async function mountGallery(api: LauncherApi) {
  let view!: ReturnType<typeof render>;
  await act(async () => { view = render(<Gallery api={api} />); });
  return view;
}

describe("screenshot recovery and directory identity", () => {
  it("retries the selected full image when a fresh listing has unchanged metadata", async () => {
    const api = makeApi();
    let failedOnce = false;
    api.project.screenshots.read.mockImplementation(async (_project, name, thumbnail) => {
      if (!thumbnail && !failedOnce) {
        failedOnce = true;
        throw new Error("Temporarily unreadable");
      }
      return { ok: true, value: { dataUrl: imageUrl(`${thumbnail ? "thumb" : "full"}:${name}`) } };
    });
    await mountGallery(api);
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "อ่านโฟลเดอร์อีกครั้ง" })); });
    expect(await screen.findByRole("img", { name: "one.png" })).toHaveAttribute("src", imageUrl("full:one.png"));
    expect(screen.queryByRole("button", { name: "อ่านโฟลเดอร์อีกครั้ง" })).not.toBeInTheDocument();
  });

  it("keeps an already loaded full image during a benign focus refresh", async () => {
    const api = makeApi();
    await mountGallery(api);
    const image = await screen.findByRole("img", { name: "one.png" });
    await act(async () => { fireEvent(window, new Event("focus")); });
    expect(screen.getByRole("img", { name: "one.png" })).toBe(image);
    expect(api.project.screenshots.read.mock.calls.filter((call) => !call[2])).toHaveLength(1);
  });

  it.each([
    { path: "E:/OtherGames", projectId: "sainam" },
    { path: "D:/Games", projectId: "other-project" },
  ])("invalidates old file actions, images, and selection before listing $path/$projectId", async (next) => {
    const api = makeApi();
    const { rerender, container } = await mountGallery(api);
    await screen.findByRole("img", { name: "one.png" });
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "two.png" })); });
    await screen.findByRole("img", { name: "two.png" });
    const nextListing = pending<IpcResult<ProjectScreenshotListResult>>();
    api.project.screenshots.list.mockReturnValueOnce(nextListing.promise);
    api.project.screenshots.read.mockClear();
    rerender(<Gallery api={api} {...next} />);
    expect(screen.queryByRole("button", { name: "one.png" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "two.png" })).not.toBeInTheDocument();
    expect(container.querySelectorAll("img")).toHaveLength(0);
    fireEvent.click(screen.getByRole("button", { name: "แสดงในโฟลเดอร์" }));
    expect(api.project.screenshots.revealFile).not.toHaveBeenCalled();
    expect(api.project.screenshots.read).not.toHaveBeenCalled();
    api.project.screenshots.read.mockImplementation(async (_project, name, thumbnail) => ({
      ok: true,
      value: { dataUrl: imageUrl(`new:${thumbnail ? "thumb" : "full"}:${name}`) },
    }));
    await act(async () => { nextListing.resolve(listed()); });
    expect(await screen.findByRole("img", { name: "one.png" })).toHaveAttribute("src", imageUrl("new:full:one.png"));
    expect(screen.getByRole("button", { name: "one.png" })).toHaveAttribute("aria-pressed", "true");
    expect(container.querySelector('[aria-label="Latest screenshot"] img')).toHaveAttribute("src", imageUrl("new:thumb:one.png"));
  });

  it("clears stale entries and file actions when the current directory becomes unreadable", async () => {
    const api = makeApi();
    const { container } = await mountGallery(api);
    await screen.findByRole("img", { name: "one.png" });
    api.project.screenshots.list.mockResolvedValueOnce(failed);
    await act(async () => { fireEvent(window, new Event("focus")); });
    expect(screen.queryByRole("button", { name: "one.png" })).not.toBeInTheDocument();
    expect(container.querySelectorAll("img")).toHaveLength(0);
    expect(screen.getByRole("button", { name: "เปิดไฟล์รูป" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "แสดงในโฟลเดอร์" })).toBeDisabled();
    expect(screen.getByRole("status")).not.toBeEmptyDOMElement();
    expect(screen.getByRole("button", { name: "อ่านโฟลเดอร์อีกครั้ง" })).toBeEnabled();
  });

  it("ignores an old directory listing that arrives after the new one", async () => {
    const api = makeApi();
    const oldListing = pending<IpcResult<ProjectScreenshotListResult>>();
    api.project.screenshots.list.mockReturnValueOnce(oldListing.promise);
    const { rerender } = await mountGallery(api);
    api.project.screenshots.list.mockResolvedValueOnce(listed([{ ...entries[0], name: "new.png", relativePath: "new.png" }]));
    rerender(<Gallery api={api} path="E:/OtherGames" />);
    await screen.findByRole("button", { name: "new.png" });
    await act(async () => { oldListing.resolve(listed()); });
    expect(screen.queryByRole("button", { name: "one.png" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "new.png" })).toBeEnabled();
  });
});
