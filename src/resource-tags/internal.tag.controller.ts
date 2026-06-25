import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { Public } from 'omniboxd/auth/decorators/public.auth.decorator';
import { HeaderUserId } from 'omniboxd/decorators/header-user-id.decorator';
import { CheckNamespaceReadonly } from 'omniboxd/namespaces/decorators/check-storage-quota.decorator';
import { FilterTagsRequestDto } from 'omniboxd/resource-tags/dto/filter-tags-request.dto';
import { ListTagsRequestDto } from 'omniboxd/resource-tags/dto/list-tags-request.dto';
import { RenameTagRequestDto } from 'omniboxd/resource-tags/dto/rename-tag-request.dto';
import { ResourceTagRequestDto } from 'omniboxd/resource-tags/dto/resource-tag-request.dto';
import { ResourceTagsService } from 'omniboxd/resource-tags/resource-tags.service';

@Controller('internal/api/v1/namespaces/:namespaceId/tags')
export class InternalTagController {
  constructor(private readonly resourceTagsService: ResourceTagsService) {}

  @Public()
  @Post()
  @CheckNamespaceReadonly()
  async addTagToResource(
    @Param('namespaceId') namespaceId: string,
    @HeaderUserId() userId: string,
    @Body() body: ResourceTagRequestDto,
  ) {
    return await this.resourceTagsService.addTagToResource(
      namespaceId,
      userId,
      body.resourceId,
      body.tagName,
    );
  }

  @Public()
  @Delete()
  @CheckNamespaceReadonly()
  async removeTagFromResource(
    @Param('namespaceId') namespaceId: string,
    @HeaderUserId() userId: string,
    @Body() body: ResourceTagRequestDto,
  ) {
    return await this.resourceTagsService.removeTagFromResource(
      namespaceId,
      userId,
      body.resourceId,
      body.tagName,
    );
  }

  @Public()
  @Get()
  async listTags(
    @Param('namespaceId') namespaceId: string,
    @HeaderUserId() userId: string,
    @Query() query: ListTagsRequestDto,
  ) {
    return await this.resourceTagsService.listTagsWithCount(
      namespaceId,
      userId,
      query,
    );
  }

  @Public()
  @Get('filter')
  async filterTags(
    @Param('namespaceId') namespaceId: string,
    @HeaderUserId() userId: string,
    @Query() query: FilterTagsRequestDto,
  ) {
    return await this.resourceTagsService.filterTags(
      namespaceId,
      userId,
      query,
    );
  }

  @Public()
  @Patch('rename')
  async renameTag(
    @Param('namespaceId') namespaceId: string,
    @HeaderUserId() userId: string,
    @Body() body: RenameTagRequestDto,
  ) {
    return await this.resourceTagsService.renameTag(
      namespaceId,
      userId,
      body.oldName,
      body.newName,
    );
  }
}
