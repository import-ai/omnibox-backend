import {
  Controller,
  Post,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { ResourcesService } from 'omniboxd/resources/resources.service';
import { APIKeyAuth } from 'omniboxd/auth/decorators';
import { APIKey } from 'omniboxd/auth/decorators';
import { APIKey as APIKeyEntity } from 'omniboxd/api-key/api-key.entity';
import { FileInterceptor } from '@nestjs/platform-express';
import { UserId } from 'omniboxd/decorators/user-id.decorator';

@Controller('open/api/v1/resources')
export class OpenResourcesController {
  constructor(private readonly resourcesService: ResourcesService) {}

  @Post('/upload')
  @APIKeyAuth()
  @UseInterceptors(FileInterceptor('file'))
  async uploadFile(
    @APIKey() apiKey: APIKeyEntity,
    @UserId() userId: string,
    @UploadedFile() file: Express.Multer.File,
  ) {
    const newResource = await this.resourcesService.uploadFile(
      userId,
      apiKey.namespaceId,
      file,
      apiKey.attrs.root_resource_id,
      undefined,
    );
    return { id: newResource.id };
  }
}
