import { Controller, Get, Param, Query } from '@nestjs/common';
import { StorageUsageService } from './storage-usage.service';
import { NamespaceOwner } from 'omniboxd/namespaces/decorators/namespace-owner.decorator';
import { UserId } from 'omniboxd/decorators/user-id.decorator';

@Controller('api/v1/namespaces/:namespaceId/usage')
export class StorageUsageController {
  constructor(private readonly storageUsageService: StorageUsageService) {}

  @NamespaceOwner()
  @Get()
  async getUsage(
    @UserId() userId: string,
    @Param('namespaceId') namespaceId: string,
    @Query('resourceId') resourceId?: string,
    @Query('recursive') recursive?: string,
  ) {
    const isRecursive = recursive === 'true';
    return await this.storageUsageService.getStorageUsage(
      userId,
      namespaceId,
      resourceId,
      isRecursive,
    );
  }
}
