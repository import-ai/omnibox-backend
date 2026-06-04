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
import { AddOpenResourceTagRequestDto } from 'omniboxd/namespace-resources/dto/add-open-resource-tag-request.dto';
import { ResourceDto } from 'omniboxd/namespace-resources/dto/resource.dto';
import { ResourceSummaryDto } from 'omniboxd/namespace-resources/dto/resource-summary.dto';
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
  constructor(private readonly openResourcesService: OpenResourcesService) {}

  @Get()
  @APIKeyAuth({
    permissions: [
      {
        target: APIKeyPermissionTarget.RESOURCES,
        permissions: [APIKeyPermissionType.READ],
      },
    ],
  })
  @ApiOperation({ summary: 'List resources under the API key root' })
  @ApiResponse({
    status: 200,
    description: 'Resources listed successfully',
    type: [ResourceSummaryDto],
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
  ): Promise<ResourceSummaryDto[]> {
    return await this.openResourcesService.listResources(
      apiKey.namespaceId,
      apiKey.attrs.root_resource_id,
      userId,
      {
        parentId,
        limit,
        offset,
        summary: summary === 'true',
      },
    );
  }

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
  @ApiOperation({ summary: 'Get a resource under the API key root' })
  @ApiResponse({
    status: 200,
    description: 'Resource retrieved successfully',
    type: ResourceDto,
  })
  @ApiResponse({ status: 401, description: 'Invalid or missing API key' })
  @ApiResponse({ status: 403, description: 'Insufficient permissions' })
  @ApiResponse({ status: 404, description: 'Resource not found' })
  async get(
    @APIKey() apiKey: APIKeyEntity,
    @UserId() userId: string,
    @Param('resourceId') resourceId: string,
  ): Promise<ResourceDto> {
    return await this.openResourcesService.getResource(
      apiKey.namespaceId,
      apiKey.attrs.root_resource_id,
      userId,
      resourceId,
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
  @ApiOperation({ summary: 'Update a resource under the API key root' })
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
  @ApiOperation({ summary: 'Add tags to a resource under the API key root' })
  @ApiBody({
    description:
      'Tag name to add to the resource. Existing tags are preserved.',
    type: AddOpenResourceTagRequestDto,
  })
  @ApiResponse({
    status: 200,
    description: 'Tags added successfully',
    type: ResourceDto,
  })
  @ApiResponse({ status: 401, description: 'Invalid or missing API key' })
  @ApiResponse({ status: 403, description: 'Insufficient permissions' })
  @ApiResponse({ status: 404, description: 'Resource not found' })
  async addTags(
    @APIKey() apiKey: APIKeyEntity,
    @UserId() userId: string,
    @Param('resourceId') resourceId: string,
    @Body() data: AddOpenResourceTagRequestDto,
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
    summary: 'Remove a tag from a resource under the API key root',
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
  @ApiOperation({ summary: 'Delete a resource under the API key root' })
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
