import {
  applyDecorators,
  createParamDecorator,
  ExecutionContext,
  SetMetadata,
} from '@nestjs/common';
import { Request } from 'express';

export const VALIDATE_SHARE_KEY = 'validate-share';

export interface ValidateShareOptions {
  requireChat?: boolean;
  /** Rejects chat-only shares, which expose no resources to visitors. */
  requireResources?: boolean;
  /**
   * Network-isolated internal endpoints. The share is trusted only when the
   * request carries a valid share-access token (`x-share-access`), minted by
   * the backend after the visitor passed the share's checks; otherwise it is
   * validated as the user in `x-user-id` (if any), so password-protected
   * shares are refused.
   */
  trustedInternal?: boolean;
}

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
export function ValidateShare(options: ValidateShareOptions = {}) {
  return applyDecorators(SetMetadata(VALIDATE_SHARE_KEY, options));
}
