import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { cleanReleaseDirectory, parseReleaseArgs, resolveReleaseDirectory, rootDir, validateLocalRelease, verifyGitCommit, verifyPhysicalDependencies, writeReleaseManifest } from './release-support.mjs';

const options = parseReleaseArgs();
const commit = await verifyGitCommit(rootDir, options.commit);
await verifyPhysicalDependencies(rootDir);
const releaseDir = resolveReleaseDirectory(rootDir, options.releaseDir);
const { version } = JSON.parse(await readFile(path.join(rootDir, 'package.json'), 'utf8'));
const npmCli = process.env.npm_execpath;
if (!npmCli) throw new Error('Run this command with npm run release:win -- --commit <full SHA>.');

async function run(args) {
  await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, args, { cwd: rootDir, stdio: 'inherit', windowsHide: true });
    child.on('error', reject);
    child.on('exit', (code) => code === 0 ? resolve() : reject(new Error(`Build step failed with exit code ${code}.`)));
  });
}

console.log(`Building ${version} from ${commit} into ${releaseDir}`);
await cleanReleaseDirectory({ rootDir, releaseDir });
await run([npmCli, 'run', 'build']);
await run([path.join(rootDir, 'node_modules/electron-builder/out/cli/cli.js'), '--win', '--x64', '--publish', 'never', `--config.directories.output=${releaseDir}`]);
await verifyGitCommit(rootDir, commit);
const { assets } = await validateLocalRelease({ releaseDir, version });
await writeReleaseManifest({ releaseDir, version, commit, assets });
console.log(`Built and validated all four ${version} assets; release-manifest.json records the pinned commit and hashes.`);
