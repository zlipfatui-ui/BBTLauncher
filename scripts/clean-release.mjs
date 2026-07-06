import { rm } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const releaseDir = path.resolve(rootDir, '..', '..', 'BBTLauncher-release');

if (!releaseDir.toLowerCase().endsWith(`${path.sep}bbtlauncher-release`.toLowerCase())) {
  throw new Error(`Refusing to remove unexpected release directory: ${releaseDir}`);
}

await rm(releaseDir, { recursive: true, force: true });
console.log(`Removed release output: ${releaseDir}`);
