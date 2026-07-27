import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import { UserId } from 'omniboxd/decorators/user-id.decorator';
import { CheckNamespaceReadonly } from 'omniboxd/namespaces/decorators/check-storage-quota.decorator';
import { CreateRssFolderRequestDto } from 'omniboxd/rss/dto/create-rss-folder-request.dto';
import { RssFolderResponseDto } from 'omniboxd/rss/dto/rss-folder-response.dto';
import { UpdateRssFolderRequestDto } from 'omniboxd/rss/dto/update-rss-folder-request.dto';
import { RssFoldersService } from 'omniboxd/rss/rss-folders.service';

@Controller('api/v1/namespaces/:namespaceId/rss-folders')
export class RssFoldersController {
  constructor(private readonly rssFoldersService: RssFoldersService) {}

  @Post()
  @CheckNamespaceReadonly()
  async create(
    @UserId() userId: string,
    @Param('namespaceId') namespaceId: string,
    @Body() dto: CreateRssFolderRequestDto,
  ): Promise<RssFolderResponseDto> {
    return await this.rssFoldersService.create(userId, namespaceId, dto);
  }

  @Get(':resourceId/config')
  async get(
    @UserId() userId: string,
    @Param('namespaceId') namespaceId: string,
    @Param('resourceId') resourceId: string,
  ): Promise<RssFolderResponseDto> {
    return await this.rssFoldersService.get(userId, namespaceId, resourceId);
  }

  @Patch(':resourceId/config')
  @CheckNamespaceReadonly()
  async update(
    @UserId() userId: string,
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

  @Delete(':resourceId')
  @CheckNamespaceReadonly()
  async delete(
    @UserId() userId: string,
    @Param('namespaceId') namespaceId: string,
    @Param('resourceId') resourceId: string,
  ): Promise<void> {
    await this.rssFoldersService.delete(userId, namespaceId, resourceId);
  }
}
