import { createParamDecorator, ExecutionContext } from '@nestjs/common';

export const RequestId = createParamDecorator(
  (_: unknown, ctx: ExecutionContext): string =>
    ctx.switchToHttp().getRequest().headers['x-request-id'] || undefined,
);
