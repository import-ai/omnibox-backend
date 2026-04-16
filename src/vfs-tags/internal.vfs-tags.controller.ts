import {
  Body,
  Controller,
  Delete,
  HttpCode,
  HttpStatus,
  Param,
  Post,
} from '@nestjs/common';
import { Public } from 'omniboxd/auth/decorators/public.auth.decorator';
import { HeaderUserId } from 'omniboxd/decorators/header-user-id.decorator';
import { ResourceTagRequestDto } from 'omniboxd/vfs-tags/dto/resource-tag-request.dto';
import { VfsTagsService } from 'omniboxd/vfs-tags/vfs-tags.service';
import { CheckNamespaceReadonly } from 'omniboxd/namespaces/decorators/check-storage-quota.decorator';

@Controller('internal/api/v1/namespaces/:namespaceId/vfs/tags')
export class InternalVfsTagsController {
  constructor(private readonly vfsTagsService: VfsTagsService) {}

  @Public()
  @Post()
  @HttpCode(HttpStatus.OK)
  @CheckNamespaceReadonly()
  async addTagToResource(
    @Param('namespaceId') namespaceId: string,
    @HeaderUserId() userId: string,
    @Body() body: ResourceTagRequestDto,
  ) {
    return await this.vfsTagsService.addTagToResource(
      namespaceId,
      userId,
      body.mdPath,
      body.tagName,
    );
  }

  @Public()
  @Delete()
  @HttpCode(HttpStatus.OK)
  @CheckNamespaceReadonly()
  async removeTagFromResource(
    @Param('namespaceId') namespaceId: string,
    @HeaderUserId() userId: string,
    @Body() body: ResourceTagRequestDto,
  ) {
    return await this.vfsTagsService.removeTagFromResource(
      namespaceId,
      userId,
      body.mdPath,
      body.tagName,
    );
  }
}
