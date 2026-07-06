import { describe, expect, it, vi } from 'vitest';
import { createProjectLaunchManager } from './project-launch-manager';

describe('project launch manager', () => {
  it('tracks a running Minecraft process and prevents duplicate launches', async () => {
    const states: string[] = [];
    const manager = createProjectLaunchManager({
      isProcessRunning: vi.fn(async () => true),
      watchIntervalMs: 0,
      killProcessTree: vi.fn(async () => undefined),
      onStateChange: (state) => states.push(state.status)
    });
    const launch = vi.fn(async () => ({ pid: 1234 }));

    const first = await manager.launch('northvale', launch);
    const second = await manager.launch('northvale', launch);

    expect(first).toEqual({ pid: 1234 });
    expect(second).toEqual({ pid: 1234 });
    expect(launch).toHaveBeenCalledOnce();
    expect(manager.getState('northvale')).toMatchObject({ status: 'running', pid: 1234 });
    expect(states).toEqual(['starting', 'running']);
  });

  it('kills the tracked process tree and returns to idle when STOP is requested', async () => {
    const killProcessTree = vi.fn(async () => undefined);
    const manager = createProjectLaunchManager({
      isProcessRunning: vi.fn(async () => false),
      watchIntervalMs: 0,
      killProcessTree
    });

    await manager.launch('northvale', async () => ({ pid: 1234 }));
    const stopped = await manager.stop('northvale');

    expect(killProcessTree).toHaveBeenCalledWith(1234);
    expect(stopped).toEqual({ status: 'idle' });
    expect(manager.getState('northvale')).toEqual({ status: 'idle' });
  });

  it('writes diagnostics before killing a running Minecraft process', async () => {
    const events: string[] = [];
    const manager = createProjectLaunchManager({
      isProcessRunning: vi.fn(async () => false),
      watchIntervalMs: 0,
      killProcessTree: vi.fn(async () => {
        events.push('kill');
      }),
      collectDiagnostics: vi.fn(async () => {
        events.push('diagnostics');
      })
    });

    await manager.launch('northvale', async () => ({ pid: 1234 }));
    await manager.stop('northvale');

    expect(events).toEqual(['diagnostics', 'kill']);
  });

  it('keeps Minecraft running when the pid is still alive after a successful kill command', async () => {
    const manager = createProjectLaunchManager({
      isProcessRunning: vi.fn(async () => true),
      watchIntervalMs: 0,
      killProcessTree: vi.fn(async () => undefined)
    });

    await manager.launch('northvale', async () => ({ pid: 1234 }));

    await expect(manager.stop('northvale')).resolves.toMatchObject({ status: 'running', pid: 1234 });
    expect(manager.getState('northvale')).toMatchObject({ status: 'running', pid: 1234 });
  });

  it('keeps Minecraft running when process tree killing fails and the pid is still alive', async () => {
    const manager = createProjectLaunchManager({
      isProcessRunning: vi.fn(async () => true),
      watchIntervalMs: 0,
      killProcessTree: vi.fn(async () => {
        throw new Error('taskkill failed');
      })
    });

    await manager.launch('northvale', async () => ({ pid: 1234 }));

    await expect(manager.stop('northvale')).resolves.toMatchObject({ status: 'running', pid: 1234 });
    expect(manager.getState('northvale')).toMatchObject({ status: 'running', pid: 1234 });
  });

  it('returns to idle when process tree killing fails after the pid already exited', async () => {
    const manager = createProjectLaunchManager({
      isProcessRunning: vi.fn(async () => false),
      watchIntervalMs: 0,
      killProcessTree: vi.fn(async () => {
        throw new Error('taskkill failed');
      })
    });

    await manager.launch('northvale', async () => ({ pid: 1234 }));

    await expect(manager.stop('northvale')).resolves.toEqual({ status: 'idle' });
    expect(manager.getState('northvale')).toEqual({ status: 'idle' });
  });

  it('does not let a stale watcher clear a newer running process', async () => {
    const watchers: Array<() => void> = [];
    const manager = createProjectLaunchManager({
      isProcessRunning: vi.fn(async () => false),
      watchIntervalMs: 1,
      killProcessTree: vi.fn(async () => undefined)
    });
    const originalSetInterval = globalThis.setInterval;
    vi.spyOn(globalThis, 'setInterval').mockImplementation(((callback: () => void) => {
      watchers.push(callback);
      return 1 as unknown as ReturnType<typeof setInterval>;
    }) as typeof setInterval);
    vi.spyOn(globalThis, 'clearInterval').mockImplementation(() => undefined);

    try {
      await manager.launch('northvale', async () => ({ pid: 1111 }));
      await manager.stop('northvale');
      await manager.launch('northvale', async () => ({ pid: 2222 }));
      watchers[0]?.();
      await Promise.resolve();
      await Promise.resolve();

      expect(manager.getState('northvale')).toMatchObject({ status: 'running', pid: 2222 });
    } finally {
      globalThis.setInterval = originalSetInterval;
      vi.restoreAllMocks();
    }
  });
});
