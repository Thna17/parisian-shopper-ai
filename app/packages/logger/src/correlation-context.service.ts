import { Injectable } from '@nestjs/common';
import { AsyncLocalStorage } from 'node:async_hooks';

import { type LogContext } from '@parisian-shopper/common';

@Injectable()
export class CorrelationContextService {
  private readonly storage = new AsyncLocalStorage<Readonly<LogContext>>();

  public run<T>(context: Readonly<LogContext>, callback: () => T): T {
    return this.storage.run(Object.freeze({ ...context }), callback);
  }

  public current(): Readonly<LogContext> {
    return this.storage.getStore() ?? Object.freeze({});
  }
}
