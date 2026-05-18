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
import { CheckNamespaceReadonly } from 'omniboxd/namespaces/decorators/check-storage-quota.decorator';
import { ResourceSummaryDto } from 'omniboxd/namespace-resources/dto/resource-summary.dto';
import { UserId } from 'omniboxd/decorators/user-id.decorator';
import { CreateSmartFolderRequestDto } from 'omniboxd/smart-folders/dto/create-smart-folder-request.dto';
import { SmartFolderResponseDto } from 'omniboxd/smart-folders/dto/smart-folder-response.dto';
import { UpdateSmartFolderRequestDto } from 'omniboxd/smart-folders/dto/update-smart-folder-request.dto';
import { SmartFoldersService } from 'omniboxd/smart-folders/smart-folders.service';

@Controller('api/v1/namespaces/:namespaceId/smart-folders')
export class SmartFoldersController {
  constructor(private readonly smartFoldersService: SmartFoldersService) {}

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
  ): Promise<ResourceSummaryDto[]> {
    return await this.smartFoldersService.listChildren(
      userId,
      namespaceId,
      resourceId,
      {
        limit: Number.isFinite(Number(limit)) ? Number(limit) : 20,
        offset: Number.isFinite(Number(offset)) ? Number(offset) : 0,
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
