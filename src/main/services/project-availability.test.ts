import { afterEach, describe, expect, it } from 'vitest';
import type { LauncherManifest } from '../../shared/types';
import { assertProjectAvailable, resetProjectAvailability, updateProjectAvailability } from './project-availability';

function manifest(projects: Array<{ id: string; visibility?: 'locked'; lockedMessage?: string }>): LauncherManifest {
  return {
    schemaVersion: 1,
    generatedAt: 'now',
    projects: projects.map((p) => ({
      ...p,
      title: p.id,
      statusText: 'UP TO DATE',
      minecraft: { version: '1.20.1', loader: 'forge', loaderVersion: '47.4.20', javaMajor: 17 },
      artwork: { cover: '', gallery: [] },
      files: []
    }))
  };
}

describe('project availability', () => {
  afterEach(() => resetProjectAvailability());

  it('locks Northvale before any manifest arrives', () => {
    expect(() => assertProjectAvailable('northvale')).toThrow(/coming soon/);
    expect(() => assertProjectAvailable('sainam')).not.toThrow();
  });

  it('follows dashboard visibility once a manifest is loaded', () => {
    updateProjectAvailability(manifest([{ id: 'northvale' }, { id: 'season-2', visibility: 'locked', lockedMessage: 'เร็ว ๆ นี้' }]));
    expect(() => assertProjectAvailable('northvale')).not.toThrow();
    expect(() => assertProjectAvailable('season-2')).toThrow('เร็ว ๆ นี้');
    expect(() => assertProjectAvailable('sainam')).toThrow(/ยังไม่เปิด/);
  });
});
