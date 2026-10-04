import { NORTHVALE_PROJECT_ID, type LauncherManifest } from '../../shared/types.js';
import { AuthServiceError } from './auth.js';

const defaultLockedMessage = 'โปรเจกต์นี้ยังไม่เปิดให้เล่น';
// Until the first manifest arrives, keep the pre-dashboard rule: Northvale is locked.
let lockedProjects = new Map<string, string>([[NORTHVALE_PROJECT_ID, 'Northvale is coming soon. Select SaiNam to play.']]);
let knownProjects: Set<string> | null = null;

/** Called on every manifest refresh so launch/sync follow the dashboard's visibility settings. */
export function updateProjectAvailability(manifest: LauncherManifest): void {
  knownProjects = new Set(manifest.projects.map((project) => project.id));
  lockedProjects = new Map(
    manifest.projects
      .filter((project) => project.visibility === 'locked')
      .map((project) => [project.id, project.lockedMessage ?? defaultLockedMessage])
  );
}

export function assertProjectAvailable(projectId: string): void {
  const locked = lockedProjects.get(projectId);
  if (locked !== undefined) throw new AuthServiceError('PROJECT_LOCKED', locked);
  if (knownProjects && !knownProjects.has(projectId)) {
    throw new AuthServiceError('PROJECT_LOCKED', defaultLockedMessage);
  }
}

/** Test hook: forget the last manifest. */
export function resetProjectAvailability(): void {
  lockedProjects = new Map([[NORTHVALE_PROJECT_ID, 'Northvale is coming soon. Select SaiNam to play.']]);
  knownProjects = null;
}
