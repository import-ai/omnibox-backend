import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import {
  ApiBody,
  ApiOperation,
  ApiResponse,
  ApiSecurity,
  ApiTags,
} from '@nestjs/swagger';
import {
  APIKey as APIKeyEntity,
  APIKeyPermissionTarget,
  APIKeyPermissionType,
} from 'omniboxd/api-key/api-key.entity';
import { APIKey, APIKeyAuth } from 'omniboxd/auth/decorators';
import { CreateTagRequestDto } from 'omniboxd/tag/dto/create-tag-request.dto';
import { OpenListTagsRequestDto } from 'omniboxd/tag/dto/open-list-tags-request.dto';
import { TagDto } from 'omniboxd/tag/dto/tag.dto';
import { OpenTagService } from 'omniboxd/tag/open.tag.service';

@ApiTags('Tags')
@ApiSecurity('api-key')
@Controller('open/api/v1/tags')
export class OpenTagController {
  constructor(private readonly openTagService: OpenTagService) {}

  @Post()
  @APIKeyAuth({
    permissions: [
      {
        target: APIKeyPermissionTarget.TAGS,
        permissions: [APIKeyPermissionType.CREATE],
      },
    ],
  })
  @ApiOperation({
    summary: 'Create a tag',
    description:
      'Creates a tag owned by the current API key namespace. If a matching tag already exists, the service returns the existing tag according to the tag service behavior.',
  })
  @ApiBody({ type: CreateTagRequestDto })
  @ApiResponse({
    status: 201,
    description: 'Tag created successfully',
    type: TagDto,
  })
  @ApiResponse({ status: 401, description: 'Invalid or missing API key' })
  @ApiResponse({ status: 403, description: 'Insufficient permissions' })
  async create(
    @APIKey() apiKey: APIKeyEntity,
    @Body() createTagRequestDto: CreateTagRequestDto,
  ): Promise<TagDto> {
    return await this.openTagService.create(
      apiKey.namespaceId,
      createTagRequestDto,
    );
  }

  @Get()
  @APIKeyAuth({
    permissions: [
      {
        target: APIKeyPermissionTarget.TAGS,
        permissions: [APIKeyPermissionType.READ],
      },
    ],
  })
  @ApiOperation({
    summary: 'List tags',
    description:
      'Lists tags from the current API key namespace. Optional filters support name search, comma-separated tag IDs, and offset/limit pagination.',
  })
  @ApiResponse({
    status: 200,
    description: 'Tags retrieved successfully',
    type: [TagDto],
  })
  @ApiResponse({ status: 401, description: 'Invalid or missing API key' })
  @ApiResponse({ status: 403, description: 'Insufficient permissions' })
  async findAll(
    @APIKey() apiKey: APIKeyEntity,
    @Query() query: OpenListTagsRequestDto,
  ): Promise<TagDto[]> {
    return await this.openTagService.findAll(apiKey.namespaceId, query);
  }
}
