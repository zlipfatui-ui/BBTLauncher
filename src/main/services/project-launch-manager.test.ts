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
      isProcessRunning: vi.fn(async () => true),
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
      isProcessRunning: vi.fn(async () => true),
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
});
