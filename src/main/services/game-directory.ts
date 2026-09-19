import { constants } from 'node:fs';
import { copyFile, lstat, mkdir, readdir, realpath, writeFile, rm } from 'node:fs/promises';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { randomUUID } from 'node:crypto';
import { sha256File } from './hash.js';

const gameDataEntries = ['projects', 'minecraft', 'runtimes', 'metadata', '.bbt-pack-author'];

async function statIfPresent(path: string) {
  try { return await lstat(path); }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw error;
  }
}

function contains(parent: string, child: string) {
  const path = relative(parent, child);
  return path === '' || (!isAbsolute(path) && path !== '..' && !path.startsWith(`..${sep}`));
}

/** Copy, verify, then let settings commit. Originals remain available on failure. */
export async function prepareGameDirectory(previous: string, selected: string): Promise<void> {
  if (!isAbsolute(selected)) throw new Error('Choose an absolute game folder.');
  if (resolve(previous).toLowerCase() === resolve(selected).toLowerCase()) return;
  const oldRoot = await realpath(previous).catch((error: NodeJS.ErrnoException) => {
    if (error.code === 'ENOENT') return resolve(previous);
    throw error;
  });
  if (contains(oldRoot, resolve(selected)) || contains(resolve(selected), oldRoot)) {
    throw new Error('Choose a game folder outside the current folder, not inside it.');
  }
  await mkdir(selected, { recursive: true });
  const newRoot = await realpath(selected);
  if (contains(oldRoot, newRoot) || contains(newRoot, oldRoot)) {
    throw new Error('Choose a game folder outside the current folder, not inside it.');
  }
  const probe = join(newRoot, `.bbt-write-check-${randomUUID()}`);
  await writeFile(probe, '', { flag: 'wx' });
  await rm(probe);

  const pending: Array<{ source: string; destination: string }> = [];
  const directories: string[] = [];
  async function plan(source: string, destination: string): Promise<void> {
    const src = await statIfPresent(source);
    if (!src) return;
    const dst = await statIfPresent(destination);
    if (src.isSymbolicLink() || dst?.isSymbolicLink()) {
      throw new Error('Linked game folders cannot be copied automatically. Choose a regular folder.');
    }
    if (src.isDirectory()) {
      if (dst && !dst.isDirectory()) throw new Error(`Destination contains a different file: ${destination}`);
      directories.push(destination);
      for (const name of await readdir(source)) await plan(join(source, name), join(destination, name));
    } else if (src.isFile()) {
      if (dst) {
        if (!dst.isFile() || src.size !== dst.size || await sha256File(source) !== await sha256File(destination)) {
          throw new Error(`Destination contains a different file: ${destination}. Choose an empty folder.`);
        }
      } else pending.push({ source, destination });
    }
  }
  // Preflight conflicts before copying; never combine two different installations.
  for (const entry of gameDataEntries) await plan(join(oldRoot, entry), join(newRoot, entry));
  for (const directory of directories) await mkdir(directory, { recursive: true });
  for (const { source, destination } of pending) {
    await mkdir(dirname(destination), { recursive: true });
    await copyFile(source, destination, constants.COPYFILE_EXCL);
    if (await sha256File(source) !== await sha256File(destination)) {
      await rm(destination);
      throw new Error('Game file verification failed. The original game folder is still in use.');
    }
  }
}
