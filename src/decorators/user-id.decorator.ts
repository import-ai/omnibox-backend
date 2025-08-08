import {
  createParamDecorator,
  ExecutionContext,
  UnauthorizedException,
} from '@nestjs/common';
import { Request } from 'express';

export const UserId = createParamDecorator(
  (_: unknown, ctx: ExecutionContext): string => {
    const request: Request = ctx.switchToHttp().getRequest();
    const userId = request.user?.id;
    if (!userId) {
      throw new UnauthorizedException('Not authorized');
    }
    return userId;
  },
);
