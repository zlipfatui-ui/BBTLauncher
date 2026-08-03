import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { SAINAM_PROJECT_ID } from '../../shared/types.js';
import {
  isModPath,
  isPackAuthorModBypassPath,
  isPackAuthorMode
} from './managed-project-index.js';
import { assertInsideDirectory } from './path-safety.js';

export const SAINAM_RETIRED_MOD_MIGRATION_PATHS = [
  'mods/fancymenu_forge_3.9.3_MC_1.20.1.jar',
  'mods/epic-fight-20.14.17-mc1.20.1-forge.jar',
  'mods/aaa_particles_world-forge-1.20.1-1.0.3.jar',
  'mods/aaa_particles-forge-1.20.1-2.2.0.jar',
  'mods/letsdo-brewery-forge-1.1.9.jar',
  'mods/simplyswords-forge-1.56.0-1.20.1.jar',
  'mods/waystones-forge-1.20.1-14.1.18.jar',
  'mods/waystones-forge-1.20.1-14.1.20.jar'
] as const;

export function shouldBypassExistingProjectSync(rootDir: string, projectId: string): boolean {
  if (projectId !== SAINAM_PROJECT_ID || !isPackAuthorMode(rootDir)) return false;
  const projectDir = assertInsideDirectory(rootDir, join(rootDir, 'projects', projectId));
  if (!existsSync(projectDir)) return false;

  const managedIndex = assertInsideDirectory(
    rootDir,
    join(rootDir, 'metadata', projectId, 'managed-files.json')
  );
  if (existsSync(managedIndex)) return true;

  const modsDir = assertInsideDirectory(projectDir, join(projectDir, 'mods'));
  if (!existsSync(modsDir)) return false;
  return readdirSync(modsDir, { withFileTypes: true }).some((entry) => (
    entry.isFile() && /\.jar(?:\.disabled)?$/i.test(entry.name)
  ));
}

export function shouldTreatRetiredManagedFileAsRepair(
  projectId: string,
  filePath: string
): boolean {
  return projectId === SAINAM_PROJECT_ID && isModPath(filePath);
}

export function retiredSaiNamMigrationPaths(projectId: string): readonly string[] {
  return projectId === SAINAM_PROJECT_ID ? SAINAM_RETIRED_MOD_MIGRATION_PATHS : [];
}

export function shouldBypassPackAuthorManifestFile(
  rootDir: string,
  projectId: string,
  filePath: string
): boolean {
  if (projectId === SAINAM_PROJECT_ID) return false;
  return isPackAuthorModBypassPath(rootDir, filePath);
}
