import { describe, expect, it, vi } from 'vitest';
import { createDiscordRpcClient, type RpcSocket } from './discord-rpc';

class TestSocket implements RpcSocket {
  readonly writes: Uint8Array[] = [];
  readonly end = vi.fn<(data?: Uint8Array) => void>();
  readonly destroy = vi.fn<() => void>();
  private readonly listeners = new Map<string, Array<(data?: Buffer) => void>>();

  on(event: 'connect' | 'data' | 'error' | 'close', listener: (() => void) | ((data: Buffer) => void)): this {
    const current = this.listeners.get(event) ?? [];
    current.push(listener as (data?: Buffer) => void);
    this.listeners.set(event, current);
    return this;
  }

  write(data: Uint8Array): boolean {
    this.writes.push(data);
    return true;
  }

  emit(event: 'connect' | 'error' | 'close'): void;
  emit(event: 'data', data: Buffer): void;
  emit(event: 'connect' | 'data' | 'error' | 'close', data?: Buffer): void {
    for (const listener of this.listeners.get(event) ?? []) {
      listener(data);
    }
  }
}

function frame(opcode: number, payload: unknown): Buffer {
  const body = Buffer.from(JSON.stringify(payload), 'utf8');
  const header = Buffer.alloc(8);
  header.writeUInt32LE(opcode, 0);
  header.writeUInt32LE(body.length, 4);
  return Buffer.concat([header, body]);
}

function rawFrame(opcode: number, payload: string): Buffer {
  const body = Buffer.from(payload, 'utf8');
  const header = Buffer.alloc(8);
  header.writeUInt32LE(opcode, 0);
  header.writeUInt32LE(body.length, 4);
  return Buffer.concat([header, body]);
}

function readFrame(data: Uint8Array): { opcode: number; payload: unknown } {
  const buffer = Buffer.from(data);
  return {
    opcode: buffer.readUInt32LE(0),
    payload: JSON.parse(buffer.subarray(8).toString('utf8'))
  };
}

function ready(socket: TestSocket): void {
  socket.emit('connect');
  socket.emit('data', frame(1, { evt: 'READY' }));
}

