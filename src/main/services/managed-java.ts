import { createHash } from 'node:crypto';
import { createReadStream, createWriteStream } from 'node:fs';
import {
  access,
  mkdir,
  mkdtemp,
  readdir,
  rename,
  rm
} from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import type { LaunchProgress } from '../../shared/types.js';

const execFileAsync = promisify(execFile);
const JAVA_URL = 'https://aka.ms/download-jdk/microsoft-jdk-17-windows-x64.zip';
const CHECKSUM_URL = `${JAVA_URL}.sha256sum.txt`;

export interface ManagedJavaOptions {
  rootDir: string;
  fetchImpl?: typeof fetch;
  extractArchive?: (archivePath: string, destination: string) => Promise<void>;
  verifyJava?: (javaPath: string) => Promise<boolean>;
  onProgress?: (progress: LaunchProgress) => void;
  platform?: NodeJS.Platform;
  arch?: string;
}

async function exists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

async function sha256FileStreaming(path: string): Promise<string> {
  const hash = createHash('sha256');
  await new Promise<void>((resolve, reject) => {
    const input = createReadStream(path);
    input.on('data', (chunk) => hash.update(chunk));
    input.once('error', reject);
    input.once('end', resolve);
  });
  return hash.digest('hex').toLowerCase();
}

async function defaultExtractArchive(archivePath: string, destination: string): Promise<void> {
  const { default: extract } = await import('extract-zip');
  await extract(archivePath, { dir: destination });
}

async function defaultVerifyJava(javaPath: string): Promise<boolean> {
  try {
    const { stderr, stdout } = await execFileAsync(javaPath, ['-version']);
    const match = `${stderr}\n${stdout}`.match(/version "(?:(\d+)\.)?(\d+)/);
    if (!match) return false;
    const major = match[1] === '1' ? Number(match[2]) : Number(match[1] || match[2]);
    return major === 17;
  } catch {
    return false;
  }
}

async function findJavaExecutable(root: string): Promise<string | null> {
  const entries = await readdir(root, { withFileTypes: true });
  for (const entry of entries) {
    const path = join(root, entry.name);
    if (entry.isFile() && entry.name.toLowerCase() === 'java.exe' && dirname(path).toLowerCase().endsWith(`${join('', 'bin').toLowerCase()}`)) {
      return path;
    }
    if (entry.isDirectory()) {
      const nested = await findJavaExecutable(path);
      if (nested) return nested;
    }
  }
  return null;
}

async function downloadArchive(
  fetchImpl: typeof fetch,
  destination: string,
  onProgress?: (progress: LaunchProgress) => void
): Promise<void> {
  const response = await fetchImpl(JAVA_URL);
  if (!response.ok || !response.body) {
    throw new Error(`Java download failed with HTTP ${response.status}.`);
  }

  const totalBytes = Number(response.headers.get('content-length') || 0);
  let downloadedBytes = 0;
  const input = Readable.fromWeb(response.body as never);
  input.on('data', (chunk: Buffer) => {
    downloadedBytes += chunk.byteLength;
    onProgress?.({
      phase: 'DOWNLOADING_JAVA',
      percent: totalBytes ? Math.min(100, Math.round((downloadedBytes / totalBytes) * 100)) : undefined,
      message: 'Downloading Java 17'
    });
  });
  await pipeline(input, createWriteStream(destination));
}

export async function ensureManagedJava(options: ManagedJavaOptions): Promise<string> {
  const {
    rootDir,
    fetchImpl = fetch,
    extractArchive = defaultExtractArchive,
    verifyJava = defaultVerifyJava,
    onProgress,
    platform = process.platform,
    arch = process.arch
  } = options;

  if (platform !== 'win32' || arch !== 'x64') {
    throw new Error('This launcher build supports managed Java only on Windows x64.');
  }

  const runtimeDir = join(rootDir, 'runtimes', 'microsoft-jdk-17-x64');
  const installedJava = join(runtimeDir, 'bin', 'java.exe');
  if (await exists(installedJava)) {
    if (await verifyJava(installedJava)) return installedJava;
    await rm(runtimeDir, { recursive: true, force: true });
  }

  const checksumResponse = await fetchImpl(CHECKSUM_URL);
  if (!checksumResponse.ok) {
    throw new Error(`Java checksum download failed with HTTP ${checksumResponse.status}.`);
  }
  const checksumMatch = (await checksumResponse.text()).match(/\b([a-fA-F0-9]{64})\b/);
  if (!checksumMatch) throw new Error('Java checksum response did not contain a SHA-256 hash.');
  const expectedChecksum = checksumMatch[1].toLowerCase();

  const tempParent = join(rootDir, 'tmp');
  await mkdir(tempParent, { recursive: true });
  const workDir = await mkdtemp(join(tempParent, 'java-'));
  const archivePath = join(workDir, 'microsoft-jdk-17.zip');
  const extractDir = join(workDir, 'extract');

  try {
    await downloadArchive(fetchImpl, archivePath, onProgress);
    const actualChecksum = await sha256FileStreaming(archivePath);
    if (actualChecksum !== expectedChecksum) {
      throw new Error('Java archive checksum verification failed.');
    }

    await mkdir(extractDir, { recursive: true });
    await extractArchive(archivePath, extractDir);
    const extractedJava = await findJavaExecutable(extractDir);
    if (!extractedJava) throw new Error('Java archive did not contain bin/java.exe.');
    if (!(await verifyJava(extractedJava))) {
      throw new Error('Downloaded runtime is not Microsoft OpenJDK 17.');
    }

    const extractedRoot = dirname(dirname(extractedJava));
    await mkdir(dirname(runtimeDir), { recursive: true });
    await rm(runtimeDir, { recursive: true, force: true });
    await rename(extractedRoot, runtimeDir);
    if (!(await verifyJava(installedJava))) {
      throw new Error('Installed Java runtime failed verification.');
    }
    return installedJava;
  } finally {
    await rm(workDir, { recursive: true, force: true });
  }
}
