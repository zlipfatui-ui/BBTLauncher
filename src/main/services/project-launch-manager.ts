import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import type { LaunchResult, ProjectLaunchState } from '../../shared/types.js';

const execFileAsync = promisify(execFile);

type LaunchWork = () => Promise<LaunchResult>;

export interface ProjectLaunchManagerOptions {
  isProcessRunning?: (pid: number) => Promise<boolean>;
  killProcessTree?: (pid: number) => Promise<void>;
  collectDiagnostics?: (state: ProjectLaunchState) => Promise<void>;
  onStateChange?: (state: ProjectLaunchState) => void;
  watchIntervalMs?: number;
  diagnosticDelayMs?: number;
}

export interface ProjectLaunchManager {
  getState(projectId?: string): ProjectLaunchState;
  launch(projectId: string, work: LaunchWork): Promise<LaunchResult>;
  stop(projectId: string): Promise<ProjectLaunchState>;
}

async function defaultIsProcessRunning(pid: number): Promise<boolean> {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

async function defaultKillProcessTree(pid: number): Promise<void> {
  if (process.platform === 'win32') {
    await execFileAsync('taskkill.exe', ['/PID', String(pid), '/T', '/F'], { windowsHide: true });
    return;
  }
  try {
    process.kill(pid, 'SIGTERM');
  } catch {
    // Process already exited.
  }
}

export function createProjectLaunchManager(options: ProjectLaunchManagerOptions = {}): ProjectLaunchManager {
  const isProcessRunning = options.isProcessRunning || defaultIsProcessRunning;
  const killProcessTree = options.killProcessTree || defaultKillProcessTree;
  const watchIntervalMs = options.watchIntervalMs ?? 5000;
  const diagnosticDelayMs = options.diagnosticDelayMs ?? 120000;
  let state: ProjectLaunchState = { status: 'idle' };
  let watchTimer: ReturnType<typeof setInterval> | undefined;
  let diagnosticTimer: ReturnType<typeof setTimeout> | undefined;

  function emit(next: ProjectLaunchState): ProjectLaunchState {
    state = next;
    options.onStateChange?.(state);
    return state;
  }

  function clearTimers() {
    if (watchTimer) clearInterval(watchTimer);
    if (diagnosticTimer) clearTimeout(diagnosticTimer);
    watchTimer = undefined;
    diagnosticTimer = undefined;
  }

  function scheduleDiagnostics() {
    if (!options.collectDiagnostics || !state.pid || diagnosticDelayMs <= 0) return;
    if (diagnosticTimer) clearTimeout(diagnosticTimer);
    diagnosticTimer = setTimeout(() => {
      const snapshot = state;
      if (snapshot.status === 'running' && snapshot.pid) {
        void options.collectDiagnostics?.(snapshot).catch(() => undefined);
      }
    }, diagnosticDelayMs);
  }

  function watchProcess(pid: number) {
    if (watchIntervalMs <= 0) return;
    if (watchTimer) clearInterval(watchTimer);
    watchTimer = setInterval(() => {
      void isProcessRunning(pid).then((running) => {
        if (!running && state.status !== 'idle') {
          clearTimers();
          emit({ status: 'idle' });
        }
      }).catch(() => undefined);
    }, watchIntervalMs);
  }

  return {
    getState(projectId?: string) {
      if (projectId && state.projectId && state.projectId !== projectId) return { status: 'idle' };
      return state;
    },

    async launch(projectId, work) {
      if (state.status === 'starting' || state.status === 'running' || state.status === 'stopping') {
        return { pid: state.pid };
      }

      emit({ status: 'starting', projectId, startedAt: new Date().toISOString() });
      try {
        const result = await work();
        if (typeof result.pid === 'number') {
          emit({ status: 'running', projectId, pid: result.pid, startedAt: state.startedAt || new Date().toISOString() });
          watchProcess(result.pid);
          scheduleDiagnostics();
        } else {
          clearTimers();
          emit({ status: 'idle' });
        }
        return result;
      } catch (error) {
        clearTimers();
        emit({ status: 'idle' });
        throw error;
      }
    },

    async stop(projectId) {
      if (state.projectId && state.projectId !== projectId) return state;
      if (state.status === 'idle') return state;
      const pid = state.pid;
      emit({ ...state, status: 'stopping' });
      if (pid) {
        await options.collectDiagnostics?.(state).catch(() => undefined);
        await killProcessTree(pid);
      }
      clearTimers();
      return emit({ status: 'idle' });
    }
  };
}
