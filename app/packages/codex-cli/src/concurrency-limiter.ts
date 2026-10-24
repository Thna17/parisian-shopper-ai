import { CodexCliCancelledError } from './codex-cli-errors.js';

export class ConcurrencyLimiter {
  private activeCount = 0;
  private readonly queue: Array<() => void> = [];

  public constructor(public readonly maxConcurrency: number = 1) {
    if (maxConcurrency < 1) {
      throw new Error(`maxConcurrency must be at least 1, received ${maxConcurrency}`);
    }
  }

  public async acquire(signal?: AbortSignal): Promise<() => void> {
    if (signal?.aborted) {
      throw new CodexCliCancelledError('Execution cancelled before acquisition', signal.reason);
    }

    if (this.activeCount < this.maxConcurrency) {
      this.activeCount++;
      let released = false;
      return () => {
        if (!released) {
          released = true;
          this.release();
        }
      };
    }

    return new Promise<() => void>((resolve, reject) => {
      let released = false;

      const onAbort = (): void => {
        const index = this.queue.indexOf(tryAcquire);
        if (index !== -1) {
          this.queue.splice(index, 1);
        }
        reject(
          new CodexCliCancelledError(
            'Execution cancelled while waiting for concurrency slot',
            signal?.reason,
          ),
        );
      };

      const tryAcquire = (): void => {
        if (signal?.aborted) {
          onAbort();
          return;
        }
        signal?.removeEventListener('abort', onAbort);
        this.activeCount++;
        resolve((): void => {
          if (!released) {
            released = true;
            this.release();
          }
        });
      };

      if (signal) {
        signal.addEventListener('abort', onAbort, { once: true });
      }

      this.queue.push(tryAcquire);
    });
  }

  private release(): void {
    this.activeCount--;
    const next = this.queue.shift();
    if (next) {
      next();
    }
  }

  public get pending(): number {
    return this.queue.length;
  }

  public get active(): number {
    return this.activeCount;
  }
}
