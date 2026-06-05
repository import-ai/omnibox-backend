import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  UploadedFile,
  UseInterceptors,
  HttpStatus,
  HttpCode,
  BadRequestException,
} from '@nestjs/common';
import { OpenResourcesService } from 'omniboxd/namespace-resources/open-resources.service';
import { APIKey, APIKeyAuth } from 'omniboxd/auth/decorators';
import {
  APIKey as APIKeyEntity,
  APIKeyPermissionTarget,
  APIKeyPermissionType,
} from 'omniboxd/api-key/api-key.entity';
import { FileInterceptor } from '@nestjs/platform-express';
import { UserId } from 'omniboxd/decorators/user-id.decorator';
import { OpenCreateResourceRequestDto } from 'omniboxd/namespace-resources/dto/open-create-resource-request.dto';
import { UpdateResourceDto } from 'omniboxd/namespace-resources/dto/update-resource.dto';
import { OpenAddResourceTagRequestDto } from 'omniboxd/namespace-resources/dto/open-add-resource-tag-request.dto';
import { ResourceDto } from 'omniboxd/namespace-resources/dto/resource.dto';
import { OpenGetResourceQueryDto } from 'omniboxd/namespace-resources/dto/open-get-resource-query.dto';
import { OpenListResourcesResponseDto } from 'omniboxd/namespace-resources/dto/open-list-resources-response.dto';
import { OpenResourceDto } from 'omniboxd/namespace-resources/dto/open-resource.dto';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiSecurity,
  ApiConsumes,
  ApiBody,
  ApiQuery,
} from '@nestjs/swagger';
import { CheckNamespaceReadonly } from 'omniboxd/namespaces/decorators/check-storage-quota.decorator';
import { SkipOpenAPIQuota } from 'omniboxd/open-api/open-api-quota.decorator';

@ApiTags('Resources')
@ApiSecurity('api-key')
@Controller('open/api/v1/resources')
export class OpenResourcesController {
  constructor(private readonly openResourcesService: OpenResourcesService) {}

  private parseOptionalBoolean(value?: string): boolean {
    if (value === undefined) {
      return false;
    }
    if (value === 'true') {
      return true;
    }
    if (value === 'false') {
      return false;
    }
    throw new BadRequestException(
      'Validation failed (boolean string is expected)',
    );
  }

  @Get()
  @APIKeyAuth({
    permissions: [
      {
        target: APIKeyPermissionTarget.RESOURCES,
        permissions: [APIKeyPermissionType.READ],
      },
    ],
  })
  @ApiOperation({
    summary: 'List child resources',
    description:
      'Lists direct child resources under the API key root resource, or under parent_id when provided. Use offset and limit for pagination. The summary query parameter defaults to false; set it to true to include content previews and first attachment metadata.',
  })
  @ApiQuery({
    name: 'parent_id',
    required: false,
    description:
      'Parent resource ID under the API key root. Defaults to the API key root resource.',
  })
  @ApiQuery({
    name: 'limit',
    required: false,
    type: Number,
    description: 'Maximum number of resources to return.',
  })
  @ApiQuery({
    name: 'offset',
    required: false,
    type: Number,
    description: 'Number of resources to skip before returning results.',
  })
  @ApiQuery({
    name: 'summary',
    required: false,
    schema: { type: 'boolean', default: false },
    description:
      'Whether to include content previews and first attachment metadata. Defaults to false.',
  })
  @ApiResponse({
    status: 200,
    description: 'Resources listed successfully',
    type: OpenListResourcesResponseDto,
  })
  @ApiResponse({ status: 401, description: 'Invalid or missing API key' })
  @ApiResponse({ status: 403, description: 'Insufficient permissions' })
  async list(
    @APIKey() apiKey: APIKeyEntity,
    @UserId() userId: string,
    @Query('parent_id') parentId?: string,
    @Query('limit', new ParseIntPipe({ optional: true })) limit?: number,
    @Query('offset', new ParseIntPipe({ optional: true })) offset?: number,
    @Query('summary') summary?: string,
  ): Promise<OpenListResourcesResponseDto> {
    return await this.openResourcesService.listResources(
      apiKey.namespaceId,
      apiKey.attrs.root_resource_id,
      userId,
      {
        parentId,
        limit,
        offset,
        summary: this.parseOptionalBoolean(summary),
      },
    );
  }

