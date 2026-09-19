import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ProjectScreenshotEntry } from "../shared/types";
import type { LauncherApi } from "./launcherApi";
import { Icon } from "./Visuals";
import { Overlay } from "./motion";
import { operationError } from "./operation-error";

const emptyEntries: ProjectScreenshotEntry[] = [];

export function useScreenshots(
  api: LauncherApi,
  projectId: string,
  path: string,
  active: boolean,
  open: boolean,
) {
  const source = useMemo(() => ({ api, projectId, path }), [api, projectId, path]);
  const currentSource = useRef(source);
  currentSource.current = source;
  const [listing, setListing] = useState({
    source,
    entries: emptyEntries,
    error: "",
    loading: false,
  });
  const revision = useRef(0);
  const refresh = useCallback(async () => {
    if (currentSource.current !== source) return;
    const id = ++revision.current;
    setListing((previous) => ({
      source,
      entries: previous.source === source ? previous.entries : emptyEntries,
      error: "",
      loading: true,
    }));
    try {
      const result = await api.project.screenshots.list(projectId);
      if (revision.current !== id || currentSource.current !== source) return;
      if (!result.ok) throw new Error(result.error.message);
      setListing({ source, entries: result.value.entries, error: "", loading: false });
    } catch (err) {
      if (revision.current === id && currentSource.current === source)
        setListing({ source, entries: emptyEntries, error: operationError(err), loading: false });
    }
  }, [api, projectId, source]);
  useEffect(() => {
    if (!active) return;
    void refresh();
    const focus = () => void refresh();
    window.addEventListener("focus", focus);
    return () => {
      revision.current++;
      window.removeEventListener("focus", focus);
    };
  }, [active, open, refresh]);
  // Hide the previous directory synchronously, before new effects or IPC complete.
  return {
    entries: listing.source === source ? listing.entries : emptyEntries,
    error: listing.source === source ? listing.error : "",
    loading: listing.source === source ? listing.loading : active,
    refresh,
  };
}

export function ScreenshotThumbnail({
  api,
  projectId,
  entry,
}: {
  api: LauncherApi;
  projectId: string;
  entry?: ProjectScreenshotEntry;
}) {
  const container = useRef<HTMLSpanElement>(null);
  const identity = useMemo(
    () => ({ api, projectId, relativePath: entry?.relativePath, modifiedAt: entry?.modifiedAt }),
    [api, projectId, entry?.relativePath, entry?.modifiedAt],
  );
  const [image, setImage] = useState({ identity, url: "" });
  const url = image.identity === identity ? image.url : "";
  useEffect(() => {
    if (!entry) return;
    let live = true,
      requested = false;
    const load = () => {
      if (requested) return;
      requested = true;
      void api.project.screenshots
        .read(projectId, entry.relativePath, true)
        .then((result) => {
          if (live && result.ok) setImage({ identity, url: result.value.dataUrl });
        })
        .catch(() => undefined);
    };
    const observer =
      typeof IntersectionObserver !== "undefined"
        ? new IntersectionObserver((records) => {
            if (records.some((record) => record.isIntersecting)) {
              load();
              observer?.disconnect();
            }
          })
        : null;
    if (observer && container.current) observer.observe(container.current);
    else load();
    return () => {
      live = false;
      observer?.disconnect();
    };
  }, [api, projectId, identity]);
  return (
    <span className="screenshot-thumbnail" ref={container}>
      {url ? <img src={url} alt="" draggable={false} /> : <Icon name="photo" />}
    </span>
  );
}

type ScreenshotGalleryProps = {
  api: LauncherApi;
  projectId: string;
  path: string;
  open: boolean;
  onClose(): void;
  library: ReturnType<typeof useScreenshots>;
};

export function ScreenshotGallery(props: ScreenshotGalleryProps) {
  // A new root must never inherit a filename, decoded image, or pending read.
  return <ScreenshotViewer key={JSON.stringify([props.projectId, props.path])} {...props} />;
}

