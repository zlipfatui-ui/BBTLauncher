import { describe, expect, it, vi } from 'vitest';
import { createDiscordPresenceService } from './discord-presence';
import type { DiscordRpcClient } from './discord-rpc';

function createRpc(): DiscordRpcClient {
  return {
    start: vi.fn(),
    setActivity: vi.fn(),
    stop: vi.fn()
  };
}

describe('Discord presence state machine', () => {
  it('starts RPC and publishes launcher activity with the current Unix-second timestamp', () => {
    const rpc = createRpc();
    const presence = createDiscordPresenceService({ rpc, now: () => 1_725_000_123_456 });

    presence.start();

    expect(rpc.start).toHaveBeenCalledOnce();
    expect(rpc.setActivity).toHaveBeenCalledWith({
      type: 0,
      details: 'Using BeforeBedtime Launcher',
      state: 'กำลังเลือก Project',
      timestamps: { start: 1_725_000_123 },
      assets: { large_image: 'bbt', large_text: 'BeforeBedtime' },
      instance: false
    });
  });

  it('leaves launcher activity and its timestamp unchanged while a launch is starting or fails', () => {
    const rpc = createRpc();
    const presence = createDiscordPresenceService({ rpc, now: () => 1_725_000_123_456 });

    presence.start();
    presence.updateLaunchState({ status: 'starting' });
    presence.updateLaunchState({ status: 'idle' });

    expect(rpc.setActivity).toHaveBeenCalledOnce();
    expect(rpc.setActivity).toHaveBeenLastCalledWith(expect.objectContaining({
      timestamps: { start: 1_725_000_123 }
    }));
  });

  it('publishes Northvale activity with a timestamp refreshed after launcher startup when a project first runs', () => {
    const rpc = createRpc();
    let now = 1_725_000_123_456;
    const presence = createDiscordPresenceService({ rpc, now: () => now });

    presence.start();
    now = 1_725_000_999_999;
    presence.updateLaunchState({ status: 'running', startedAt: '2000-01-01T00:00:00.000Z' });

    expect(rpc.setActivity).toHaveBeenLastCalledWith({
      type: 0,
      details: 'กำลังเล่น Northvale',
      state: 'Minecraft 1.20.1 • Forge 47.4.20',
      timestamps: { start: 1_725_000_999 },
      assets: { large_image: 'bbt', large_text: 'BeforeBedtime' },
      instance: false
    });
  });

  it('preserves the game timestamp across repeated running and stopping states', () => {
    const rpc = createRpc();
    let now = 1_725_000_000_000;
    const presence = createDiscordPresenceService({ rpc, now: () => now });

    presence.start();
    presence.updateLaunchState({ status: 'running' });
    now = 1_725_000_999_000;
    presence.updateLaunchState({ status: 'running' });
    presence.updateLaunchState({ status: 'stopping' });

    expect(rpc.setActivity).toHaveBeenCalledTimes(2);
    expect(rpc.setActivity).toHaveBeenLastCalledWith(expect.objectContaining({
      details: 'กำลังเล่น Northvale',
      timestamps: { start: 1_725_000_000 }
    }));
  });

  it('returns to launcher activity with a fresh timestamp when a running project becomes idle', () => {
    const rpc = createRpc();
    let now = 1_725_000_000_000;
    const presence = createDiscordPresenceService({ rpc, now: () => now });

    presence.start();
    presence.updateLaunchState({ status: 'running' });
    now = 1_725_000_999_000;
    presence.updateLaunchState({ status: 'idle' });

    expect(rpc.setActivity).toHaveBeenLastCalledWith({
      type: 0,
      details: 'Using BeforeBedtime Launcher',
      state: 'กำลังเลือก Project',
      timestamps: { start: 1_725_000_999 },
      assets: { large_image: 'bbt', large_text: 'BeforeBedtime' },
      instance: false
    });
  });

  it('stops the RPC client so it clears the active presence', () => {
    const rpc = createRpc();
    const presence = createDiscordPresenceService({ rpc });

    presence.stop();

    expect(rpc.stop).toHaveBeenCalledOnce();
  });
});
