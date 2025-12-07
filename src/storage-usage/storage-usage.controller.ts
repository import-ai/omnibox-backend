import { Controller, Get, Param, Query, HttpStatus } from '@nestjs/common';
import { StorageUsageService } from './storage-usage.service';
import { PermissionsService } from 'omniboxd/permissions/permissions.service';
import { UserId } from 'omniboxd/decorators/user-id.decorator';
import { AppException } from 'omniboxd/common/exceptions/app.exception';
import { I18n, I18nContext } from 'nestjs-i18n';

@Controller('api/v1/namespaces/:namespaceId')
export class StorageUsageController {
  constructor(
    private readonly storageUsageService: StorageUsageService,
    private readonly permissionsService: PermissionsService,
  ) {}

  @Get('usage')
  async getNamespaceUsage(
    @UserId() userId: string,
    @Param('namespaceId') namespaceId: string,
    @I18n() i18n: I18nContext,
  ) {
    const isMember = await this.permissionsService.userInNamespace(
      userId,
      namespaceId,
    );
    if (!isMember) {
      const message = i18n.t('auth.errors.notAuthorized');
      throw new AppException(message, 'NOT_AUTHORIZED', HttpStatus.FORBIDDEN);
    }
    return await this.storageUsageService.getStorageUsage(userId, namespaceId);
  }

  @Get('resources/:resourceId/usage')
  async getResourceUsage(
    @UserId() userId: string,
    @Param('namespaceId') namespaceId: string,
    @Param('resourceId') resourceId: string,
    @I18n() i18n: I18nContext,
    @Query('recursive') recursive?: string,
  ) {
    const hasPermission = await this.permissionsService.userHasPermission(
      namespaceId,
      resourceId,
      userId,
    );
    if (!hasPermission) {
      const message = i18n.t('auth.errors.notAuthorized');
      throw new AppException(message, 'NOT_AUTHORIZED', HttpStatus.FORBIDDEN);
    }
    const isRecursive = recursive === 'true';
    return await this.storageUsageService.getStorageUsage(
      userId,
      namespaceId,
      resourceId,
      isRecursive,
    );
  }
}
