import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { mkdtempSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { writeLaunchDiagnostics } from './diagnostics';

describe('launch diagnostics', () => {
  it('writes log tail, process info, runtime info, and thread dump when available', async () => {
    const rootDir = mkdtempSync(join(tmpdir(), 'bbt-diagnostics-'));
    const projectDir = join(rootDir, 'projects', 'northvale');
    await mkdir(join(projectDir, 'logs'), { recursive: true });
    await mkdir(join(rootDir, 'minecraft'), { recursive: true });
    await writeFile(join(projectDir, 'logs', 'latest.log'), `${Array.from({ length: 40 }, (_, index) => `line ${index}`).join('\n')}\n`);

    const result = await writeLaunchDiagnostics({
      rootDir,
      projectId: 'northvale',
      pid: 1234,
      runtime: {
        minecraftVersion: '1.20.1',
        loaderVersion: '47.4.20',
        javaPath: 'C:/Java/17/bin/java.exe'
      },
      now: () => new Date('2026-07-06T00:00:00.000Z'),
      collectThreadDump: vi.fn(async () => 'thread dump')
    });

    const diagnostic = await readFile(result.filePath, 'utf8');
    expect(diagnostic).toContain('"pid": 1234');
    expect(diagnostic).toContain('"loaderVersion": "47.4.20"');
    expect(diagnostic).toContain('line 39');
    expect(diagnostic).toContain('thread dump');
  });

  it('stores only the bounded tail of large log files', async () => {
    const rootDir = mkdtempSync(join(tmpdir(), 'bbt-diagnostics-'));
    const projectDir = join(rootDir, 'projects', 'northvale');
    await mkdir(join(projectDir, 'logs'), { recursive: true });
    await writeFile(join(projectDir, 'logs', 'latest.log'), `${'old-start'.padEnd(10_000, 'x')}${'recent-tail'.padStart(90_000, 'y')}`);

    const result = await writeLaunchDiagnostics({
      rootDir,
      projectId: 'northvale',
      runtime: {
        minecraftVersion: '1.20.1',
        loaderVersion: '47.4.20'
      },
      now: () => new Date('2026-07-06T00:00:00.000Z')
    });

    const diagnostic = await readFile(result.filePath, 'utf8');
    expect(diagnostic).not.toContain('old-start');
    expect(diagnostic).toContain('recent-tail');
  });
});
