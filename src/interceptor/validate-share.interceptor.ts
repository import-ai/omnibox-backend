import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  ForbiddenException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Observable } from 'rxjs';
import { Request } from 'express';
import { SharesService } from 'omniboxd/shares/shares.service';
import {
  VALIDATE_SHARE_KEY,
  ValidateShareOptions,
} from 'omniboxd/decorators/validate-share.decorator';
import { ShareType } from 'omniboxd/shares/entities/share.entity';

@Injectable()
export class ValidateShareInterceptor implements NestInterceptor {
  constructor(
    private readonly reflector: Reflector,
    private readonly sharesService: SharesService,
  ) {}

  async intercept(
    context: ExecutionContext,
    next: CallHandler,
  ): Promise<Observable<any>> {
    const validateOptions = this.reflector.get<ValidateShareOptions>(
      VALIDATE_SHARE_KEY,
      context.getHandler(),
    );

    if (!validateOptions) {
      return next.handle();
    }

    const request: Request = context.switchToHttp().getRequest();

    // Extract parameters using fixed parameter names
    const shareId = request.params['shareId'];
    const password = request.cookies?.['share-password'];
    const userId = request.user?.id; // Assuming user is attached to request by auth middleware

    if (!shareId) {
      throw new Error(`Share ID parameter 'shareId' not found in request`);
    }

    // Validate the share
    const validatedShare = await this.sharesService.getAndValidateShare(
      shareId,
      password,
      userId,
    );

    // Additional chat validation if required
    if (validateOptions.requireChat) {
      if (
        validatedShare.shareType !== ShareType.CHAT_ONLY &&
        validatedShare.shareType !== ShareType.ALL
      ) {
        throw new ForbiddenException(
          'This share does not allow chat functionality',
        );
      }
    }

    // Attach the validated share to the request for the @ValidatedShare decorator
    (request as any).validatedShare = validatedShare;

    return next.handle();
  }
}
