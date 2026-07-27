import { Controller, Get, HttpStatus, Inject, Param } from '@nestjs/common';
import { I18nService } from 'nestjs-i18n';
import { AppException } from 'omniboxd/common/exceptions/app.exception';
import { UserId } from 'omniboxd/decorators/user-id.decorator';
import { PermissionsService } from 'omniboxd/permissions/permissions.service';
import { RssFolderEntitlementsResponseDto } from 'omniboxd/rss/dto/rss-folder-entitlements-response.dto';
import {
  IRssFolderEntitlementsProvider,
  RSS_FOLDER_ENTITLEMENTS_PROVIDER,
} from 'omniboxd/rss/rss-folder-entitlements.interface';

@Controller('api/v1/namespaces/:namespaceId/rss-folders/entitlements')
export class RssFolderEntitlementsController {
  constructor(
    private readonly permissionsService: PermissionsService,
    @Inject(RSS_FOLDER_ENTITLEMENTS_PROVIDER)
    private readonly entitlementsProvider: IRssFolderEntitlementsProvider,
    private readonly i18n: I18nService,
  ) {}

  @Get()
  async getEntitlements(
    @UserId() userId: string,
    @Param('namespaceId') namespaceId: string,
  ): Promise<RssFolderEntitlementsResponseDto> {
    const allowed = await this.permissionsService.userInNamespace(
      userId,
      namespaceId,
    );
    if (!allowed) {
      const message = this.i18n.t('auth.errors.notAuthorized');
      throw new AppException(message, 'NOT_AUTHORIZED', HttpStatus.FORBIDDEN);
    }

    return await this.entitlementsProvider.getEntitlements(namespaceId, userId);
  }
}
