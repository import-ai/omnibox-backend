import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  HttpStatus,
} from '@nestjs/common';
import { AppException } from 'omniboxd/common/exceptions/app.exception';
import { I18nService } from 'nestjs-i18n';
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
    private readonly i18n: I18nService,
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
      const message = this.i18n.t('share.errors.shareIdNotFound');
      throw new AppException(
        message,
        'SHARE_ID_NOT_FOUND',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
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
        const message = this.i18n.t('share.errors.chatNotAllowed');
        throw new AppException(
          message,
          'CHAT_NOT_ALLOWED',
          HttpStatus.FORBIDDEN,
        );
      }
    }

    // Attach the validated share to the request for the @ValidatedShare decorator
    (request as any).validatedShare = validatedShare;

    return next.handle();
  }
}
