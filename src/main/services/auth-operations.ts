import { AuthServiceError } from './auth.js';

export interface AuthOperation {
  signal: AbortSignal;
  check(): void;
}

/** Invalidates late auth work and orders credential writes/clears across cancellation. */
export class AuthOperations {
  private revision = 0;
  private active?: AbortController;
  private persistence: Promise<unknown> = Promise.resolve();

  cancel(): void {
    this.revision++;
    this.active?.abort();
    this.active = undefined;
  }

  run<T>(work: (operation: AuthOperation) => Promise<T>): Promise<T> {
    this.cancel();
    const revision = this.revision;
    const controller = new AbortController();
    this.active = controller;
    const cancelled = () => new AuthServiceError('AUTH_CANCELLED', 'Microsoft login was cancelled.');
    const operation: AuthOperation = {
      signal: controller.signal,
      check: () => { if (revision !== this.revision || controller.signal.aborted) throw cancelled(); }
    };
    let onAbort!: () => void;
    const abort = new Promise<never>((_resolve, reject) => {
      onAbort = () => reject(cancelled());
      controller.signal.addEventListener('abort', onAbort, { once: true });
    });
    const pending = Promise.resolve().then(async () => {
      await this.persistence;
      operation.check();
      return work(operation);
    });
    return Promise.race([pending, abort]).finally(() => {
      controller.signal.removeEventListener('abort', onAbort);
      if (this.active === controller) this.active = undefined;
    });
  }

  private enqueue(work: () => Promise<void>): Promise<void> {
    const next = this.persistence.catch(() => undefined).then(work);
    this.persistence = next.catch(() => undefined);
    return next;
  }

  async persist(operation: AuthOperation, work: () => Promise<void>): Promise<void> {
    await this.enqueue(async () => { operation.check(); await work(); });
    operation.check();
  }

  clear(work: () => Promise<void>): Promise<void> {
    return this.enqueue(work);
  }
}
