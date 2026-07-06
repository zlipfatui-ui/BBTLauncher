import { describe, expect, it } from 'vitest';
import { AuthServiceError } from './auth';
import { toIpcResult } from './ipc-result';

describe('renderer-safe IPC results', () => {
  it('returns an auth error without Electron wrapper or stack details', async () => {
    const result = await toIpcResult(async () => {
      throw new AuthServiceError('AUTH_CONFIG_MISSING', 'Microsoft Login is not configured.');
    });

    expect(result).toEqual({
      ok: false,
      error: {
        code: 'AUTH_CONFIG_MISSING',
        message: 'Microsoft Login is not configured.'
      }
    });
    expect(JSON.stringify(result)).not.toContain('stack');
  });

  it('hides unexpected internal error details', async () => {
    const result = await toIpcResult(async () => {
      throw new Error('access_token=secret-value');
    });

    expect(result).toEqual({
      ok: false,
      error: {
        code: 'NETWORK_ERROR',
        message: 'The launcher could not complete the request.'
      }
    });
  });
});
