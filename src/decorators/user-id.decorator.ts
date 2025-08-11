import {
  createParamDecorator,
  ExecutionContext,
  UnauthorizedException,
} from '@nestjs/common';
import { Request } from 'express';

interface UserIdOptions {
  optional?: boolean;
}

export const UserId = createParamDecorator(
  (data: UserIdOptions = {}, ctx: ExecutionContext): string | undefined => {
    const request: Request = ctx.switchToHttp().getRequest();
    const userId = request.user?.id;
    const { optional = false } = data;

    if (!userId && !optional) {
      throw new UnauthorizedException('Not authorized');
    }

    return userId;
  },
);
