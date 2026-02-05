import {
  Body,
  Controller,
  Post,
  UploadedFile,
  UseInterceptors,
  HttpStatus,
} from '@nestjs/common';
import { AppException } from 'omniboxd/common/exceptions/app.exception';
import { I18n, I18nContext } from 'nestjs-i18n';
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
import { TagService } from 'omniboxd/tag/tag.service';
import { parseHashtags } from 'omniboxd/utils/parse-hashtags';
import { CreateResourceDto } from 'omniboxd/namespace-resources/dto/create-resource.dto';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiSecurity,
  ApiConsumes,
  ApiBody,
} from '@nestjs/swagger';
import { CheckNamespaceReadonly } from 'omniboxd/namespaces/decorators/check-storage-quota.decorator';

@ApiTags('Resources')
@ApiSecurity('api-key')
@Controller('open/api/v1/resources')
export class OpenResourcesController {
  constructor(
    private readonly namespaceResourcesService: NamespaceResourcesService,
    private readonly wizardTaskService: WizardTaskService,
    private readonly tagService: TagService,
  ) {}

  @Post()
  @CheckNamespaceReadonly()
  @APIKeyAuth({
    permissions: [
      {
        target: APIKeyPermissionTarget.RESOURCES,
        permissions: [APIKeyPermissionType.CREATE],
      },
    ],
  })
  @ApiOperation({ summary: 'Create a new resource/document' })
  @ApiBody({
    description: 'Resource creation request with content and metadata',
    type: OpenCreateResourceDto,
  })
  @ApiResponse({
    status: 201,
    description: 'Resource created successfully',
    schema: {
      properties: {
        id: { type: 'string', description: 'Resource ID' },
        name: { type: 'string', description: 'Resource name' },
      },
    },
  })
  @ApiResponse({ status: 400, description: 'Content required' })
  @ApiResponse({ status: 401, description: 'Invalid or missing API key' })
  @ApiResponse({ status: 403, description: 'Insufficient permissions' })
  async create(
    @APIKey() apiKey: APIKeyEntity,
    @UserId() userId: string,
    @Body() data: OpenCreateResourceDto,
    @I18n() i18n: I18nContext,
  ) {
    if (!data.content) {
      const message = i18n.t('resource.errors.contentRequired');
      throw new AppException(
        message,
        'CONTENT_REQUIRED',
        HttpStatus.BAD_REQUEST,
      );
    }

    // Optionally parse hashtags from content
    let tagIds: string[] | undefined = data.tag_ids;
    if (!data.skip_parsing_tags_from_content) {
      const hashtagNames = parseHashtags(data.content);
      // If hashtags found, get or create tags and merge with provided tag_ids
      if (hashtagNames.length > 0) {
        const hashtagIds = await this.tagService.getOrCreateTagsByNames(
          apiKey.namespaceId,
          hashtagNames,
        );
        // Merge and deduplicate tag IDs
        tagIds = Array.from(new Set([...(tagIds || []), ...hashtagIds]));
      }
    }

    const createResourceDto = {
      name: data.name || '',
      content: data.content,
      tag_ids: tagIds,
      attrs: data.attrs || {},
      resourceType: ResourceType.DOC,
      parentId: apiKey.attrs.root_resource_id,
    } as CreateResourceDto;

    const newResource = await this.namespaceResourcesService.create(
      userId,
      apiKey.namespaceId,
      createResourceDto,
    );

    if (!isEmpty(newResource.content?.trim())) {
      if (isEmpty(newResource.name?.trim())) {
        await this.wizardTaskService.emitGenerateTitleTask(
          userId,
          apiKey.namespaceId,
          { resource_id: newResource.id },
          { text: data.content },
        );
      }
      // Skip extract tags task if user requested or we already have tags
      if (!data.skip_parsing_tags_from_content && isEmpty(newResource.tagIds)) {
        await this.wizardTaskService.emitExtractTagsTask(
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
  @CheckNamespaceReadonly()
  @APIKeyAuth({
    permissions: [
      {
        target: APIKeyPermissionTarget.RESOURCES,
        permissions: [APIKeyPermissionType.CREATE],
      },
    ],
  })
  @UseInterceptors(FileInterceptor('file'))
  @ApiOperation({ summary: 'Upload a file as a resource' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    description: 'File upload with optional parsed content',
    schema: {
      type: 'object',
      properties: {
        file: {
          type: 'string',
          format: 'binary',
          description: 'File to upload',
        },
        parsed_content: {
          type: 'string',
          description: 'Optional pre-parsed text content',
        },
      },
    },
  })
  @ApiResponse({
    status: 201,
    description: 'File uploaded successfully',
    schema: {
      properties: {
        id: { type: 'string', description: 'Resource ID' },
        name: { type: 'string', description: 'Resource name' },
      },
    },
  })
  @ApiResponse({ status: 400, description: 'File required' })
  @ApiResponse({ status: 401, description: 'Invalid or missing API key' })
  @ApiResponse({ status: 403, description: 'Insufficient permissions' })
  async uploadFile(
    @APIKey() apiKey: APIKeyEntity,
    @UserId() userId: string,
    @I18n() i18n: I18nContext,
    @UploadedFile() file?: Express.Multer.File,
    @Body('parsed_content') parsedContent?: string,
  ) {
    if (!file) {
      const message = i18n.t('resource.errors.fileRequired');
      throw new AppException(message, 'FILE_REQUIRED', HttpStatus.BAD_REQUEST);
    }

    const newResource = await this.namespaceResourcesService.uploadFile(
      userId,
      apiKey.namespaceId,
      file,
      apiKey.attrs.root_resource_id,
      'open_api',
      parsedContent,
    );
    return { id: newResource.id, name: newResource.name };
  }
}
