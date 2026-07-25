import { randomUUID } from 'node:crypto';
import { connect } from 'node:net';

export interface DiscordActivity {
  type: 0;
  details: string;
  state: string;
  timestamps: { start: number };
  assets: {
    large_image: 'bbt';
    large_text: 'BeforeBedtime';
  };
  instance: false;
}

export interface RpcSocket {
  on(event: 'connect', listener: () => void): this;
  on(event: 'data', listener: (data: Buffer) => void): this;
  on(event: 'error', listener: () => void): this;
  on(event: 'close', listener: () => void): this;
  write(data: Uint8Array): boolean;
  end(data?: Uint8Array): void;
  destroy(): void;
}

export interface DiscordRpcClient {
  start(): void;
  setActivity(activity: DiscordActivity | null): void;
  stop(): void;
}

interface DiscordRpcOptions {
  applicationId: string;
  pid?: number;
  retryDelayMs?: number;
  connectPipe?: (path: string) => RpcSocket;
}

const HANDSHAKE = 0;
const FRAME = 1;
const PING = 3;
const PONG = 4;
const PIPE_COUNT = 10;
const DEFAULT_RETRY_DELAY_MS = 15_000;

function encodeFrame(opcode: number, payload: unknown): Uint8Array {
  const body = Buffer.from(JSON.stringify(payload), 'utf8');
  const frame = Buffer.allocUnsafe(8 + body.length);
  frame.writeUInt32LE(opcode, 0);
  frame.writeUInt32LE(body.length, 4);
  body.copy(frame, 8);
  return frame;
}

export function createDiscordRpcClient(options: DiscordRpcOptions): DiscordRpcClient {
  const connectPipe = options.connectPipe ?? ((path: string) => connect(path) as unknown as RpcSocket);
  const pid = options.pid ?? process.pid;
  const retryDelayMs = options.retryDelayMs ?? DEFAULT_RETRY_DELAY_MS;
  let socket: RpcSocket | null = null;
  let readySocket: RpcSocket | null = null;
  let retryTimer: ReturnType<typeof setTimeout> | null = null;
  let bufferedData = Buffer.alloc(0);
  let desiredActivity: DiscordActivity | null = null;
  let stopped = true;

  const safely = (action: () => void): void => {
    try {
      action();
    } catch {
      // Discord can disappear between a socket state check and a write.
    }
  };

  const writeFrame = (target: RpcSocket, opcode: number, payload: unknown): void => {
    safely(() => target.write(encodeFrame(opcode, payload)));
  };

  const sendActivity = (target: RpcSocket, activity: DiscordActivity | null): void => {
    writeFrame(target, FRAME, {
      cmd: 'SET_ACTIVITY',
      args: { pid, activity },
      nonce: randomUUID()
    });
  };

  const scheduleRetry = (): void => {
    if (stopped || retryTimer) return;
    retryTimer = setTimeout(() => {
      retryTimer = null;
      openPipe(0);
    }, retryDelayMs);
  };

  const failPipe = (failedSocket: RpcSocket, pipeIndex: number): void => {
    if (socket !== failedSocket) return;
    socket = null;
    readySocket = null;
    bufferedData = Buffer.alloc(0);
    if (stopped) return;
    if (pipeIndex + 1 < PIPE_COUNT) openPipe(pipeIndex + 1);
    else scheduleRetry();
  };

  const handleFrame = (target: RpcSocket, pipeIndex: number, opcode: number, payload: Buffer): boolean => {
    if (socket !== target || stopped) return false;
    if (opcode === PING) {
      try {
        writeFrame(target, PONG, JSON.parse(payload.toString('utf8')));
      } catch {
        failPipe(target, pipeIndex);
        return false;
      }
      return true;
    }
    if (opcode !== FRAME) return true;

    let parsedMessage: unknown;
    try {
      parsedMessage = JSON.parse(payload.toString('utf8'));
    } catch {
      failPipe(target, pipeIndex);
      return false;
    }
    if (typeof parsedMessage !== 'object' || parsedMessage === null || Array.isArray(parsedMessage)) {
      failPipe(target, pipeIndex);
      return false;
    }
    const message = parsedMessage as { evt?: unknown };
    if (message.evt === 'READY') {
      readySocket = target;
      if (desiredActivity) sendActivity(target, desiredActivity);
    }
    return true;
  };

  const handleData = (target: RpcSocket, pipeIndex: number, data: Buffer): void => {
    if (socket !== target || stopped) return;
    bufferedData = Buffer.concat([bufferedData, data]);
    while (bufferedData.length >= 8) {
      const opcode = bufferedData.readUInt32LE(0);
      const payloadLength = bufferedData.readUInt32LE(4);
      if (bufferedData.length < 8 + payloadLength) return;
      const payload = bufferedData.subarray(8, 8 + payloadLength);
      bufferedData = bufferedData.subarray(8 + payloadLength);
      if (!handleFrame(target, pipeIndex, opcode, payload)) return;
    }
  };

  const openPipe = (pipeIndex: number): void => {
    if (stopped) return;
    let candidate: RpcSocket;
    try {
      candidate = connectPipe(`\\\\?\\pipe\\discord-ipc-${pipeIndex}`);
    } catch {
      if (pipeIndex + 1 < PIPE_COUNT) openPipe(pipeIndex + 1);
      else scheduleRetry();
      return;
    }

    socket = candidate;
    readySocket = null;
    bufferedData = Buffer.alloc(0);
    candidate.on('connect', () => {
      if (socket !== candidate || stopped) return;
      writeFrame(candidate, HANDSHAKE, { v: 1, client_id: options.applicationId });
    });
    candidate.on('data', (data) => handleData(candidate, pipeIndex, data));
    candidate.on('error', () => failPipe(candidate, pipeIndex));
    candidate.on('close', () => failPipe(candidate, pipeIndex));
  };

  return {
    start(): void {
      if (!stopped) return;
      stopped = false;
      openPipe(0);
    },
    setActivity(activity: DiscordActivity | null): void {
      desiredActivity = activity;
      if (socket && readySocket === socket && !stopped) sendActivity(socket, activity);
    },
    stop(): void {
      const activeSocket = socket;
      if (activeSocket && readySocket === activeSocket) sendActivity(activeSocket, null);
      stopped = true;
      if (retryTimer) clearTimeout(retryTimer);
      retryTimer = null;
      desiredActivity = null;
      socket = null;
      readySocket = null;
      bufferedData = Buffer.alloc(0);
      if (!activeSocket) return;
      safely(() => activeSocket.end());
      safely(() => activeSocket.destroy());
    }
  };
}
