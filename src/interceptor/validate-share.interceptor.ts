import {
  CallHandler,
  ExecutionContext,
  HttpStatus,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Request } from 'express';
import { I18nService } from 'nestjs-i18n';
import { AppException } from 'omniboxd/common/exceptions/app.exception';
import {
  VALIDATE_SHARE_KEY,
  ValidateShareOptions,
} from 'omniboxd/decorators/validate-share.decorator';
import { Share, ShareType } from 'omniboxd/shares/entities/share.entity';
import { SHARE_ACCESS_HEADER } from 'omniboxd/shares/share-access-token';
import { ShareAccessTokenService } from 'omniboxd/shares/share-access-token.service';
import { SharesService } from 'omniboxd/shares/shares.service';
import { Observable } from 'rxjs';

function headerValue(raw: string | string[] | undefined): string | undefined {
  return Array.isArray(raw) ? raw[0] : raw || undefined;
}

@Injectable()
export class ValidateShareInterceptor implements NestInterceptor {
  constructor(
    private readonly reflector: Reflector,
    private readonly sharesService: SharesService,
    private readonly shareAccessTokenService: ShareAccessTokenService,
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
    if (!shareId) {
      const message = this.i18n.t('share.errors.shareIdNotFound');
      throw new AppException(
        message,
        'SHARE_ID_NOT_FOUND',
        HttpStatus.BAD_REQUEST,
      );
    }

    if (typeof shareId !== 'string') {
      const message = this.i18n.t('share.errors.shareIdNotFound');
      throw new AppException(
        message,
        'SHARE_ID_NOT_FOUND',
        HttpStatus.BAD_REQUEST,
      );
    }

    const validatedShare = validateOptions.trustedInternal
      ? await this.validateTrustedInternal(
          shareId,
          headerValue(request.headers[SHARE_ACCESS_HEADER]),
          headerValue(request.headers['x-user-id']),
        )
      : await this.sharesService.getAndValidateShare(
          shareId,
          request.cookies?.['share-password'],
          request.user?.id,
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

    // Chat-only shares expose their resources to the assistant, not to visitors.
    if (validateOptions.requireResources) {
      if (validatedShare.shareType === ShareType.CHAT_ONLY) {
        const message = this.i18n.t('share.errors.resourceNotAllowed');
        throw new AppException(
          message,
          'RESOURCE_NOT_ALLOWED',
          HttpStatus.FORBIDDEN,
        );
      }
    }

    // Attach the validated share to the request for the @ValidatedShare decorator
    (request as any).validatedShare = validatedShare;

    return next.handle();
  }

  // Internal share routes are only trusted when the caller proves the visitor
  // already passed the share's own checks: the share chat gets a share-access
  // token minted by the backend that validated the visitor. Any other caller
  // (a workspace agent reading a share for its user, or anything that forgot
  // the token) is validated as that user, so a password-protected share is
  // refused, the owner included, exactly as the public share link behaves.
  private async validateTrustedInternal(
    shareId: string,
    accessToken: string | undefined,
    actingUserId: string | undefined,
  ): Promise<Share> {
    if (this.shareAccessTokenService.verify(accessToken, shareId)) {
      return await this.sharesService.getAvailableShareOrFail(shareId);
    }
    return await this.sharesService.getAndValidateShare(
      shareId,
      undefined,
      actingUserId,
    );
  }
}
