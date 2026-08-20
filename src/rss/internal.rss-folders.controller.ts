import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import { Public } from 'omniboxd/auth/decorators/public.auth.decorator';
import { HeaderUserId } from 'omniboxd/decorators/header-user-id.decorator';
import { CheckNamespaceReadonly } from 'omniboxd/namespaces/decorators/check-storage-quota.decorator';
import { CreateRssFolderRequestDto } from 'omniboxd/rss/dto/create-rss-folder-request.dto';
import { RssFolderResponseDto } from 'omniboxd/rss/dto/rss-folder-response.dto';
import { UpdateRssFolderRequestDto } from 'omniboxd/rss/dto/update-rss-folder-request.dto';
import { RssFoldersService } from 'omniboxd/rss/rss-folders.service';

@Controller('internal/api/v1/namespaces/:namespaceId/rss-folders')
export class InternalRssFoldersController {
  constructor(private readonly rssFoldersService: RssFoldersService) {}

  @Public()
  @Post()
  @CheckNamespaceReadonly()
  async create(
    @HeaderUserId() userId: string,
    @Param('namespaceId') namespaceId: string,
    @Body() dto: CreateRssFolderRequestDto,
  ): Promise<RssFolderResponseDto> {
    return await this.rssFoldersService.create(userId, namespaceId, dto);
  }

  @Public()
  @Get(':resourceId/config')
  async getConfig(
    @HeaderUserId() userId: string,
    @Param('namespaceId') namespaceId: string,
    @Param('resourceId') resourceId: string,
  ): Promise<RssFolderResponseDto> {
    return await this.rssFoldersService.get(userId, namespaceId, resourceId);
  }

  @Public()
  @Patch(':resourceId/config')
  @CheckNamespaceReadonly()
  async updateConfig(
    @HeaderUserId() userId: string,
    @Param('namespaceId') namespaceId: string,
    @Param('resourceId') resourceId: string,
    @Body() dto: UpdateRssFolderRequestDto,
  ): Promise<RssFolderResponseDto> {
    return await this.rssFoldersService.update(
      userId,
      namespaceId,
      resourceId,
      dto,
    );
  }
}
