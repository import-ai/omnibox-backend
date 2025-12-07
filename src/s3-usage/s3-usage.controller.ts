import { Controller, Get, Param, Query } from '@nestjs/common';
import { S3UsageService } from './s3-usage.service';
import { NamespaceOwner } from 'omniboxd/namespaces/decorators/namespace-owner.decorator';
import { UserId } from 'omniboxd/decorators/user-id.decorator';

@Controller('api/v1/namespaces/:namespaceId/usage')
export class S3UsageController {
  constructor(private readonly s3UsageService: S3UsageService) {}

  @NamespaceOwner()
  @Get()
  async getUsage(
    @UserId() userId: string,
    @Param('namespaceId') namespaceId: string,
    @Query('resourceId') resourceId?: string,
    @Query('recursive') recursive?: string,
  ) {
    const isRecursive = recursive === 'true';
    return await this.s3UsageService.getS3Usage(
      userId,
      namespaceId,
      resourceId,
      isRecursive,
    );
  }
}
