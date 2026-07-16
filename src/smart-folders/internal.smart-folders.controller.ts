import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import { Public } from 'omniboxd/auth/decorators/public.auth.decorator';
import { HeaderUserId } from 'omniboxd/decorators/header-user-id.decorator';
import { CheckNamespaceReadonly } from 'omniboxd/namespaces/decorators/check-storage-quota.decorator';
import { CreateSmartFolderRequestDto } from 'omniboxd/smart-folders/dto/create-smart-folder-request.dto';
import { UpdateSmartFolderRequestDto } from 'omniboxd/smart-folders/dto/update-smart-folder-request.dto';
import { SmartFoldersService } from 'omniboxd/smart-folders/smart-folders.service';

@Controller('internal/api/v1/namespaces/:namespaceId/smart-folders')
export class InternalSmartFoldersController {
  constructor(private readonly smartFoldersService: SmartFoldersService) {}

  @Public()
  @Post()
  @CheckNamespaceReadonly()
  async create(
    @HeaderUserId() userId: string,
    @Param('namespaceId') namespaceId: string,
    @Body() dto: CreateSmartFolderRequestDto,
  ) {
    return await this.smartFoldersService.create(userId, namespaceId, dto);
  }

  @Public()
  @Get(':resourceId/config')
  async getConfig(
    @HeaderUserId() userId: string,
    @Param('namespaceId') namespaceId: string,
    @Param('resourceId') resourceId: string,
  ) {
    return await this.smartFoldersService.get(userId, namespaceId, resourceId);
  }

  @Public()
  @Patch(':resourceId/config')
  @CheckNamespaceReadonly()
  async updateConfig(
    @HeaderUserId() userId: string,
    @Param('namespaceId') namespaceId: string,
    @Param('resourceId') resourceId: string,
    @Body() dto: UpdateSmartFolderRequestDto,
  ) {
    return await this.smartFoldersService.update(
      userId,
      namespaceId,
      resourceId,
      dto,
    );
  }
}
