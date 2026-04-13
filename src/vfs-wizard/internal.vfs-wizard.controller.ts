import { Body, Controller, Param, Post } from '@nestjs/common';
import { CheckNamespaceReadonly } from 'omniboxd/namespaces/decorators/check-storage-quota.decorator';
import { CollectUrlResponseDto } from 'omniboxd/wizard/dto/collect-url-request.dto';
import { VfsWizardService } from 'omniboxd/vfs-wizard/vfs-wizard.service';
import { VfsCollectUrlRequestDto } from 'omniboxd/vfs-wizard/dto/vfs-collect-url.request.dto';
import { HeaderUserId } from 'omniboxd/decorators/header-user-id.decorator';

@Controller('internal/api/v1/namespaces/:namespaceId/vfs/wizard')
export class InternalVfsWizardController {
  constructor(private readonly vfsWizardService: VfsWizardService) {}

  @Post('collect/url')
  @CheckNamespaceReadonly()
  async collectUrl(
    @Param('namespaceId') namespaceId: string,
    @HeaderUserId() userId: string,
    @Body() data: VfsCollectUrlRequestDto,
  ): Promise<CollectUrlResponseDto> {
    return await this.vfsWizardService.collectUrl(
      namespaceId,
      userId,
      data.parentPath,
      data.url,
    );
  }
}
