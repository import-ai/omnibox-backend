import {
  BadRequestException,
  Body,
  Controller,
  Post,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { NamespaceResourcesService } from 'omniboxd/namespace-resources/namespace-resources.service';
import { WizardTaskService } from 'omniboxd/tasks/wizard-task.service';
import { APIKey, APIKeyAuth } from 'omniboxd/auth/decorators';
import {
  APIKey as APIKeyEntity,
  APIKeyPermissionTarget,
  APIKeyPermissionType,
} from 'omniboxd/api-key/api-key.entity';
import { FileInterceptor } from '@nestjs/platform-express';
import { UserId } from 'omniboxd/decorators/user-id.decorator';
import { OpenCreateResourceDto } from 'omniboxd/namespace-resources/dto/open.create-resource.dto';
import { ResourceType } from 'omniboxd/resources/entities/resource.entity';
import { isEmpty } from 'omniboxd/utils/is-empty';

@Controller('open/api/v1/resources')
export class OpenResourcesController {
  constructor(
    private readonly namespaceResourcesService: NamespaceResourcesService,
    private readonly wizardTaskService: WizardTaskService,
  ) {}

  @Post()
  @APIKeyAuth({
    permissions: [
      {
        target: APIKeyPermissionTarget.RESOURCES,
        permissions: [APIKeyPermissionType.CREATE],
      },
    ],
  })
  async create(
    @APIKey() apiKey: APIKeyEntity,
    @UserId() userId: string,
    @Body() data: OpenCreateResourceDto,
  ) {
    if (!data.content) {
      throw new BadRequestException('Content is required for the resource.');
    }

    const resourceData = {
      name: data.name || '',
      content: data.content,
      tagIds: data.tag_ids || [],
      attrs: data.attrs || {},
      resourceType: ResourceType.DOC,
      parentId: apiKey.attrs.root_resource_id,
    };

    const newResource = await this.namespaceResourcesService.create(
      userId,
      apiKey.namespaceId,
      resourceData,
    );

    if (!isEmpty(newResource.content?.trim())) {
      if (isEmpty(newResource.name?.trim())) {
        await this.wizardTaskService.createGenerateTitleTask(
          userId,
          apiKey.namespaceId,
          { resource_id: newResource.id },
          { text: data.content },
        );
      }
      if (isEmpty(newResource.tagIds)) {
        await this.wizardTaskService.createExtractTagsTask(
          userId,
          newResource.id,
          apiKey.namespaceId,
          newResource.content,
        );
      }
    }

    return { id: newResource.id, name: newResource.name };
  }

  @Post('upload')
  @APIKeyAuth({
    permissions: [
      {
        target: APIKeyPermissionTarget.RESOURCES,
        permissions: [APIKeyPermissionType.CREATE],
      },
    ],
  })
  @UseInterceptors(FileInterceptor('file'))
  async uploadFile(
    @APIKey() apiKey: APIKeyEntity,
    @UserId() userId: string,
    @UploadedFile() file: Express.Multer.File,
  ) {
    const newResource = await this.namespaceResourcesService.uploadFile(
      userId,
      apiKey.namespaceId,
      file,
      apiKey.attrs.root_resource_id,
      undefined,
      'open_api',
    );
    return { id: newResource.id, name: newResource.name };
  }
}
