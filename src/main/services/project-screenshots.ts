import { mkdir, readFile, readdir, realpath, stat } from 'node:fs/promises';
import { extname, isAbsolute, join, relative, resolve } from 'node:path';
import { isProjectId, type ProjectScreenshotListResult, type ProjectScreenshotReadResult } from '../../shared/types.js';
import { AuthServiceError } from './auth.js';

interface ScreenshotImage {
  isEmpty(): boolean;
  getSize(): { width: number; height: number };
  toDataURL(): string;
  resize(options: { width: number; height: number; quality: 'good' }): { toDataURL(): string };
}

interface ScreenshotServiceOptions {
  imageFromBuffer(bytes: Buffer): ScreenshotImage;
  openPath?: (path: string) => Promise<string>;
  showItemInFolder?: (path: string) => void;
}

function unavailable(message: string): AuthServiceError {
  return new AuthServiceError('SCREENSHOT_UNAVAILABLE', message);
}

function contained(parent: string, target: string): boolean {
  const path = relative(parent, target);
  return path !== '' && path !== '..' && !path.startsWith(`..${process.platform === 'win32' ? '\\' : '/'}`) && !isAbsolute(path);
}

function isMissing(error: unknown): boolean {
  return (error as NodeJS.ErrnoException)?.code === 'ENOENT';
}

const imageExtensions = new Set(['.png', '.jpg', '.jpeg', '.webp']);
function validateName(name: string): void {
  if (typeof name !== 'string' || !name || /[\\/:\0]/.test(name) || name === '.' || name === '..' || !imageExtensions.has(extname(name).toLowerCase())) {
    throw unavailable('Choose a PNG, JPEG or WebP file in this project’s screenshots folder.');
  }
}

async function screenshotDirectory(rootDir: string, projectId: string, create = false): Promise<string | null> {
  if (!isProjectId(projectId)) throw unavailable('Unknown screenshot project.');
  const root = resolve(rootDir);
  if (create) await mkdir(root, { recursive: true });
  let parent: string;
  try { parent = await realpath(root); } catch (error) { if (isMissing(error) && !create) return null; throw error; }
  // Resolve every level separately so a project or screenshots junction cannot escape its parent.
  for (const segment of ['projects', projectId, 'screenshots']) {
    const next = join(parent, segment);
    if (create) await mkdir(next, { recursive: false }).catch((error) => {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
    });
    let canonical: string;
    try { canonical = await realpath(next); } catch (error) { if (isMissing(error) && !create) return null; throw error; }
    if (!contained(parent, canonical)) throw unavailable('The screenshots folder points outside this project.');
    if (!(await stat(canonical)).isDirectory()) throw unavailable('The screenshots path is not a folder.');
    parent = canonical;
  }
  return parent;
}

async function screenshotFile(rootDir: string, projectId: string, name: string): Promise<string> {
  validateName(name);
  const directory = await screenshotDirectory(rootDir, projectId);
  if (!directory) throw unavailable('The screenshots folder does not exist yet.');
  const path = await realpath(join(directory, name));
  if (!contained(directory, path) || !(await stat(path)).isFile()) throw unavailable('This screenshot is outside the project folder or is not a file.');
  return path;
}

async function safely<T>(operation: () => Promise<T>): Promise<T> {
  try { return await operation(); } catch (error) {
    if (error instanceof AuthServiceError) throw error;
    throw unavailable(isMissing(error) ? 'This screenshot no longer exists. Refresh the gallery.' : 'The screenshots could not be accessed. Check the game folder and file permissions.');
  }
}

export function createProjectScreenshotsService(options: ScreenshotServiceOptions) {
  async function open(path: string) {
    if (!options.openPath) throw unavailable('Opening screenshot files is not available.');
    const error = await options.openPath(path);
    if (error) throw unavailable(`Could not open screenshots: ${error}`);
  }

  return {
    list(rootDir: string, projectId: string): Promise<ProjectScreenshotListResult> {
      return safely(async () => {
        const directory = await screenshotDirectory(rootDir, projectId);
        if (!directory) return { entries: [], directoryExists: false };
        const entries: ProjectScreenshotListResult['entries'] = [];
        for (const name of await readdir(directory)) {
          if (!imageExtensions.has(extname(name).toLowerCase())) continue;
          try {
            const path = await screenshotFile(rootDir, projectId, name);
            const file = await stat(path);
            entries.push({ relativePath: name, name, size: file.size, modifiedAt: file.mtime.toISOString() });
          } catch (error) {
            if (isMissing(error) || error instanceof AuthServiceError) continue;
            throw error;
          }
        }
        entries.sort((a, b) => b.modifiedAt.localeCompare(a.modifiedAt) || a.name.localeCompare(b.name));
        return { entries, directoryExists: true };
      });
    },
    read(rootDir: string, projectId: string, name: string, thumbnail = false): Promise<ProjectScreenshotReadResult> {
      return safely(async () => {
        const path = await screenshotFile(rootDir, projectId, name);
        const bytes = await readFile(path);
        // Recheck containment after I/O before exposing the bytes to the renderer.
        if (path !== await screenshotFile(rootDir, projectId, name)) throw unavailable('The screenshot changed while being read. Refresh the gallery.');
        const image = options.imageFromBuffer(bytes);
        if (image.isEmpty()) throw unavailable('This screenshot could not be decoded.');
        const { width, height } = image.getSize();
        const scale = Math.min(1, 360 / Math.max(width, height));
        return { dataUrl: thumbnail && scale < 1
          ? image.resize({ width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)), quality: 'good' }).toDataURL()
          : image.toDataURL() };
      });
    },
    openFile(rootDir: string, projectId: string, name: string): Promise<void> {
      return safely(async () => open(await screenshotFile(rootDir, projectId, name)));
    },
    revealFile(rootDir: string, projectId: string, name: string): Promise<void> {
      return safely(async () => {
        const path = await screenshotFile(rootDir, projectId, name);
        if (!options.showItemInFolder) throw unavailable('Revealing screenshot files is not available.');
        options.showItemInFolder(path);
      });
    },
    openFolder(rootDir: string, projectId: string): Promise<void> {
      return safely(async () => open((await screenshotDirectory(rootDir, projectId, true))!));
    }
  };
}
