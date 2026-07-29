import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { SAINAM_PROJECT_ID } from '../../shared/types.js';
import {
  isModPath,
  isPackAuthorModBypassPath,
  isPackAuthorMode
} from './managed-project-index.js';
import { assertInsideDirectory } from './path-safety.js';

export function shouldBypassExistingProjectSync(rootDir: string, projectId: string): boolean {
  if (projectId !== SAINAM_PROJECT_ID || !isPackAuthorMode(rootDir)) return false;
  const projectDir = assertInsideDirectory(rootDir, join(rootDir, 'projects', projectId));
  return existsSync(projectDir);
}

export function shouldPreserveStaleManagedFile(projectId: string, filePath: string): boolean {
  return projectId === SAINAM_PROJECT_ID && isModPath(filePath);
}

export function shouldBypassPackAuthorManifestFile(
  rootDir: string,
  projectId: string,
  filePath: string
): boolean {
  if (projectId === SAINAM_PROJECT_ID) return false;
  return isPackAuthorModBypassPath(rootDir, filePath);
}
