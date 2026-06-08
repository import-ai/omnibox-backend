import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { UserId } from 'omniboxd/decorators/user-id.decorator';
import { ResourceSummaryDto } from 'omniboxd/namespace-resources/dto/resource-summary.dto';
import { CheckNamespaceReadonly } from 'omniboxd/namespaces/decorators/check-storage-quota.decorator';
import { CreateSmartFolderRequestDto } from 'omniboxd/smart-folders/dto/create-smart-folder-request.dto';
import { SmartFolderResponseDto } from 'omniboxd/smart-folders/dto/smart-folder-response.dto';
import { UpdateSmartFolderRequestDto } from 'omniboxd/smart-folders/dto/update-smart-folder-request.dto';
import { SmartFoldersService } from 'omniboxd/smart-folders/smart-folders.service';

@Controller('api/v1/namespaces/:namespaceId/smart-folders')
export class SmartFoldersController {
  constructor(private readonly smartFoldersService: SmartFoldersService) {}

  private parseChildrenLimit(limit?: string, requestFrom?: string) {
    if (Number.isFinite(Number(limit))) {
      return Number(limit);
    }

    return requestFrom === 'web' ? undefined : 20;
  }

  private parseChildrenOffset(offset?: string, requestFrom?: string) {
    if (Number.isFinite(Number(offset))) {
      return Number(offset);
    }

    return requestFrom === 'web' ? undefined : 0;
  }

  @Post()
  @CheckNamespaceReadonly()
  async create(
    @UserId() userId: string,
    @Param('namespaceId') namespaceId: string,
    @Body() dto: CreateSmartFolderRequestDto,
  ): Promise<SmartFolderResponseDto> {
    return await this.smartFoldersService.create(userId, namespaceId, dto);
  }

  @Get()
  async list(
    @UserId() userId: string,
    @Param('namespaceId') namespaceId: string,
    @Query('parentId') parentId?: string,
  ): Promise<SmartFolderResponseDto[]> {
    return await this.smartFoldersService.list(userId, namespaceId, parentId);
  }

  @Get(':resourceId/config')
  async get(
    @UserId() userId: string,
    @Param('namespaceId') namespaceId: string,
    @Param('resourceId') resourceId: string,
  ): Promise<SmartFolderResponseDto> {
    return await this.smartFoldersService.get(userId, namespaceId, resourceId);
  }

  @Get(':resourceId/children')
  async listChildren(
    @UserId() userId: string,
    @Param('namespaceId') namespaceId: string,
    @Param('resourceId') resourceId: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
    @Headers('from') requestFrom?: string,
  ): Promise<ResourceSummaryDto[]> {
    return await this.smartFoldersService.listChildren(
      userId,
      namespaceId,
      resourceId,
      {
        limit: this.parseChildrenLimit(limit, requestFrom),
        offset: this.parseChildrenOffset(offset, requestFrom),
      },
    );
  }

  @Patch(':resourceId/config')
  @CheckNamespaceReadonly()
  async update(
    @UserId() userId: string,
    @Param('namespaceId') namespaceId: string,
    @Param('resourceId') resourceId: string,
    @Body() dto: UpdateSmartFolderRequestDto,
  ): Promise<SmartFolderResponseDto> {
    return await this.smartFoldersService.update(
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
    await this.smartFoldersService.delete(userId, namespaceId, resourceId);
  }
}
