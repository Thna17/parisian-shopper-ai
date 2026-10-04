import { Injectable, type NestMiddleware } from '@nestjs/common';
import { randomUUID } from 'node:crypto';

import { CorrelationContextService } from './correlation-context.service.js';

interface RequestLike {
  headers: Readonly<Record<string, string | string[] | undefined>>;
}

interface ResponseLike {
  setHeader(name: string, value: string): void;
}

const VALID_REQUEST_ID = /^[A-Za-z0-9._-]{1,128}$/;

@Injectable()
export class CorrelationMiddleware implements NestMiddleware {
  public constructor(private readonly context: CorrelationContextService) {}

  public use(request: RequestLike, response: ResponseLike, next: () => void): void {
    const candidate = request.headers['x-request-id'];
    const supplied = Array.isArray(candidate) ? candidate[0] : candidate;
    const requestId =
      supplied !== undefined && VALID_REQUEST_ID.test(supplied) ? supplied : randomUUID();

    response.setHeader('x-request-id', requestId);
    this.context.run({ requestId }, next);
  }
}
