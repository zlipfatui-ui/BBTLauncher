# Discord Rich Presence Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` or `superpowers:executing-plans` to implement this plan task-by-task with TDD.

**Goal:** Add Discord Rich Presence for the BeforeBedtime launcher and the Northvale Minecraft project.

**Architecture:** The Electron main process communicates directly with Discord Desktop over local RPC/IPC without a third-party package. A separate presence state machine translates the existing project launch lifecycle into launcher and game activities, preserving timestamps across Discord reconnects.

**Tech Stack:** Electron 37, Node.js named pipes and buffers, TypeScript, Vitest

## Global Constraints

- Use Discord Application ID `1497214686238609418`.
- Use Rich Presence asset key `bbt` with hover text `BeforeBedtime`.
- Launcher activity: `Using BeforeBedtime Launcher` / `กำลังเลือก Project`.
- Northvale activity: `กำลังเล่น Northvale` / `Minecraft 1.20.1 • Forge 47.4.20`.
- Launcher and Northvale timers are independent and use Unix seconds.
- Authentication and sync remain launcher activity; switch only when launch state becomes `running`.
- Discord failures must never block or surface errors in launcher startup or game launch.
- Retry Discord connection after all ten Windows IPC pipes fail, using a 15-second interval.
- Do not add OAuth, Join buttons, party data, renderer UI, settings, or external dependencies.

---

### Task 1: Discord IPC transport

**Files:**
- Create: `src/main/services/discord-rpc.ts`
- Create: `src/main/services/discord-rpc.test.ts`

**Interfaces:**

```ts
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

export function createDiscordRpcClient(options: {
  applicationId: string;
  pid?: number;
  retryDelayMs?: number;
  connectPipe?: (path: string) => RpcSocket;
}): DiscordRpcClient;
```

- [ ] Write failing tests for little-endian frame encoding, fragmented frames, multiple frames in one buffer, and PING/PONG.
- [ ] Run the focused tests and confirm they fail because the transport does not exist.
- [ ] Implement frame encoding and buffered frame parsing.
- [ ] Write failing tests for sequential Windows pipe attempts from `\\?\pipe\discord-ipc-0` through `-9`, a 15-second retry after all fail, and retry cancellation on `stop()`.
- [ ] Implement pipe selection and retry lifecycle.
- [ ] Write failing tests for the version 1 handshake using the configured Application ID.
- [ ] Implement handshake and READY handling.
- [ ] Write failing tests proving desired activity is sent only after READY, survives reconnect without timestamp changes, and is cleared during `stop()`.
- [ ] Implement `SET_ACTIVITY` with `process.pid`, `randomUUID()` nonce, silent socket failure handling, stale-socket protection, and PING/PONG.
- [ ] Run `npm test -- --run src/main/services/discord-rpc.test.ts`.
- [ ] Commit with `feat: add Discord RPC transport`.

### Task 2: Presence state machine

**Files:**
- Create: `src/main/services/discord-presence.ts`
- Create: `src/main/services/discord-presence.test.ts`

**Interfaces:**

```ts
export interface DiscordPresenceService {
  start(): void;
  updateLaunchState(state: ProjectLaunchState): void;
  stop(): void;
}

export function createDiscordPresenceService(options: {
  rpc: DiscordRpcClient;
  now?: () => number;
}): DiscordPresenceService;
```

- [ ] Write a failing test that `start()` starts RPC and publishes launcher activity with the current Unix-second timestamp.
- [ ] Implement launcher activity startup.
- [ ] Write failing tests that `starting` and a failed `starting → idle` launch leave launcher activity and its timestamp unchanged.
- [ ] Implement no-op handling for pre-game states.
- [ ] Write a failing test that the first `running` state publishes Northvale activity and resets its timestamp.
- [ ] Implement the `launcher | project` state transition without using `ProjectLaunchState.startedAt`.
- [ ] Write failing tests that repeated `running` and `stopping` preserve the game timestamp.
- [ ] Implement stable project-state handling.
- [ ] Write a failing test that `idle` after a running project returns to launcher activity with a fresh timestamp.
- [ ] Implement the return transition and make `stop()` clear presence through the RPC client.
- [ ] Run `npm test -- --run src/main/services/discord-presence.test.ts`.
- [ ] Commit with `feat: map launcher state to Discord presence`.

### Task 3: Electron lifecycle integration

**Files:**
- Modify: `src/main/product-config.ts`
- Modify: `src/main/index.ts`

**Interfaces:**
- Add `PRODUCT_DISCORD_APPLICATION_ID = '1497214686238609418'`.
- Instantiate one RPC client and one presence service in the Electron main process.

- [ ] Add the product configuration constant.
- [ ] Create the Discord RPC and presence services before `ProjectLaunchManager`.
- [ ] Update the project launch state callback to notify both renderer windows and the presence service.
- [ ] Start presence inside `app.whenReady()` before creating the main window.
- [ ] Stop presence from `app.on('before-quit')`.
- [ ] Run `npm test -- --run src/main/services/discord-rpc.test.ts src/main/services/discord-presence.test.ts src/main/services/project-launch-manager.test.ts`.
- [ ] Run `npm run build`.
- [ ] Commit the integration and this plan with `feat: integrate Discord Rich Presence`.

### Task 4: Portal and manual verification

**Files:**
- Use: `public/assets/images/logos/BBT.png`

- [ ] Verify Discord Application ID `1497214686238609418` exists and is named `BeforeBedtime`.
- [ ] Set the application icon from `public/assets/images/logos/BBT.png`.
- [ ] Upload the same image as Rich Presence asset key `bbt`.
- [ ] With Discord Desktop open, run `npm run dev:electron` and verify launcher presence and elapsed time.
- [ ] Verify auth/sync retains launcher presence, `running` switches to Northvale with a fresh timer, and Minecraft exit returns to launcher with a fresh timer.
- [ ] Restart Discord while the launcher remains open and verify presence returns within 15 seconds without resetting the current phase timestamp.
- [ ] Close the launcher and verify activity clears.
- [ ] Run `npm test`, `npm run build`, and `npm run release:win`.

## Acceptance Criteria

- Application name supplies `Playing BeforeBedtime`; details and state distinguish launcher from Northvale.
- Windows x64 is the required release platform.
- Players do not log into Discord through the launcher; Discord Desktop must be open and activity sharing enabled.
- Presence follows the tracked Minecraft PID lifecycle, uses separate accurate timers, reconnects after Discord starts or restarts, and cannot break launcher/game behavior.
