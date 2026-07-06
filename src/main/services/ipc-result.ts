import type { IpcResult } from '../../shared/types.js';
import { AuthServiceError } from './auth.js';

export async function toIpcResult<T>(operation: () => Promise<T>): Promise<IpcResult<T>> {
  try {
    return { ok: true, value: await operation() };
  } catch (error) {
    if (error instanceof AuthServiceError) {
      return {
        ok: false,
        error: {
          code: error.code,
          message: error.message
        }
      };
    }
    return {
      ok: false,
      error: {
        code: 'NETWORK_ERROR',
        message: 'The launcher could not complete the request.'
      }
    };
  }
}
