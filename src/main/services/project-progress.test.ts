import { describe, expect, it } from 'vitest';
import { createProjectProgressEvent } from './project-progress';

describe('createProjectProgressEvent', () => {
  it('attaches the project id without changing launch progress details', () => {
    expect(createProjectProgressEvent('northvale', {
      phase: 'SYNCING',
      percent: 42,
      message: 'Downloading Northvale files'
    })).toEqual({
      projectId: 'northvale',
      phase: 'SYNCING',
      percent: 42,
      message: 'Downloading Northvale files'
    });
  });
});
