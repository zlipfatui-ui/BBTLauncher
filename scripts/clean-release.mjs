import { cleanReleaseDirectory, parseReleaseArgs, resolveReleaseDirectory, rootDir } from './release-support.mjs';

const options = parseReleaseArgs();
const releaseDir = resolveReleaseDirectory(rootDir, options.releaseDir);
await cleanReleaseDirectory({ rootDir, releaseDir });
console.log(`Clean release output: ${releaseDir}`);
