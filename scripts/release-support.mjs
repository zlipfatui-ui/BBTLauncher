import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { createReadStream } from 'node:fs';
import { lstat, readFile, realpath, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { load as loadYaml, JSON_SCHEMA } from 'js-yaml';

const execFileAsync = promisify(execFile);
export const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const manifestName = 'release-manifest.json';
const samePath = (left, right) => process.platform === 'win32' ? left.toLowerCase() === right.toLowerCase() : left === right;

export function resolveReleaseDirectory(projectDir = rootDir, configured = process.env.BBT_RELEASE_DIR) {
  const resolved = configured ? path.resolve(projectDir, configured) : path.resolve(projectDir, '..', '..', 'BBTLauncher-release');
  const relative = path.relative(resolved, path.resolve(projectDir));
  if (path.basename(resolved).toLowerCase() !== 'bbtlauncher-release' || relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative))) {
    throw new Error(`Refusing unexpected release directory: ${resolved}. Use a dedicated BBTLauncher-release directory.`);
  }
  return resolved;
}

export async function cleanReleaseDirectory({ rootDir: projectDir = rootDir, releaseDir = resolveReleaseDirectory(projectDir) } = {}) {
  const intended = resolveReleaseDirectory(projectDir, releaseDir);
  let entry;
  try { entry = await lstat(intended); } catch (error) { if (error.code === 'ENOENT') return; throw error; }
  if (!entry.isDirectory() || entry.isSymbolicLink()) throw new Error(`Refusing to remove non-directory or linked release output: ${intended}`);
  // Check the exact resolved leaf and parent before recursive removal, including junctions.
  const actual = await realpath(intended);
  const parent = await realpath(path.dirname(intended));
  if (!samePath(actual, intended) || !samePath(path.join(parent, path.basename(intended)), intended)) {
    throw new Error(`Refusing redirected release directory: ${intended} resolves to ${actual}`);
  }
  await rm(actual, { recursive: true, force: true });
}

export async function verifyGitCommit(projectDir, commit) {
  if (!/^[a-f0-9]{40}$/.test(commit ?? '')) throw new Error('A full 40-character lowercase commit SHA is required (--commit or BBT_RELEASE_COMMIT).');
  const git = async (...args) => (await execFileAsync('git', args, { cwd: projectDir, encoding: 'utf8' })).stdout.trim();
  const head = await git('rev-parse', '--verify', 'HEAD');
  if (head !== commit) throw new Error(`Requested commit ${commit} does not match checked-out HEAD ${head}.`);
  const dirty = await git('status', '--porcelain', '--untracked-files=no');
  if (dirty) throw new Error('Release requires a clean tracked Git state; commit all changes before building or publishing.');
  return head;
}

export async function verifyPhysicalDependencies(projectDir) {
  const dependencies = path.join(projectDir, 'node_modules');
  const entry = await lstat(dependencies);
  if (!entry.isDirectory() || entry.isSymbolicLink() || !samePath(await realpath(dependencies), dependencies)) {
    throw new Error('Release packaging requires physical node_modules in the project. A junction can make npm omit required transitive dependencies. Build from a physical checkout or physical staging directory.');
  }
}

export async function hashStream(stream) {
  const sha512 = createHash('sha512');
  const sha256 = createHash('sha256');
  let size = 0;
  for await (const chunk of stream) {
    const bytes = Buffer.from(chunk);
    size += bytes.length;
    sha512.update(bytes);
    sha256.update(bytes);
  }
  return { size, sha512: sha512.digest('base64'), sha256: sha256.digest('hex') };
}

export async function validateLocalRelease({ releaseDir, version }) {
  if (!/^\d+\.\d+\.\d+$/.test(version)) throw new Error('Release version must be a stable semantic version.');
  const setupName = `BeforeBedtime-Launcher-Setup-${version}.exe`;
  const names = [setupName, `${setupName}.blockmap`, `BeforeBedtime-Launcher-Portable-${version}.exe`, 'latest.yml'];
  const resolvedDir = await realpath(releaseDir);
  const assets = [];
  for (const name of names) {
    const filePath = path.join(resolvedDir, name);
    const entry = await lstat(filePath);
    if (!entry.isFile() || entry.isSymbolicLink() || entry.size === 0) throw new Error(`Release asset must be a non-empty regular file: ${name}`);
    if (!samePath(await realpath(filePath), filePath)) throw new Error(`Release asset escapes output directory: ${name}`);
    const digest = await hashStream(createReadStream(filePath));
    if (digest.size !== entry.size) throw new Error(`Release asset changed during validation: ${name}`);
    assets.push({ name, filePath, ...digest });
  }
  const metadata = loadYaml(await readFile(path.join(resolvedDir, 'latest.yml'), 'utf8'), { schema: JSON_SCHEMA });
  const setup = assets[0];
  if (!metadata || metadata.version !== version || metadata.path !== setupName || metadata.sha512 !== setup.sha512) {
    throw new Error('latest.yml version, path, or SHA512 does not match the Setup artifact.');
  }
  if (!Array.isArray(metadata.files) || metadata.files.length !== 1) throw new Error('latest.yml must describe exactly one Windows Setup artifact.');
  const file = metadata.files[0];
  if (file.url !== setupName || file.sha512 !== setup.sha512 || file.size !== setup.size) {
    throw new Error('latest.yml file path, size, or SHA512 does not match the Setup artifact.');
  }
  return { version, assets };
}

const manifestAssets = (assets) => assets.map(({ name, size, sha512, sha256 }) => ({ name, size, sha512, sha256 }));

export async function writeReleaseManifest({ releaseDir, version, commit, assets }) {
  const manifest = { version, commit, assets: manifestAssets(assets) };
  await writeFile(path.join(releaseDir, manifestName), `${JSON.stringify(manifest, null, 2)}\n`);
  return manifest;
}

export async function verifyReleaseManifest({ releaseDir, version, commit, assets }) {
  const manifest = JSON.parse(await readFile(path.join(releaseDir, manifestName), 'utf8'));
  if (manifest.version !== version || manifest.commit !== commit || JSON.stringify(manifest.assets) !== JSON.stringify(manifestAssets(assets))) {
    throw new Error('Release manifest does not match the pinned commit or current artifacts; rebuild and repeat QA.');
  }
  return manifest;
}

export function parseReleaseArgs(args = process.argv.slice(2)) {
  const result = { commit: process.env.BBT_RELEASE_COMMIT, releaseDir: process.env.BBT_RELEASE_DIR, validateOnly: false };
  for (let index = 0; index < args.length; index += 1) {
    const flag = args[index];
    if (flag === '--validate-only') result.validateOnly = true;
    else if (flag === '--commit' || flag === '--release-dir') {
      const value = args[++index];
      if (!value || value.startsWith('--')) throw new Error(`Missing value for ${flag}`);
      result[flag === '--commit' ? 'commit' : 'releaseDir'] = value;
    } else throw new Error(`Unknown release option: ${flag}`);
  }
  return result;
}
