import { mkdir, mkdtemp, utimes, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { collectLogFiles, redactLogText, sendLogReport } from './log-report';

const TOKEN = 'minecraft-access-token-value-1234567890';

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'bbt-logs-'));
  const project = join(root, 'projects', 'sainam');
  await mkdir(join(project, 'logs'), { recursive: true });
  await mkdir(join(project, 'crash-reports'), { recursive: true });
  await writeFile(join(project, 'logs', 'latest.log'), `boot --accessToken ${TOKEN}\nC:\\Users\\Alice\\game\n`);
  await writeFile(join(project, 'crash-reports', 'crash-old.txt'), 'old');
  await writeFile(join(project, 'crash-reports', 'crash-new.txt'), 'new');
  await utimes(join(project, 'crash-reports', 'crash-old.txt'), 1, 1);
  return root;
}

describe('log report', () => {
  it('collects the project logs and the newest crash report with secrets removed', async () => {
    const files = await collectLogFiles(await fixture(), 'sainam', [TOKEN]);
    expect(Object.keys(files).sort()).toEqual(['crash-report.txt', 'latest.log']);
    expect(files['crash-report.txt']).toBe('new');
    expect(files['latest.log']).not.toContain(TOKEN);
    expect(files['latest.log']).not.toContain('Alice');
  });

  it('refuses unsafe project ids', async () => {
    expect(await collectLogFiles(await fixture(), '../sainam', [])).toEqual({});
  });

  it('posts the bundle with the Minecraft token as proof of identity', async () => {
    const fetcher = vi.fn(async () => Response.json({ id: 'abc-123' }, { status: 201 }));
    const result = await sendLogReport({
      rootDir: await fixture(), projectId: 'sainam', note: ' เด้ง ', launcherVersion: '0.3.9',
      baseUrl: 'https://bbt.example', accessToken: TOKEN, fetcher: fetcher as unknown as typeof fetch
    });
    expect(result).toEqual({ id: 'abc-123', files: ['latest.log', 'crash-report.txt'] });
    const [url, init] = fetcher.mock.calls[0] as unknown as [URL, RequestInit];
    expect(String(url)).toBe('https://bbt.example/api/launcher/logs');
    expect(new Headers(init.headers).get('Authorization')).toBe(`Bearer ${TOKEN}`);
    const body = JSON.parse(String(init.body));
    expect(body).toMatchObject({ projectId: 'sainam', note: 'เด้ง', launcherVersion: '0.3.9' });
    expect(String(init.body)).not.toContain(`--accessToken ${TOKEN}`);
  });

  it('maps server refusals to player-facing errors', async () => {
    const root = await fixture();
    for (const [status, code] of [[401, 'UNAUTHORIZED'], [429, 'RATE_LIMITED'], [500, 'UPLOAD_FAILED']] as const) {
      const fetcher = vi.fn(async () => new Response('', { status }));
      await expect(sendLogReport({
        rootDir: root, projectId: 'sainam', launcherVersion: '0', baseUrl: 'https://bbt.example', accessToken: TOKEN,
        fetcher: fetcher as unknown as typeof fetch
      })).rejects.toMatchObject({ code });
    }
  });

  it('fails clearly when there is nothing to send', async () => {
    const root = await mkdtemp(join(tmpdir(), 'bbt-empty-'));
    await expect(sendLogReport({ rootDir: root, projectId: 'sainam', launcherVersion: '0', baseUrl: 'https://x', accessToken: TOKEN }))
      .rejects.toMatchObject({ code: 'NO_LOGS' });
  });

  it('redacts JWTs and token fields', () => {
    expect(redactLogText('"refresh_token": "abc" eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.abcdefghijklmnop'))
      .toBe('"refresh_token": "[REDACTED]" [REDACTED_JWT]');
  });
});
