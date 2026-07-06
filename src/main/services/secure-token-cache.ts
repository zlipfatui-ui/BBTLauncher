import { existsSync } from 'node:fs';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';

export interface SafeStorageLike {
  isEncryptionAvailable(): boolean;
  encryptString(value: string): Buffer;
  decryptString(value: Buffer): string;
}

export function createSafeStorageTokenCache(filePath: string, safeStorage: SafeStorageLike) {
  return {
    beforeCacheAccess: async (cacheContext: { tokenCache: { deserialize: (value: string) => void } }) => {
      if (!existsSync(filePath)) return;
      const encrypted = await readFile(filePath);
      const serialized = safeStorage.isEncryptionAvailable()
        ? safeStorage.decryptString(encrypted)
        : encrypted.toString('utf8');
      cacheContext.tokenCache.deserialize(serialized);
    },
    afterCacheAccess: async (cacheContext: { cacheHasChanged: boolean; tokenCache: { serialize: () => string } }) => {
      if (!cacheContext.cacheHasChanged) return;
      if (!safeStorage.isEncryptionAvailable()) return;
      const serialized = cacheContext.tokenCache.serialize();
      await mkdir(dirname(filePath), { recursive: true });
      const payload = safeStorage.encryptString(serialized);
      await writeFile(filePath, payload);
    }
  };
}

export async function clearSafeTokenCache(filePath: string): Promise<void> {
  await rm(filePath, { force: true });
}

export function createSafeTextStore(filePath: string, safeStorage: SafeStorageLike) {
  return {
    load: async (): Promise<string | null> => {
      if (!existsSync(filePath) || !safeStorage.isEncryptionAvailable()) return null;
      return safeStorage.decryptString(await readFile(filePath));
    },
    save: async (value: string): Promise<void> => {
      if (!safeStorage.isEncryptionAvailable()) return;
      await mkdir(dirname(filePath), { recursive: true });
      await writeFile(filePath, safeStorage.encryptString(value));
    },
    clear: async (): Promise<void> => {
      await rm(filePath, { force: true });
    }
  };
}
