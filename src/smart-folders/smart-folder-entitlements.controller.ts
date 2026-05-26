import { Controller, Get, HttpStatus, Inject, Param } from '@nestjs/common';
import { AppException } from 'omniboxd/common/exceptions/app.exception';
import { UserId } from 'omniboxd/decorators/user-id.decorator';
import { PermissionsService } from 'omniboxd/permissions/permissions.service';
import { SmartFolderEntitlementsResponseDto } from 'omniboxd/smart-folders/dto/smart-folder-entitlements-response.dto';
import {
  ISmartFolderEntitlementsProvider,
  SMART_FOLDER_ENTITLEMENTS_PROVIDER,
} from 'omniboxd/smart-folders/smart-folder-entitlements.interface';
import { I18nService } from 'nestjs-i18n';

@Controller('api/v1/namespaces/:namespaceId/smart-folders/entitlements')
export class SmartFolderEntitlementsController {
  constructor(
    private readonly permissionsService: PermissionsService,
    @Inject(SMART_FOLDER_ENTITLEMENTS_PROVIDER)
    private readonly entitlementsProvider: ISmartFolderEntitlementsProvider,
    private readonly i18n: I18nService,
  ) {}

  @Get()
  async getEntitlements(
    @UserId() userId: string,
    @Param('namespaceId') namespaceId: string,
  ): Promise<SmartFolderEntitlementsResponseDto> {
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
