import { NORTHVALE_PROJECT_ID } from '../../shared/types.js';
import { AuthServiceError } from './auth.js';

export function assertProjectAvailable(projectId: string): void {
  if (projectId === NORTHVALE_PROJECT_ID) {
    throw new AuthServiceError('PROJECT_LOCKED', 'Northvale is coming soon. Select SaiNam to play.');
  }
}
