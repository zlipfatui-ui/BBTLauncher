import { useState } from "react";
import type { LauncherApi } from "./launcherApi";
import { Icon } from "./Visuals";
import { operationError } from "./operation-error";

const maxNoteLength = 500;

/** "ส่ง Logs ให้ Admin": uploads this project's recent game logs, tied to the signed-in Minecraft account. */
export function LogReportSection({ api, projectId }: { api: LauncherApi; projectId?: string }) {
  const [note, setNote] = useState(""),
    [sending, setSending] = useState(false),
    [status, setStatus] = useState<{ kind: "ok" | "error"; text: string } | null>(null);

  async function send() {
    setSending(true);
    setStatus(null);
    try {
      const result = await api.logs.send(projectId, note);
      if (result.ok) {
        setNote("");
        setStatus({ kind: "ok", text: `ส่งแล้ว ${result.value.files.length} ไฟล์ · รหัส ${result.value.id.slice(0, 8)} แจ้งรหัสนี้กับแอดมินได้เลย` });
      } else setStatus({ kind: "error", text: result.error.message });
    } catch (err) {
      setStatus({ kind: "error", text: operationError(err) });
    } finally {
      setSending(false);
    }
  }

  return (
    <section className="setting-section">
      <h3 className="section-title">แจ้งปัญหา</h3>
      <label className="field-label" htmlFor="log-note">
        เล่าอาการสั้น ๆ (ไม่ใส่ก็ได้)
      </label>
      <textarea
        id="log-note"
        className="select-field log-note"
        rows={3}
        maxLength={maxNoteLength}
        value={note}
        placeholder="เช่น เกมเด้งตอนเข้าโลก"
        onChange={(event) => setNote(event.target.value)}
      />
      <button className="panel-button" disabled={sending} aria-busy={sending} onClick={() => void send()}>
        <Icon name="check" />
        {sending ? "กำลังส่ง…" : "ส่ง Logs ให้ Admin"}
      </button>
      <p className="field-help" role="status">
        {status?.text ??
          "ส่ง latest.log, crash report และข้อมูลเครื่องให้แอดมินดู ระบบลบ token และชื่อผู้ใช้ Windows ออกก่อนส่ง"}
      </p>
    </section>
  );
}
