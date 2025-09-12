import {
  createParamDecorator,
  ExecutionContext,
  SetMetadata,
  applyDecorators,
} from '@nestjs/common';
import { Request } from 'express';

export const VALIDATE_SHARE_KEY = 'validate-share';

/**
 * Parameter decorator to inject the validated share into a method parameter
 */
export const ValidatedShare = createParamDecorator(
  (data: unknown, ctx: ExecutionContext) => {
    const request: Request = ctx.switchToHttp().getRequest();
    return (request as any).validatedShare;
  },
);

/**
 * Method decorator to automatically validate share before method execution
 * Extracts shareId from route params, password from cookies, and userId from request
 */
export function ValidateShare() {
  return applyDecorators(SetMetadata(VALIDATE_SHARE_KEY, true));
}
