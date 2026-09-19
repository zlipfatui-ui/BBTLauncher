import { useEffect, useState, type CSSProperties } from "react";
import type { LauncherSettings, SystemMemoryInfo } from "../shared/types";
import { getMemoryRange } from "../shared/memory";
import type { LauncherApi } from "./launcherApi";
import { Icon } from "./Visuals";
import { operationError } from "./operation-error";

export function SettingsView({
  api,
  settings,
  onSaved,
  open,
}: {
  api: LauncherApi;
  settings: LauncherSettings;
  onSaved(settings: LauncherSettings): void;
  open: boolean;
}) {
  const [draft, setDraft] = useState(settings),
    [memory, setMemory] = useState<SystemMemoryInfo | null>(null),
    [memoryError, setMemoryError] = useState("");
  const [editingPath, setEditingPath] = useState(false),
    [saving, setSaving] = useState(false),
    [notice, setNotice] = useState("");
  useEffect(() => {
    if (!open) return;
    setDraft(settings);
    setMemory(null);
    setMemoryError("");
    let current = true;
    void api.system
      .getMemoryInfo()
      .then((result) => {
        if (!current) return;
        if (result.ok) {
          setMemory(result.value);
          setDraft((value) => ({
            ...value,
            memoryMb: Math.min(
              value.memoryMb || getMemoryRange(result.value).defaultMb,
              result.value.maxMb,
            ),
          }));
        } else setMemoryError(result.error.message);
      })
      .catch((err) => {
        if (current) setMemoryError(operationError(err));
      });
    return () => {
      current = false;
    };
  }, [api, open]);
  const range = memory ? getMemoryRange(memory, settings.memoryMb) : null;
  // Native step is anchored to min. Keep an odd legacy value representable, then snap pointer changes to the 64 MB grid.
  const nativeStep =
    range && (range.minMb % 64 !== 0 || draft.memoryMb % 64 !== 0) ? "any" : 64;
  function chooseMemory(value: number) {
    if (range)
      setDraft((current) => ({
        ...current,
        memoryMb: Math.max(
          range.minMb,
          Math.min(range.maxMb, Math.round(value / 64) * 64),
        ),
      }));
  }
  const resolution = `${draft.width}x${draft.height}`;
  const presets = [
    "1280x720",
    "1366x768",
    "1600x900",
    "1920x1080",
    "2560x1440",
  ];
  async function browse() {
    try {
      const next = await api.settings.selectAppDirectory(draft.appDirectory);
      if (next) setDraft((value) => ({ ...value, appDirectory: next }));
    } catch (err) {
      setNotice(operationError(err));
    }
  }
  async function save() {
    if (saving) return;
    setSaving(true);
    setNotice("");
    try {
      const saved = await api.settings.save(draft);
      await api.window?.applyDisplaySettings({
        width: saved.width,
        height: saved.height,
        fullscreen: saved.fullscreen,
      });
      onSaved(saved);
      setDraft(saved);
      setNotice("บันทึกการตั้งค่าแล้ว");
      setEditingPath(false);
    } catch (err) {
      setNotice(operationError(err));
    } finally {
      setSaving(false);
    }
  }
  return (
    <>
      <section className="setting-section">
        <div className="directory-heading">
          <h3 className="section-title">ที่เก็บเกมและ Modpack</h3>
          <button
            className="directory-change"
            onClick={() => setEditingPath(!editingPath)}
            aria-expanded={editingPath}
          >
            <Icon name="folder" />
            เปลี่ยน Path
          </button>
        </div>
        <code className="directory-path">{draft.appDirectory}</code>
        <p className="field-help">โฟลเดอร์สำหรับ Modpack, โลก และ Java</p>
        <div
          className={`expand-region ${editingPath ? "expanded" : ""}`}
          inert={!editingPath}
          aria-hidden={!editingPath}
        >
          <div>
            <div
              className="directory-editor"
              onKeyDown={(event) => {
                if (event.key === "Escape") {
                  event.stopPropagation();
                  setEditingPath(false);
                }
              }}
            >
              <label className="field-label" htmlFor="directory-path">
                Path ใหม่
              </label>
              <input
                id="directory-path"
                className="select-field directory-input"
                value={draft.appDirectory}
                onChange={(event) =>
                  setDraft({ ...draft, appDirectory: event.target.value })
                }
                spellCheck={false}
              />
              <p className="field-help">
                เมื่อบันทึก จะคัดลอกข้อมูลเกมไปที่ใหม่ โดยเก็บต้นฉบับไว้
              </p>
              <div className="directory-actions">
                <button onClick={() => setEditingPath(false)}>ยกเลิก</button>
                <button
                  className="directory-apply"
                  onClick={() => void browse()}
                >
                  <Icon name="folder" />
                  เลือกโฟลเดอร์
                </button>
              </div>
            </div>
          </div>
        </div>
      </section>
      <section className="setting-section">
        <h3 className="section-title">ประสิทธิภาพเกม</h3>
        <label className="field-label" htmlFor="memory">
          หน่วยความจำ (RAM)<output htmlFor="memory">{draft.memoryMb} MB</output>
        </label>
        <input
          id="memory"
          className="memory-slider"
          type="range"
          min={range?.minMb ?? 0}
          max={range?.maxMb ?? 0}
          step={nativeStep}
          disabled={!range}
          value={draft.memoryMb}
          style={
            {
              "--memory-fill": range
                ? `${((draft.memoryMb - range.minMb) / Math.max(1, range.maxMb - range.minMb)) * 100}%`
                : "0%",
            } as CSSProperties
          }
          aria-valuetext={`${draft.memoryMb} MB`}
          aria-describedby="memory-help"
          onChange={(event) => chooseMemory(Number(event.target.value))}
          onKeyDown={(event) => {
            if (!range) return;
            const direction =
              event.key === "ArrowRight" || event.key === "ArrowUp"
                ? 1
                : event.key === "ArrowLeft" || event.key === "ArrowDown"
                  ? -1
                  : 0;
            if (event.key === "Home" || event.key === "End") {
              event.preventDefault();
              setDraft({
                ...draft,
                memoryMb: event.key === "Home" ? range.minMb : range.maxMb,
              });
            } else if (direction) {
              event.preventDefault();
              chooseMemory(draft.memoryMb + direction * 64);
            }
          }}
        />
        {range && (
          <div className="range-ends">
            <span>{range.minMb} MB</span>
            <span>{range.maxMb} MB</span>
          </div>
        )}
        <p className="field-help" id="memory-help">
          {memoryError ||
            (!memory
              ? "กำลังอ่านหน่วยความจำของเครื่อง…"
              : "เลือกให้เหมาะกับสเปกเครื่อง และเหลือหน่วยความจำสำหรับโปรแกรมอื่น")}
        </p>
      </section>
      <section className="setting-section">
        <h3 className="section-title">การแสดงผล</h3>
        <label className="field-label" htmlFor="resolution">
          ขนาดหน้าต่าง
        </label>
        <select
          id="resolution"
          className="select-field"
          value={resolution}
          onChange={(event) => {
            const [width, height] = event.target.value.split("x").map(Number);
            setDraft({ ...draft, width, height });
          }}
        >
          {!presets.includes(resolution) && (
            <option value={resolution}>{resolution.replace("x", " × ")}</option>
          )}
          {presets.map((size) => (
            <option key={size} value={size}>
              {size.replace("x", " × ")}
            </option>
          ))}
        </select>
        <label className="switch-row">
          เต็มหน้าจอ
          <input
            type="checkbox"
            checked={draft.fullscreen}
            onChange={(event) =>
              setDraft({ ...draft, fullscreen: event.target.checked })
            }
          />
        </label>
      </section>
      <section className="setting-section">
        <h3 className="section-title">หน้าตา Launcher</h3>
        <div className="theme-description">
          <span className="theme-preview" />
          <span>ดำ–ขาว</span>
        </div>
        <label className="switch-row">
          ดาวเคลื่อนไหว
          <input
            type="checkbox"
            checked={draft.starMotion}
            onChange={(event) =>
              setDraft({ ...draft, starMotion: event.target.checked })
            }
          />
        </label>
      </section>
      <button
        className="panel-button"
        disabled={saving || !draft.appDirectory || !memory}
        onClick={() => void save()}
      >
        <Icon name="check" />
        {saving ? "กำลังบันทึก…" : "บันทึกการตั้งค่า"}
      </button>
      {notice && (
        <p className="field-help feedback-motion" role="status">
          {notice}
        </p>
      )}
    </>
  );
}