function ScreenshotViewer({
  api,
  projectId,
  path,
  open,
  onClose,
  library,
}: ScreenshotGalleryProps) {
  const [selected, setSelected] = useState<string | null>(null),
    [image, setImage] = useState(""),
    [previousImage, setPreviousImage] = useState(""),
    [loading, setLoading] = useState(false),
    [error, setError] = useState(""),
    [readRevision, setReadRevision] = useState(0);
  const displayedImage = useRef("");
  const entries = library.entries;
  const entry =
    entries.find((item) => item.relativePath === selected) ?? entries[0];
  const index = entry ? entries.indexOf(entry) : -1;
  useEffect(() => {
    if (!open) { displayedImage.current="";setImage("");setPreviousImage("");return; }
    let active = true;
    setError("");
    if (!entry) {
      displayedImage.current="";setImage("");setPreviousImage("");
      setLoading(false);
      return;
    }
    setLoading(true);
    void api.project.screenshots
      .read(projectId, entry.relativePath, false)
      .then(async (result) => {
        if (!result.ok) throw new Error(result.error.message);
        const next = new Image();
        next.src = result.value.dataUrl;
        if (next.decode) await next.decode();
        if (active) {
          setPreviousImage(displayedImage.current);
          displayedImage.current=result.value.dataUrl;
          setImage(result.value.dataUrl);
        }
      })
      .catch((err) => {
        if (active) {setError(operationError(err,"เปิดรูปนี้ไม่ได้ ไฟล์อาจถูกย้ายหรือลบ ลองอ่านโฟลเดอร์อีกครั้ง"));displayedImage.current="";setImage("");setPreviousImage("");}
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [api, open, projectId, path, entry?.relativePath, entry?.modifiedAt, readRevision]);
  useEffect(()=>{if(!previousImage)return;const timer=setTimeout(()=>setPreviousImage(""),300);return()=>clearTimeout(timer);},[previousImage,image]);
  const previous = () => {
    if (index > 0) setSelected(entries[index - 1].relativePath);
  };
  const next = () => {
    if (index < entries.length - 1)
      setSelected(entries[index + 1].relativePath);
  };
  useEffect(() => {
    if (!open) return;
    const key = (event: KeyboardEvent) => {
      if ((event.target as HTMLElement).closest("input,textarea")) return;
      if (event.key === "ArrowLeft") {
        event.preventDefault();
        previous();
      }
      if (event.key === "ArrowRight") {
        event.preventDefault();
        next();
      }
    };
    document.addEventListener("keydown", key);
    return () => document.removeEventListener("keydown", key);
  }, [open, index, entries]);
  async function action(kind: "openFile" | "revealFile" | "openFolder") {
    setError("");
    try {
      const result =
        kind === "openFolder"
          ? await api.project.screenshots.openFolder(projectId)
          : entry
            ? await api.project.screenshots[kind](projectId, entry.relativePath)
            : null;
      if (result && !result.ok) throw new Error(result.error.message);
    } catch (err) {
      setError(operationError(err));
      void library.refresh();
    }
  }
  async function retry() {
    await library.refresh();
    setReadRevision((value) => value + 1);
  }
  return (
    <Overlay
      open={open}
      title="รูปที่ถ่ายไว้"
      subtitle={`SAINAM / ${entries.length} รูป`}
      onClose={onClose}
      className="gallery-panel"
    >
      <div className="screenshot-stage">
        <button
          className="screenshot-arrow previous"
          aria-label="รูปก่อนหน้า"
          disabled={index <= 0}
          onClick={previous}
        >
          <Icon name="chevron" />
        </button>
        <div className="screenshot-image-stage">
          {previousImage && <img src={previousImage} alt="" aria-hidden="true" draggable={false} />}
          {image && <img className="screenshot-current" key={image} src={image} alt={entry?.name} draggable={false} />}
          <div className="screenshot-empty" role="status">
            {loading
              ? "กำลังเปิดรูป…"
              : error ||
                library.error ||
                (!entry
                  ? library.loading
                    ? "กำลังอ่านรูป…"
                    : "ยังไม่มีรูปที่ถ่ายไว้ · กด F2 ใน Minecraft เพื่อถ่ายรูป"
                  : "")}
          </div>
        </div>
        <button
          className="screenshot-arrow"
          aria-label="รูปถัดไป"
          disabled={index < 0 || index >= entries.length - 1}
          onClick={next}
        >
          <Icon name="chevron" />
        </button>
      </div>
      <div className="screenshot-file-bar">
        <div className="screenshot-file-info">
          <strong>{entry?.name ?? "รูปจากโลกสายน้ำ"}</strong>
          <span>
            {entry &&
              `${new Date(entry.modifiedAt).toLocaleString("th-TH")} · ${(entry.size / 1024 / 1024).toFixed(2)} MB`}
          </span>
        </div>
        <div className="screenshot-file-actions">
          <button
            className="screenshot-action"
            disabled={!entry || loading}
            onClick={() => void action("openFile")}
          >
            เปิดไฟล์รูป
            <Icon name="external" />
          </button>
          <button
            className="screenshot-action primary"
            disabled={!entry}
            onClick={() => void action("revealFile")}
          >
            <Icon name="folder" />
            แสดงในโฟลเดอร์
          </button>
        </div>
      </div>
      <div className="screenshot-filmstrip" aria-label="เลือกรูปที่ต้องการดู">
        {open &&
          entries.map((item) => (
            <button
              className="screenshot-thumb"
              key={`${path}:${item.relativePath}`}
              aria-label={item.name}
              aria-pressed={item === entry}
              onClick={() => setSelected(item.relativePath)}
            >
              <ScreenshotThumbnail
                api={api}
                projectId={projectId}
                entry={item}
              />
            </button>
          ))}
      </div>
      <footer className="screenshot-viewer-footer">
        <p>ภาพที่ถ่ายไว้ใน Minecraft · {projectId.toUpperCase()}</p>
        <button
          className="screenshot-action"
          onClick={() => void action("openFolder")}
        >
          <Icon name="folder" />
          เปิดโฟลเดอร์ screenshots
        </button>
      </footer>
      {(error || library.error) && (
        <button
          className="screenshot-action gallery-retry"
          onClick={() => void retry()}
        >
          อ่านโฟลเดอร์อีกครั้ง
        </button>
      )}
    </Overlay>
  );
}