  @Post()
  @SkipOpenAPIQuota()
  @CheckNamespaceReadonly()
  @APIKeyAuth({
    permissions: [
      {
        target: APIKeyPermissionTarget.RESOURCES,
        permissions: [APIKeyPermissionType.CREATE],
      },
    ],
  })
  @ApiOperation({
    summary: 'Create a resource',
    description:
      'Creates a document or folder under the API key root resource. Documents require content; folders require name and must not include content. parent_id, when provided, must be inside the API key root scope.',
  })
  @ApiBody({
    description: 'Resource creation request with content and metadata',
    type: OpenCreateResourceRequestDto,
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
  @ApiResponse({
    status: 400,
    description: 'Content required for documents or name required for folders',
  })
  @ApiResponse({ status: 401, description: 'Invalid or missing API key' })
  @ApiResponse({ status: 403, description: 'Insufficient permissions' })
  async create(
    @APIKey() apiKey: APIKeyEntity,
    @UserId() userId: string,
    @Body() data: OpenCreateResourceRequestDto,
  ): Promise<{ id: string; name: string }> {
    return await this.openResourcesService.createResource(
      apiKey.namespaceId,
      apiKey.attrs.root_resource_id,
      userId,
      data,
    );
  }

  @Post('upload')
  @SkipOpenAPIQuota()
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
  @ApiOperation({
    summary: 'Upload a file resource',
    description:
      'Uploads a file and creates a resource under the API key root resource. parsed_content can be supplied when the caller has already extracted text content.',
  })
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
    @UploadedFile() file?: Express.Multer.File,
    @Body('parsed_content') parsedContent?: string,
  ): Promise<{ id: string; name: string }> {
    return await this.openResourcesService.uploadFile(
      apiKey.namespaceId,
      apiKey.attrs.root_resource_id,
      userId,
      file,
      parsedContent,
    );
  }

  @Get(':resourceId')
  @APIKeyAuth({
    permissions: [
      {
        target: APIKeyPermissionTarget.RESOURCES,
        permissions: [APIKeyPermissionType.READ],
      },
    ],
  })
  @ApiOperation({
    summary: 'Get a resource',
    description:
      'Retrieves a single resource by ID. The resource must be within the API key root scope and visible to the API key user. Resource content is paginated using content_offset and content_limit; pagination metadata is returned in content_pagination.',
  })
  @ApiResponse({
    status: 200,
    description: 'Resource retrieved successfully',
    type: OpenResourceDto,
  })
  @ApiResponse({ status: 401, description: 'Invalid or missing API key' })
  @ApiResponse({ status: 403, description: 'Insufficient permissions' })
  @ApiResponse({ status: 404, description: 'Resource not found' })
  async get(
    @APIKey() apiKey: APIKeyEntity,
    @UserId() userId: string,
    @Param('resourceId') resourceId: string,
    @Query() query: OpenGetResourceQueryDto,
  ): Promise<OpenResourceDto> {
    return await this.openResourcesService.getResource(
      apiKey.namespaceId,
      apiKey.attrs.root_resource_id,
      userId,
      resourceId,
      {
        offset: query.content_offset,
        limit: query.content_limit,
      },
    );
  }

  @Patch(':resourceId')
  @CheckNamespaceReadonly()
  @APIKeyAuth({
    permissions: [
      {
        target: APIKeyPermissionTarget.RESOURCES,
        permissions: [APIKeyPermissionType.UPDATE],
      },
    ],
  })
  @ApiOperation({
    summary: 'Update a resource',
    description:
      'Updates mutable fields for a resource within the API key root scope. Moving a resource with parentId is only allowed to another resource inside the same scoped tree.',
  })
  @ApiBody({
    description: 'Resource fields to update',
    type: UpdateResourceDto,
  })
  @ApiResponse({
    status: 200,
    description: 'Resource updated successfully',
    type: ResourceDto,
  })
  @ApiResponse({ status: 401, description: 'Invalid or missing API key' })
  @ApiResponse({ status: 403, description: 'Insufficient permissions' })
  @ApiResponse({ status: 404, description: 'Resource not found' })
  async update(
    @APIKey() apiKey: APIKeyEntity,
    @UserId() userId: string,
    @Param('resourceId') resourceId: string,
    @Body() data: UpdateResourceDto,
  ): Promise<ResourceDto> {
    return await this.openResourcesService.updateResource(
      apiKey.namespaceId,
      apiKey.attrs.root_resource_id,
      userId,
      resourceId,
      data,
    );
  }

  @Post(':resourceId/tags')
  @HttpCode(HttpStatus.OK)
  @CheckNamespaceReadonly()
  @APIKeyAuth({
    permissions: [
      {
        target: APIKeyPermissionTarget.RESOURCES,
        permissions: [APIKeyPermissionType.UPDATE],
      },
    ],
  })
  @ApiOperation({
    summary: 'Add a tag to a resource',
    description:
      'Adds the named tag to a resource within the API key root scope. Existing tags are preserved.',
  })
  @ApiBody({
    description:
      'Tag name to add to the resource. Existing tags are preserved.',
    type: OpenAddResourceTagRequestDto,
  })
  @ApiResponse({
    status: 200,
    description: 'Tag added successfully',
    type: ResourceDto,
  })
  @ApiResponse({ status: 401, description: 'Invalid or missing API key' })
  @ApiResponse({ status: 403, description: 'Insufficient permissions' })
  @ApiResponse({ status: 404, description: 'Resource not found' })
  async addTags(
    @APIKey() apiKey: APIKeyEntity,
    @UserId() userId: string,
    @Param('resourceId') resourceId: string,
    @Body() data: OpenAddResourceTagRequestDto,
  ): Promise<ResourceDto> {
    return await this.openResourcesService.addResourceTag(
      apiKey.namespaceId,
      userId,
      apiKey.attrs.root_resource_id,
      resourceId,
      data.tag_name,
    );
  }

  @Delete(':resourceId/tags/:tagId')
  @CheckNamespaceReadonly()
  @APIKeyAuth({
    permissions: [
      {
        target: APIKeyPermissionTarget.RESOURCES,
        permissions: [APIKeyPermissionType.UPDATE],
      },
    ],
  })
  @ApiOperation({
    summary: 'Remove a tag from a resource',
    description:
      'Removes a tag from a resource within the API key root scope. The resource remains unchanged if other tags are still attached.',
  })
  @ApiResponse({
    status: 200,
    description: 'Tag removed successfully',
    type: ResourceDto,
  })
  @ApiResponse({ status: 401, description: 'Invalid or missing API key' })
  @ApiResponse({ status: 403, description: 'Insufficient permissions' })
  @ApiResponse({ status: 404, description: 'Resource not found' })
  async removeTag(
    @APIKey() apiKey: APIKeyEntity,
    @UserId() userId: string,
    @Param('resourceId') resourceId: string,
    @Param('tagId') tagId: string,
  ): Promise<ResourceDto> {
    return await this.openResourcesService.removeResourceTag(
      apiKey.namespaceId,
      userId,
      apiKey.attrs.root_resource_id,
      resourceId,
      tagId,
    );
  }

  @Delete(':resourceId')
  @APIKeyAuth({
    permissions: [
      {
        target: APIKeyPermissionTarget.RESOURCES,
        permissions: [APIKeyPermissionType.DELETE],
      },
    ],
  })
  @ApiOperation({
    summary: 'Delete a resource',
    description:
      'Deletes a resource within the API key root scope. The API key must have delete permission for resources.',
  })
  @ApiResponse({ status: 200, description: 'Resource deleted successfully' })
  @ApiResponse({ status: 401, description: 'Invalid or missing API key' })
  @ApiResponse({ status: 403, description: 'Insufficient permissions' })
  @ApiResponse({ status: 404, description: 'Resource not found' })
  async delete(
    @APIKey() apiKey: APIKeyEntity,
    @UserId() userId: string,
    @Param('resourceId') resourceId: string,
  ): Promise<void> {
    await this.openResourcesService.deleteResource(
      apiKey.namespaceId,
      apiKey.attrs.root_resource_id,
      userId,
      resourceId,
    );
  }
}
