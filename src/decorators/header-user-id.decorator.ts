import {
  createParamDecorator,
  ExecutionContext,
  HttpStatus,
} from '@nestjs/common';
import { AppException } from 'omniboxd/common/exceptions/app.exception';
import { Request } from 'express';

interface UserIdOptions {
  key?: string;
  optional?: boolean;
}

export const HeaderUserId = createParamDecorator(
  (data: UserIdOptions = {}, ctx: ExecutionContext): string | undefined => {
    const request: Request = ctx.switchToHttp().getRequest();
    const { key = 'x-user-id', optional = false } = data;

    const rawUserId = request.headers[key];

    let userId: string | undefined;
    if (typeof rawUserId === 'string') {
      userId = rawUserId;
    } else if (Array.isArray(rawUserId)) {
      userId = rawUserId[0];
    }

    if (!userId && !optional) {
      // Note: Decorators cannot easily inject I18nService, using static message
      throw new AppException(
        'Not authorized',
        'NOT_AUTHORIZED',
        HttpStatus.UNAUTHORIZED,
      );
    }

    return userId;
  },
);
