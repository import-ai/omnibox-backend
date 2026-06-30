import { Body, Controller, Param, Post } from '@nestjs/common';
import { Public } from 'omniboxd/auth/decorators/public.auth.decorator';
import { HeaderUserId } from 'omniboxd/decorators/header-user-id.decorator';
import { CheckNamespaceReadonly } from 'omniboxd/namespaces/decorators/check-storage-quota.decorator';
import { CollectUrlResponseDto } from 'omniboxd/wizard/dto/collect-url-request.dto';
import { InternalCollectUrlRequestDto } from 'omniboxd/wizard/dto/internal-collect-url-request.dto';
import { WizardService } from 'omniboxd/wizard/wizard.service';

@Controller('internal/api/v1/namespaces/:namespaceId/wizard')
export class InternalNamespaceWizardController {
  constructor(private readonly wizardService: WizardService) {}

  @Public()
  @Post('collect/url')
  @CheckNamespaceReadonly()
  async collectUrl(
    @Param('namespaceId') namespaceId: string,
    @HeaderUserId() userId: string,
    @Body() body: InternalCollectUrlRequestDto,
  ): Promise<CollectUrlResponseDto> {
    return await this.wizardService.collectUrl(
      namespaceId,
      userId,
      body.url,
      body.parentId,
    );
  }
}