describe('Discord RPC transport framing', () => {
  it('encodes SET_ACTIVITY frames with little-endian opcode and payload length', () => {
    const socket = new TestSocket();
    const client = createDiscordRpcClient({
      applicationId: 'application-id',
      pid: 42,
      connectPipe: () => socket
    });

    client.start();
    ready(socket);
    client.setActivity({
      type: 0,
      details: 'Playing',
      state: 'In a world',
      timestamps: { start: 123 },
      assets: { large_image: 'bbt', large_text: 'BeforeBedtime' },
      instance: false
    });

    const encoded = Buffer.from(socket.writes.at(-1)!);
    expect(encoded.readUInt32LE(0)).toBe(1);
    expect(encoded.readUInt32LE(4)).toBe(encoded.length - 8);
    expect(readFrame(encoded).payload).toMatchObject({
      cmd: 'SET_ACTIVITY',
      args: { pid: 42, activity: { timestamps: { start: 123 } } }
    });
  });

  it('parses a READY frame split across data events before sending desired activity', () => {
    const socket = new TestSocket();
    const client = createDiscordRpcClient({ applicationId: 'application-id', connectPipe: () => socket });
    const activity = {
      type: 0 as const,
      details: 'Playing',
      state: 'In a world',
      timestamps: { start: 123 },
      assets: { large_image: 'bbt' as const, large_text: 'BeforeBedtime' as const },
      instance: false as const
    };

    client.start();
    socket.emit('connect');
    client.setActivity(activity);
    const readyFrame = frame(1, { evt: 'READY' });
    socket.emit('data', readyFrame.subarray(0, 5));
    expect(socket.writes).toHaveLength(1);
    socket.emit('data', readyFrame.subarray(5));

    expect(readFrame(socket.writes.at(-1)!).payload).toMatchObject({ args: { activity } });
  });

  it('parses multiple frames delivered in one data event', () => {
    const socket = new TestSocket();
    const client = createDiscordRpcClient({ applicationId: 'application-id', connectPipe: () => socket });

    client.start();
    socket.emit('connect');
    socket.emit('data', Buffer.concat([
      frame(3, { heartbeat: 1 }),
      frame(1, { evt: 'READY' })
    ]));

    expect(socket.writes.map(readFrame).map(({ opcode }) => opcode)).toEqual([0, 4]);
  });

  it('replies to every Discord PING with a PONG carrying the original payload', () => {
    const socket = new TestSocket();
    const client = createDiscordRpcClient({ applicationId: 'application-id', connectPipe: () => socket });

    client.start();
    socket.emit('connect');
    socket.emit('data', frame(3, { heartbeat: 'keepalive' }));

    expect(readFrame(socket.writes.at(-1)!)).toEqual({ opcode: 4, payload: { heartbeat: 'keepalive' } });
  });

  it('discards a connection when a PING payload is malformed JSON', () => {
    const sockets: TestSocket[] = [];
    const client = createDiscordRpcClient({
      applicationId: 'application-id',
      connectPipe: () => {
        const socket = new TestSocket();
        sockets.push(socket);
        return socket;
      }
    });

    client.start();

    expect(() => sockets[0].emit('data', rawFrame(3, '{not-json'))).not.toThrow();
    expect(sockets).toHaveLength(2);
  });

  it('discards a connection when a FRAME payload is malformed JSON', () => {
    const sockets: TestSocket[] = [];
    const client = createDiscordRpcClient({
      applicationId: 'application-id',
      connectPipe: () => {
        const socket = new TestSocket();
        sockets.push(socket);
        return socket;
      }
    });

    client.start();

    expect(() => sockets[0].emit('data', rawFrame(1, '{not-json'))).not.toThrow();
    expect(sockets).toHaveLength(2);
  });

  it('discards a connection when a FRAME payload is JSON null', () => {
    const sockets: TestSocket[] = [];
    const client = createDiscordRpcClient({
      applicationId: 'application-id',
      connectPipe: () => {
        const socket = new TestSocket();
        sockets.push(socket);
        return socket;
      }
    });

    client.start();

    expect(() => sockets[0].emit('data', rawFrame(1, 'null'))).not.toThrow();
    expect(sockets).toHaveLength(2);
  });
});

