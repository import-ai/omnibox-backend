import {
  createParamDecorator,
  ExecutionContext,
  HttpStatus,
} from '@nestjs/common';
import { APIKey as APIKeyEntity } from 'omniboxd/api-key/api-key.entity';
import { AppException } from 'omniboxd/common/exceptions/app.exception';

export const APIKey = createParamDecorator(
  (_: unknown, ctx: ExecutionContext): APIKeyEntity => {
    const request = ctx.switchToHttp().getRequest();
    if (!request.apiKey) {
      // Note: Decorators cannot easily inject I18nService, using static message
      throw new AppException(
        'Not authorized',
        'NOT_AUTHORIZED',
        HttpStatus.UNAUTHORIZED,
      );
    }
    return request.apiKey;
  },
);
