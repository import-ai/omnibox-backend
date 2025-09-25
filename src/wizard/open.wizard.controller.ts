import {
  Body,
  Controller,
  Post,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { WizardService } from 'omniboxd/wizard/wizard.service';
import { CollectRequestDto } from 'omniboxd/wizard/dto/collect-request.dto';
import { CollectResponseDto } from 'omniboxd/wizard/dto/collect-response.dto';
import { UserId } from 'omniboxd/decorators/user-id.decorator';
import { APIKey, APIKeyAuth } from 'omniboxd/auth/decorators';
import {
  APIKey as APIKeyEntity,
  APIKeyPermissionTarget,
  APIKeyPermissionType,
} from 'omniboxd/api-key/api-key.entity';
import { OpenCollectRequestDto } from 'omniboxd/wizard/dto/open-collect-request.dto';
import { FileInterceptor } from '@nestjs/platform-express';

@Controller('open/api/v1/wizard')
export class OpenWizardController {
  constructor(private readonly wizardService: WizardService) {}

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
    return await this.wizardService.collectZ(
      userId,
      {
        html: data.html,
        url: data.url,
        title: data.title,
        namespace_id: apiKey.namespaceId,
        parentId: data.parentId || apiKey.attrs.root_resource_id,
      } as CollectRequestDto,
      compressedHtml,
    );
  }
}
