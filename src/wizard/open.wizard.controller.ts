import {
  Body,
  Controller,
  Post,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { RequestId } from 'omniboxd/decorators/request-id.decorators';
import { WizardService } from 'omniboxd/wizard/wizard.service';
import { CompressedCollectRequestDto } from 'omniboxd/wizard/dto/collect-request.dto';
import { CollectResponseDto } from 'omniboxd/wizard/dto/collect-response.dto';
import { UserId } from 'omniboxd/decorators/user-id.decorator';
import { APIKey, APIKeyAuth } from 'omniboxd/auth/decorators';
import {
  APIKey as APIKeyEntity,
  APIKeyPermissionTarget,
  APIKeyPermissionType,
} from 'omniboxd/api-key/api-key.entity';
import { OpenCollectRequestDto } from 'omniboxd/wizard/dto/open-collect-request.dto';
import { OpenAgentRequestDto } from 'omniboxd/wizard/dto/open-agent-request.dto';
import { FileInterceptor } from '@nestjs/platform-express';
import { OpenWizardService } from 'omniboxd/wizard/open.wizard.service';

@Controller('open/api/v1/wizard')
export class OpenWizardController {
  constructor(
    private readonly wizardService: WizardService,
    private readonly openWizardService: OpenWizardService,
  ) {}

  @Post('collect')
  @APIKeyAuth({
    permissions: [
      {
        target: APIKeyPermissionTarget.RESOURCES,
        permissions: [APIKeyPermissionType.CREATE],
      },
    ],
  })
  @UseInterceptors(FileInterceptor('html'))
  async collect(
    @APIKey() apiKey: APIKeyEntity,
    @UserId() userId: string,
    @Body() data: OpenCollectRequestDto,
    @UploadedFile() compressedHtml: Express.Multer.File,
  ): Promise<CollectResponseDto> {
    return await this.wizardService.compressedCollect(
      userId,
      {
        url: data.url,
        title: data.title,
        namespace_id: apiKey.namespaceId,
        parentId: data.parentId || apiKey.attrs.root_resource_id,
      } as CompressedCollectRequestDto,
      compressedHtml,
    );
  }

  @Post('ask')
  @APIKeyAuth({
    permissions: [
      {
        target: APIKeyPermissionTarget.CHAT,
        permissions: [APIKeyPermissionType.CREATE],
      },
    ],
  })
  async ask(
    @APIKey() apiKey: APIKeyEntity,
    @UserId() userId: string,
    @RequestId() requestId: string,
    @Body() data: OpenAgentRequestDto,
  ): Promise<any> {
    return await this.openWizardService.ask(
      userId,
      apiKey.namespaceId,
      requestId,
      data,
    );
  }
}
