import { createParamDecorator, type ExecutionContext } from '@nestjs/common';
import { type SanitizedEmployeeDto } from '@parisian-shopper/application';

export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): SanitizedEmployeeDto => {
    const request = ctx.switchToHttp().getRequest<{ user: SanitizedEmployeeDto }>();
    return request.user;
  },
);
