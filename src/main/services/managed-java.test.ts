import { createHash } from 'node:crypto';
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { ensureManagedJava } from './managed-java';

describe('managed Microsoft OpenJDK 17', () => {
  it('reuses an existing verified Java 17 runtime', async () => {
    const rootDir = await mkdtemp(join(tmpdir(), 'bbt-java-existing-'));
    const javaPath = join(rootDir, 'runtimes', 'microsoft-jdk-17-x64', 'bin', 'java.exe');
    await mkdir(join(javaPath, '..'), { recursive: true });
    await writeFile(javaPath, 'java');
    const fetchImpl = vi.fn();
    const extractArchive = vi.fn();

    await expect(
      ensureManagedJava({
        rootDir,
        fetchImpl: fetchImpl as unknown as typeof fetch,
        extractArchive,
        verifyJava: async () => true,
        platform: 'win32',
        arch: 'x64'
      })
    ).resolves.toBe(javaPath);

    expect(fetchImpl).not.toHaveBeenCalled();
    expect(extractArchive).not.toHaveBeenCalled();
  });

  it('downloads, verifies, extracts, and installs a Java 17 archive', async () => {
    const rootDir = await mkdtemp(join(tmpdir(), 'bbt-java-install-'));
    const archive = Buffer.from('fake-openjdk-archive');
    const checksum = createHash('sha256').update(archive).digest('hex');
    const fetchImpl = vi.fn(async (url: string | URL | Request) => {
      if (String(url).endsWith('.sha256sum.txt')) {
        return new Response(`${checksum}  microsoft-jdk-17-windows-x64.zip`, { status: 200 });
      }
      return new Response(archive, {
        status: 200,
        headers: { 'Content-Length': String(archive.byteLength) }
      });
    }) as unknown as typeof fetch;
    const extractArchive = vi.fn(async (_archivePath: string, destination: string) => {
      const bin = join(destination, 'jdk-17.0.test', 'bin');
      await mkdir(bin, { recursive: true });
      await writeFile(join(bin, 'java.exe'), 'java');
    });
    const progress = vi.fn();

    const javaPath = await ensureManagedJava({
      rootDir,
      fetchImpl,
      extractArchive,
      verifyJava: async () => true,
      onProgress: progress,
      platform: 'win32',
      arch: 'x64'
    });

    expect(javaPath).toBe(join(rootDir, 'runtimes', 'microsoft-jdk-17-x64', 'bin', 'java.exe'));
    expect(extractArchive).toHaveBeenCalledOnce();
    expect(progress).toHaveBeenCalledWith(expect.objectContaining({ phase: 'DOWNLOADING_JAVA' }));
  });

  it('rejects a Java archive with a bad SHA-256 checksum', async () => {
    const rootDir = await mkdtemp(join(tmpdir(), 'bbt-java-bad-hash-'));
    const fetchImpl = vi.fn(async (url: string | URL | Request) => {
      if (String(url).endsWith('.sha256sum.txt')) {
        return new Response(`${'0'.repeat(64)}  microsoft-jdk-17-windows-x64.zip`, { status: 200 });
      }
      return new Response(Buffer.from('tampered-archive'), { status: 200 });
    }) as unknown as typeof fetch;
    const extractArchive = vi.fn();

    await expect(
      ensureManagedJava({
        rootDir,
        fetchImpl,
        extractArchive,
        verifyJava: async () => true,
        platform: 'win32',
        arch: 'x64'
      })
    ).rejects.toThrow(/checksum/i);

    expect(extractArchive).not.toHaveBeenCalled();
  });
});
