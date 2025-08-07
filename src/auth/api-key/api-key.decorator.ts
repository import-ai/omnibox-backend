import {
  createParamDecorator,
  ExecutionContext,
  UnauthorizedException,
} from '@nestjs/common';
import { APIKey as APIKeyEntity } from 'omniboxd/api-key/api-key.entity';

export const APIKey = createParamDecorator(
  (_: unknown, ctx: ExecutionContext): APIKeyEntity => {
    const request = ctx.switchToHttp().getRequest();
    if (!request.apiKey) {
      throw new UnauthorizedException('Not authorized');
    }
    return request.apiKey;
  },
);
