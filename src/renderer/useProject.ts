import { useCallback, useEffect, useRef, useState } from "react";
import type {
  LauncherProject,
  ProjectLaunchState,
  ProjectProgressEvent,
  ProjectStateResult,
} from "../shared/types";
import type { LauncherApi } from "./launcherApi";
import { operationError } from "./operation-error";

export function useProject(
  api: LauncherApi,
  project: LauncherProject,
  path: string,
) {
  const [state, setState] = useState<ProjectStateResult | null>(null);
  const [launch, setLaunch] = useState<ProjectLaunchState>({ status: "idle" });
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const [progress, setProgress] = useState<ProjectProgressEvent | null>(null);
  const [revision, setRevision] = useState(0);
  const operation = useRef(false);
  const refresh = useCallback(async () => {
    try {
      setState(await api.project.getState(project.id));
      setError("");
    } catch (err) {
      setState(null);
      setError(operationError(err));
    }
  }, [api, project.id]);
  useEffect(() => {
    let live = true;
    setState(null);
    void api.project
      .getState(project.id)
      .then((result) => {
        if (live) setState(result);
      })
      .catch((err) => {
        if (live) setError(operationError(err));
      });
    return () => {
      live = false;
    };
  }, [api, project.id, path]);
  useEffect(() => {
    let live = true;
    void api.project
      .getLaunchState(project.id)
      .then((result) => {
        if (live) setLaunch(result);
      })
      .catch(() => undefined);
    const dispose = api.project.onLaunchState((next) => {
      if (
        !next.projectId ||
        next.projectId === project.id ||
        next.status === "idle"
      )
        setLaunch(next);
    });
    const disposeProgress = api.project.onProgress((next) => {
      if (next.projectId === project.id) setProgress(next);
    });
    return () => {
      live = false;
      dispose();
      disposeProgress();
    };
  }, [api, project.id]);
  useEffect(() => {
    if (launch.status === "idle" || launch.status === "running")
      setProgress(null);
  }, [launch.status]);
  const repair =
    state?.state === "update" && (state.missing > 0 || state.changed > 0);
  const disabled =
    busy ||
    launch.status === "starting" ||
    launch.status === "stopping" ||
    (!state && !error);
  const label =
    launch.status === "running"
      ? "หยุดเกม"
      : launch.status === "stopping"
        ? "กำลังหยุด…"
        : busy || launch.status === "starting"
          ? "กำลังเตรียม…"
          : error && !state
            ? "ลองตรวจอีกครั้ง"
            : !state
              ? "กำลังตรวจสอบ"
              : state.state === "install"
                ? "ติดตั้งเกม"
                : state.state === "update"
                  ? repair
                    ? "ซ่อมไฟล์"
                    : "อัปเดตเกม"
                  : "เข้าเกม";
  const status =
    progress?.message ||
    (launch.status === "running"
      ? "กำลังอยู่ในโลกสายน้ำ"
      : launch.status === "stopping"
        ? "กำลังหยุดเกม"
        : busy
          ? "กำลังเตรียมไฟล์"
          : !state
            ? "กำลังตรวจสอบไฟล์เกม"
            : state.state === "install"
              ? "เริ่มการเดินทางครั้งแรก"
              : state.state === "update"
                ? repair
                  ? "ไฟล์เกมต้องได้รับการซ่อมแซม"
                  : "มีไฟล์เกมเวอร์ชันใหม่"
                : "พร้อมออกเดินทาง");
  async function act() {
    if (operation.current || disabled) return;
    operation.current = true;
    setError("");
    try {
      if (launch.status === "running") {
        setLaunch(await api.project.stop(project.id));
        return;
      }
      if (!state) {
        await refresh();
        return;
      }
      setBusy(true);
      if (state.state !== "ready") {
        await api.project.sync(project.id);
        setState({ state: "ready", missing: 0, changed: 0, stale: 0 });
        setRevision((value) => value + 1);
      } else {
        const result = await api.project.launch(project.id);
        if (!result.ok) throw new Error(result.error.message);
        if (result.value.pid)
          setLaunch({
            status: "running",
            projectId: project.id,
            pid: result.value.pid,
          });
      }
    } catch (err) {
      setError(operationError(err));
    } finally {
      operation.current = false;
      setBusy(false);
      setProgress(null);
    }
  }
  return {
    state,
    launch,
    busy,
    progress,
    error,
    label,
    status,
    disabled,
    act,
    revision,
  };
}
