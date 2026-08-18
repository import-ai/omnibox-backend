import {
  Body,
  Controller,
  Delete,
  Get,
  HttpStatus,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { I18nService } from 'nestjs-i18n';
import { AppException } from 'omniboxd/common/exceptions/app.exception';
import { UserId } from 'omniboxd/decorators/user-id.decorator';
import { CheckNamespaceReadonly } from 'omniboxd/namespaces/decorators/check-storage-quota.decorator';
import { PermissionsService } from 'omniboxd/permissions/permissions.service';
import { CreateRssFolderRequestDto } from 'omniboxd/rss/dto/create-rss-folder-request.dto';
import { RssFolderLimitsResponseDto } from 'omniboxd/rss/dto/rss-folder-limits-response.dto';
import { RssFolderResponseDto } from 'omniboxd/rss/dto/rss-folder-response.dto';
import { RssItemDetailResponseDto } from 'omniboxd/rss/dto/rss-item-detail-response.dto';
import { RssItemResponseDto } from 'omniboxd/rss/dto/rss-item-response.dto';
import { UpdateRssFolderRequestDto } from 'omniboxd/rss/dto/update-rss-folder-request.dto';
import { RssFoldersService } from 'omniboxd/rss/rss-folders.service';

@Controller('api/v1/namespaces/:namespaceId/rss-folders')
export class RssFoldersController {
  constructor(
    private readonly rssFoldersService: RssFoldersService,
    private readonly permissionsService: PermissionsService,
    private readonly i18n: I18nService,
  ) {}

  @Get('limits')
  async getLimits(
    @UserId() userId: string,
    @Param('namespaceId') namespaceId: string,
  ): Promise<RssFolderLimitsResponseDto> {
    const allowed = await this.permissionsService.userInNamespace(
      userId,
      namespaceId,
    );
    if (!allowed) {
      const message = this.i18n.t('auth.errors.notAuthorized');
      throw new AppException(message, 'NOT_AUTHORIZED', HttpStatus.FORBIDDEN);
    }

    return await this.rssFoldersService.getLimits(namespaceId, userId);
  }

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

  @Get(':resourceId/items')
  async listItems(
    @UserId() userId: string,
    @Param('namespaceId') namespaceId: string,
    @Param('resourceId') resourceId: string,
    @Query('limit', new ParseIntPipe({ optional: true })) limit?: number,
    @Query('offset', new ParseIntPipe({ optional: true })) offset?: number,
  ): Promise<RssItemResponseDto[]> {
    return await this.rssFoldersService.listItems(
      userId,
      namespaceId,
      resourceId,
      limit,
      offset,
    );
  }

  @Get(':resourceId/items/:itemId')
  async getItem(
    @UserId() userId: string,
    @Param('namespaceId') namespaceId: string,
    @Param('resourceId') resourceId: string,
    @Param('itemId') itemId: string,
  ): Promise<RssItemDetailResponseDto> {
    return await this.rssFoldersService.getItem(
      userId,
      namespaceId,
      resourceId,
      itemId,
    );
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
