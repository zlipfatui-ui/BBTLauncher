import type { LaunchProgress, ProjectProgressEvent } from '../../shared/types.js';

export function createProjectProgressEvent(
  projectId: string,
  progress: LaunchProgress
): ProjectProgressEvent {
  return {
    projectId,
    ...progress
  };
}
