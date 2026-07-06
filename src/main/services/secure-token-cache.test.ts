import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { createSafeStorageTokenCache, createSafeTextStore } from './secure-token-cache';

describe('safe MSAL token cache', () => {
  it('does not write a plaintext cache when encryption is unavailable', async () => {
    const root = await mkdtemp(join(tmpdir(), 'bbt-token-cache-'));
    const cachePath = join(root, 'msal-cache.bin');
    const plugin = createSafeStorageTokenCache(cachePath, {
      isEncryptionAvailable: () => false,
      encryptString: () => Buffer.from('encrypted'),
      decryptString: () => ''
    });

    await plugin.afterCacheAccess({
      cacheHasChanged: true,
      tokenCache: { serialize: () => 'refresh-token-secret' }
    });

    await expect(readFile(cachePath)).rejects.toMatchObject({ code: 'ENOENT' });
  });
});

describe('safe text store', () => {
  it('round-trips encrypted text values', async () => {
    const root = await mkdtemp(join(tmpdir(), 'bbt-safe-text-'));
    const file = join(root, 'refresh.bin');
    const store = createSafeTextStore(file, {
      isEncryptionAvailable: () => true,
      encryptString: (value: string) => Buffer.from(`encrypted:${value}`, 'utf8'),
      decryptString: (value: Buffer) => value.toString('utf8').replace(/^encrypted:/, '')
    });

    await store.save('legacy-refresh-token');

    await expect(store.load()).resolves.toBe('legacy-refresh-token');
    expect(await readFile(file, 'utf8')).toBe('encrypted:legacy-refresh-token');
  });

  it('does not write plaintext when encryption is unavailable', async () => {
    const root = await mkdtemp(join(tmpdir(), 'bbt-safe-text-'));
    const file = join(root, 'refresh.bin');
    const store = createSafeTextStore(file, {
      isEncryptionAvailable: () => false,
      encryptString: (value: string) => Buffer.from(value, 'utf8'),
      decryptString: (value: Buffer) => value.toString('utf8')
    });

    await store.save('legacy-refresh-token');

    await expect(store.load()).resolves.toBeNull();
    await expect(readFile(file, 'utf8')).rejects.toMatchObject({ code: 'ENOENT' });
  });
});
