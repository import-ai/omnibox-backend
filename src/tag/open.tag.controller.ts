import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import {
  ApiBody,
  ApiOperation,
  ApiResponse,
  ApiSecurity,
  ApiTags,
} from '@nestjs/swagger';
import {
  APIKeyPermissionTarget,
  APIKeyPermissionType,
  APIKey as APIKeyEntity,
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
  @ApiOperation({ summary: 'Create a tag in the API key namespace' })
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
  @ApiOperation({ summary: 'List or query tags in the API key namespace' })
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
