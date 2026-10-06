import { open, readdir, stat } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';

const maxTailBytes = 400_000;
const maxNoteLength = 500;

export interface LogReportOptions {
  rootDir: string;
  projectId?: string;
  note?: string;
  launcherVersion: string;
  baseUrl: string;
  accessToken: string;
  system?: Record<string, unknown>;
  fetcher?: typeof fetch;
}

export interface LogReportResult {
  id: string;
  files: string[];
}

export class LogReportError extends Error {
  constructor(readonly code: 'NO_LOGS' | 'UNAUTHORIZED' | 'RATE_LIMITED' | 'UPLOAD_FAILED', message: string) {
    super(message);
  }
}

async function readTail(path: string): Promise<string | null> {
  let file: Awaited<ReturnType<typeof open>> | undefined;
  try {
    file = await open(path, 'r');
    const { size } = await file.stat();
    const length = Math.min(size, maxTailBytes);
    const buffer = Buffer.alloc(length);
    await file.read(buffer, 0, length, size - length);
    return buffer.toString('utf8');
  } catch {
    return null;
  } finally {
    await file?.close().catch(() => undefined);
  }
}

async function newestFile(dir: string, pattern: RegExp): Promise<string | null> {
  let names: string[];
  try {
    names = (await readdir(dir)).filter((name) => pattern.test(name));
  } catch {
    return null;
  }
  let newest: { path: string; mtime: number } | null = null;
  for (const name of names) {
    const path = join(dir, name);
    const info = await stat(path).catch(() => null);
    if (info?.isFile() && (!newest || info.mtimeMs > newest.mtime)) newest = { path, mtime: info.mtimeMs };
  }
  return newest?.path ?? null;
}

/** Strips anything that identifies the account or machine beyond the Minecraft UUID the server already verifies. */
export function redactLogText(text: string, secrets: string[] = []): string {
  let result = text;
  for (const secret of secrets) {
    if (secret.length >= 8) result = result.split(secret).join('[REDACTED]');
  }
  const home = homedir();
  if (home.length > 3) result = result.split(home).join('%USER_HOME%');
  return result
    .replace(/(--accessToken\s+)\S+/gi, '$1[REDACTED]')
    .replace(/((?:access_?token|refresh_?token|password|xuid|clientId)["']?\s*[:=]\s*["']?)[^\s"',}]+/gi, '$1[REDACTED]')
    .replace(/\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g, '[REDACTED_JWT]')
    .replace(/([A-Za-z]:\\Users\\)[^\\\s"]+/gi, '$1%USER%');
}

/** Game logs, the newest crash report and the newest launcher launch diagnostics for one project. */
export async function collectLogFiles(rootDir: string, projectId: string | undefined, secrets: string[]): Promise<Record<string, string>> {
  const files: Record<string, string> = {};
  const add = async (name: string, path: string | null) => {
    if (!path) return;
    const text = await readTail(path);
    if (text) files[name] = redactLogText(text, secrets);
  };

  if (projectId && /^[a-z0-9-]+$/.test(projectId)) {
    const projectDir = join(rootDir, 'projects', projectId);
    await add('latest.log', join(projectDir, 'logs', 'latest.log'));
    await add('debug.log', join(projectDir, 'logs', 'debug.log'));
    await add('launcher-jvm.log', join(projectDir, 'logs', 'launcher-jvm.log'));
    await add('crash-report.txt', await newestFile(join(projectDir, 'crash-reports'), /\.txt$/i));
    await add('launch-diagnostics.json', await newestFile(join(rootDir, 'diagnostics', projectId), /\.json$/i));
    await add('jvm-crash.log', await newestFile(projectDir, /^hs_err_pid\d+\.log$/i));
  }
  return files;
}

export async function sendLogReport(options: LogReportOptions): Promise<LogReportResult> {
  const files = await collectLogFiles(options.rootDir, options.projectId, [options.accessToken]);
  if (Object.keys(files).length === 0) {
    throw new LogReportError('NO_LOGS', 'ยังไม่มี log ให้ส่ง ลองเปิดเกมสักครั้งก่อน');
  }

  const fetcher = options.fetcher ?? fetch;
  let response: Response;
  try {
    response = await fetcher(new URL('/api/launcher/logs', options.baseUrl), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${options.accessToken}` },
      body: JSON.stringify({
        launcherVersion: options.launcherVersion,
        projectId: options.projectId,
        platform: `${process.platform} ${process.arch}`,
        note: options.note?.trim().slice(0, maxNoteLength) || undefined,
        system: options.system,
        files
      }),
      signal: AbortSignal.timeout(60_000)
    });
  } catch {
    throw new LogReportError('UPLOAD_FAILED', 'ส่ง log ไม่สำเร็จ ตรวจอินเทอร์เน็ตแล้วลองใหม่');
  }

  if (response.status === 401) throw new LogReportError('UNAUTHORIZED', 'เซสชัน Microsoft หมดอายุ ล็อกอินใหม่แล้วลองอีกครั้ง');
  if (response.status === 429) throw new LogReportError('RATE_LIMITED', 'ส่งถี่เกินไป รอสักนาทีแล้วลองใหม่');
  if (!response.ok) throw new LogReportError('UPLOAD_FAILED', `ส่ง log ไม่สำเร็จ (${response.status})`);
  const body = (await response.json()) as { id: string };
  return { id: body.id, files: Object.keys(files) };
}
