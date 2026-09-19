import type { createRuntimeOperations } from './runtime-operations.js';
import type { createProjectScreenshotsService } from './project-screenshots.js';
import { toIpcResult } from './ipc-result.js';

interface ScreenshotIpc {
  handle(channel: string, listener: (event: unknown, projectId: string, ...args: any[]) => Promise<unknown>): void;
}

export function registerProjectScreenshotsIpc(ipc: ScreenshotIpc, {
  operations, loadRuntimeRoot, service
}: {
  operations: ReturnType<typeof createRuntimeOperations>;
  loadRuntimeRoot(): Promise<string>;
  service: ReturnType<typeof createProjectScreenshotsService>;
}): void {
  function handle(channel: string, operation: (root: string, projectId: string, ...args: any[]) => Promise<unknown>, mutates = false) {
    ipc.handle(channel, (_event, projectId, ...args) => toIpcResult(() => (mutates ? operations.run : operations.read)(async () => {
      const root = await loadRuntimeRoot();
      return operation(root, projectId, ...args);
    })));
  }
  handle('project:screenshots:list', (root, id) => service.list(root, id));
  handle('project:screenshots:read', (root, id, path, thumbnail) => service.read(root, id, path, thumbnail === true));
  handle('project:screenshots:openFile', (root, id, path) => service.openFile(root, id, path));
  handle('project:screenshots:revealFile', (root, id, path) => service.revealFile(root, id, path));
  handle('project:screenshots:openFolder', (root, id) => service.openFolder(root, id), true);
}
