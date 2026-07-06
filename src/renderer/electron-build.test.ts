import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('Electron production build config', () => {
  it('uses relative asset URLs so file:// can load the renderer bundle', () => {
    const config = readFileSync(resolve(process.cwd(), 'vite.config.ts'), 'utf8');

    expect(config).toMatch(/base:\s*['"]\.\/['"]/);
  });

  it('refreshes the launcher manifest for sync and launch instead of reusing stale cache', () => {
    const mainProcess = readFileSync(resolve(process.cwd(), 'src/main/index.ts'), 'utf8');

    expect(mainProcess).not.toContain('cachedManifest || (await manifestClient.refresh())');
    expect(mainProcess.match(/const manifest = await manifestClient\.refresh\(\);/g)?.length).toBeGreaterThanOrEqual(2);
  });

  it('exposes project state inspection through main and preload IPC', () => {
    const mainProcess = readFileSync(resolve(process.cwd(), 'src/main/index.ts'), 'utf8');
    const preload = readFileSync(resolve(process.cwd(), 'src/preload/index.ts'), 'utf8');

    expect(mainProcess).toContain("ipcMain.handle('project:getState'");
    expect(preload).toContain("ipcRenderer.invoke('project:getState', projectId)");
  });

  it('sets the Windows app icon from the BBT logo asset', () => {
    const mainProcess = readFileSync(resolve(process.cwd(), 'src/main/index.ts'), 'utf8');

    expect(mainProcess).toContain('BBT.ico');
    expect(mainProcess).toMatch(/icon:\s*resolveAppIconPath\(\)/);
  });

  it('defines Windows x64 release packaging with the BBT icon', () => {
    const packageJson = JSON.parse(readFileSync(resolve(process.cwd(), 'package.json'), 'utf8'));

    expect(packageJson.devDependencies['electron-builder']).toBeDefined();
    expect(packageJson.scripts['release:win']).toBe('npm run build && electron-builder --win --x64');
    expect(packageJson.build.appId).toBe('com.beforebedtime.launcher');
    expect(packageJson.build.productName).toBe('BeforeBedtime Launcher');
    expect(packageJson.build.directories.output).toBe('../../BBTLauncher-release');
    expect(packageJson.build.win.icon).toBe('public/assets/images/logos/BBT.ico');
    expect(packageJson.build.win.target).toEqual([
      { target: 'nsis', arch: ['x64'] },
      { target: 'portable', arch: ['x64'] }
    ]);
  });

  it('configures GitHub Releases as the public auto-update feed', () => {
    const packageJson = JSON.parse(readFileSync(resolve(process.cwd(), 'package.json'), 'utf8'));

    expect(packageJson.repository).toEqual({
      type: 'git',
      url: 'https://github.com/zlipfatui-ui/BBTLauncher.git'
    });
    expect(packageJson.dependencies['electron-updater']).toBeDefined();
    expect(packageJson.scripts['publish:win']).toBe('npm run build && electron-builder --win --x64 --publish always');
    expect(packageJson.build.publish).toEqual([
      {
        provider: 'github',
        owner: 'zlipfatui-ui',
        repo: 'BBTLauncher',
        releaseType: 'draft'
      }
    ]);
  });

  it('keeps the Electron binary in devDependencies for electron-builder', () => {
    const packageJson = JSON.parse(readFileSync(resolve(process.cwd(), 'package.json'), 'utf8'));

    expect(packageJson.dependencies.electron).toBeUndefined();
    expect(packageJson.devDependencies.electron).toBeDefined();
  });
});
