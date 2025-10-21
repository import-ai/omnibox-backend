import {
  createParamDecorator,
  ExecutionContext,
  HttpStatus,
} from '@nestjs/common';
import { AppException } from 'omniboxd/common/exceptions/app.exception';
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
      // Note: Decorators cannot easily inject I18nService, using static message
      throw new AppException('Not authorized', 'NOT_AUTHORIZED', HttpStatus.UNAUTHORIZED);
    }

    return userId;
  },
);
