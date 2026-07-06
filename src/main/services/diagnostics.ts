import { execFile } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, open, readdir, writeFile } from 'node:fs/promises';
import { basename, dirname, join } from 'node:path';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const maxLogTailBytes = 80_000;

export interface LaunchDiagnosticsOptions {
  rootDir: string;
  projectId: string;
  pid?: number;
  runtime: {
    minecraftVersion: string;
    loaderVersion: string;
    javaPath?: string;
  };
  now?: () => Date;
  collectThreadDump?: (pid: number, javaPath?: string) => Promise<string>;
}

export interface LaunchDiagnosticsResult {
  filePath: string;
}

async function readTail(path: string): Promise<string | null> {
  let file: Awaited<ReturnType<typeof open>> | undefined;
  try {
    file = await open(path, 'r');
    const { size } = await file.stat();
    const length = Math.min(size, maxLogTailBytes);
    const buffer = Buffer.alloc(length);
    await file.read(buffer, 0, length, size - length);
    return buffer.toString('utf8');
  } catch {
    return null;
  } finally {
    await file?.close().catch(() => undefined);
  }
}

async function collectRecentLogs(projectDir: string): Promise<Record<string, string>> {
  const logsDir = join(projectDir, 'logs');
  const result: Record<string, string> = {};
  let entries: string[] = [];
  try {
    entries = await readdir(logsDir);
  } catch {
    return result;
  }

  for (const name of entries.filter((entry) => /^(latest|debug)\.log$/i.test(entry))) {
    const tail = await readTail(join(logsDir, name));
    if (tail !== null) result[name] = tail;
  }
  return result;
}

async function defaultCollectThreadDump(pid: number, javaPath?: string): Promise<string> {
  const javaBinDir = javaPath ? dirname(javaPath) : '';
  const candidates = [
    javaBinDir ? join(javaBinDir, 'jcmd.exe') : '',
    javaBinDir ? join(javaBinDir, 'jstack.exe') : '',
    'jcmd.exe',
    'jstack.exe'
  ].filter(Boolean);

  for (const candidate of candidates) {
    try {
      const tool = basename(candidate).toLowerCase();
      const args = tool.startsWith('jcmd') ? [String(pid), 'Thread.print'] : [String(pid)];
      const { stdout, stderr } = await execFileAsync(candidate, args, { windowsHide: true, timeout: 15000 });
      return `${stdout}${stderr ? `\n${stderr}` : ''}`;
    } catch {
      // Try the next available JVM diagnostic tool.
    }
  }
  return 'Thread dump unavailable: jcmd/jstack was not found or could not attach.';
}

export async function writeLaunchDiagnostics(options: LaunchDiagnosticsOptions): Promise<LaunchDiagnosticsResult> {
  const now = options.now?.() || new Date();
  const projectDir = join(options.rootDir, 'projects', options.projectId);
  const diagnosticsDir = join(options.rootDir, 'diagnostics', options.projectId);
  const stamp = now.toISOString().replace(/[:.]/g, '-');
  const filePath = join(diagnosticsDir, `${stamp}.json`);
  await mkdir(diagnosticsDir, { recursive: true });

  const threadDump = options.pid
    ? await (options.collectThreadDump || defaultCollectThreadDump)(options.pid, options.runtime.javaPath).catch((error: unknown) =>
        `Thread dump failed: ${error instanceof Error ? error.message : String(error)}`
      )
    : 'Thread dump skipped: no pid was available.';

  const payload = {
    generatedAt: now.toISOString(),
    projectId: options.projectId,
    pid: options.pid,
    runtime: options.runtime,
    paths: {
      projectDir,
      latestLog: join(projectDir, 'logs', 'latest.log'),
      debugLog: join(projectDir, 'logs', 'debug.log')
    },
    exists: {
      projectDir: existsSync(projectDir),
      latestLog: existsSync(join(projectDir, 'logs', 'latest.log')),
      debugLog: existsSync(join(projectDir, 'logs', 'debug.log'))
    },
    logs: await collectRecentLogs(projectDir),
    threadDump
  };

  await writeFile(filePath, `${JSON.stringify(payload, null, 2)}\n`);
  return { filePath };
}