describe('Discord RPC pipe lifecycle', () => {
  it('tries each Windows Discord pipe in order after connection failures', () => {
    const sockets: TestSocket[] = [];
    const paths: string[] = [];
    const client = createDiscordRpcClient({
      applicationId: 'application-id',
      connectPipe: (path) => {
        paths.push(path);
        const socket = new TestSocket();
        sockets.push(socket);
        return socket;
      }
    });

    client.start();
    for (const socket of sockets) socket.emit('error');

    expect(paths).toEqual([
      String.raw`\\?\pipe\discord-ipc-0`,
      String.raw`\\?\pipe\discord-ipc-1`,
      String.raw`\\?\pipe\discord-ipc-2`,
      String.raw`\\?\pipe\discord-ipc-3`,
      String.raw`\\?\pipe\discord-ipc-4`,
      String.raw`\\?\pipe\discord-ipc-5`,
      String.raw`\\?\pipe\discord-ipc-6`,
      String.raw`\\?\pipe\discord-ipc-7`,
      String.raw`\\?\pipe\discord-ipc-8`,
      String.raw`\\?\pipe\discord-ipc-9`
    ]);
  });

  it('retries the pipe scan after 15 seconds when every Discord pipe fails', () => {
    vi.useFakeTimers();
    try {
      const sockets: TestSocket[] = [];
      const connectPipe = vi.fn(() => {
        const socket = new TestSocket();
        sockets.push(socket);
        return socket;
      });
      const client = createDiscordRpcClient({ applicationId: 'application-id', connectPipe });

      client.start();
      for (const socket of sockets) socket.emit('error');
      expect(connectPipe).toHaveBeenCalledTimes(10);
      vi.advanceTimersByTime(14_999);
      expect(connectPipe).toHaveBeenCalledTimes(10);
      vi.advanceTimersByTime(1);

      expect(connectPipe).toHaveBeenCalledTimes(11);
    } finally {
      vi.useRealTimers();
    }
  });

  it('cancels a pending retry when stopped', () => {
    vi.useFakeTimers();
    try {
      const sockets: TestSocket[] = [];
      const connectPipe = vi.fn(() => {
        const socket = new TestSocket();
        sockets.push(socket);
        return socket;
      });
      const client = createDiscordRpcClient({ applicationId: 'application-id', connectPipe });

      client.start();
      for (const socket of sockets) socket.emit('error');
      client.stop();
      vi.advanceTimersByTime(15_000);

      expect(connectPipe).toHaveBeenCalledTimes(10);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('Discord RPC session lifecycle', () => {
  const activity = {
    type: 0 as const,
    details: 'Playing',
    state: 'In a world',
    timestamps: { start: 123 },
    assets: { large_image: 'bbt' as const, large_text: 'BeforeBedtime' as const },
    instance: false as const
  };

  it('sends a version 1 handshake with the configured Application ID', () => {
    const socket = new TestSocket();
    const client = createDiscordRpcClient({ applicationId: 'configured-id', connectPipe: () => socket });

    client.start();
    socket.emit('connect');

    expect(readFrame(socket.writes[0])).toEqual({
      opcode: 0,
      payload: { v: 1, client_id: 'configured-id' }
    });
  });

  it('resends the unchanged desired activity after READY on a reconnect', () => {
    const sockets: TestSocket[] = [];
    const client = createDiscordRpcClient({
      applicationId: 'application-id',
      connectPipe: () => {
        const socket = new TestSocket();
        sockets.push(socket);
        return socket;
      }
    });

    client.start();
    client.setActivity(activity);
    ready(sockets[0]);
    sockets[0].emit('close');
    ready(sockets[1]);

    expect(readFrame(sockets[1].writes.at(-1)!).payload).toMatchObject({
      args: { activity: { timestamps: { start: 123 } } }
    });
  });

  it('ignores frames from a stale socket after reconnecting', () => {
    const sockets: TestSocket[] = [];
    const client = createDiscordRpcClient({
      applicationId: 'application-id',
      connectPipe: () => {
        const socket = new TestSocket();
        sockets.push(socket);
        return socket;
      }
    });

    client.start();
    sockets[0].emit('close');
    sockets[0].emit('data', frame(3, { old: true }));

    expect(sockets[0].writes).toHaveLength(0);
  });

  it('clears Discord activity before disconnecting during stop', () => {
    const socket = new TestSocket();
    const client = createDiscordRpcClient({ applicationId: 'application-id', connectPipe: () => socket });

    client.start();
    ready(socket);
    client.setActivity(activity);
    client.stop();

    expect(readFrame(socket.writes.at(-1)!).payload).toMatchObject({
      cmd: 'SET_ACTIVITY',
      args: { activity: null }
    });
    expect(socket.end).toHaveBeenCalledOnce();
    expect(socket.destroy).toHaveBeenCalledOnce();
  });

  it('uses a UUID nonce for SET_ACTIVITY', () => {
    const socket = new TestSocket();
    const client = createDiscordRpcClient({ applicationId: 'application-id', connectPipe: () => socket });

    client.start();
    ready(socket);
    client.setActivity(activity);

    expect(readFrame(socket.writes.at(-1)!).payload).toMatchObject({
      nonce: expect.stringMatching(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i)
    });
  });

  it('silently ignores a socket write failure', () => {
    const socket = new TestSocket();
    vi.spyOn(socket, 'write').mockImplementation(() => {
      throw new Error('socket closed');
    });
    const client = createDiscordRpcClient({ applicationId: 'application-id', connectPipe: () => socket });

    expect(() => {
      client.start();
      ready(socket);
      client.setActivity(activity);
    }).not.toThrow();
  });
});
