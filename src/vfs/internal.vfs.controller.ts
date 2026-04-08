import { Body, Controller, Get, Param, Put, Query } from '@nestjs/common';
import { VFSService } from 'omniboxd/vfs/vfs.service';
import { Public } from 'omniboxd/auth';
import { VFSFilterResourcesRequestDto } from 'omniboxd/vfs/dto/filter.request.dto';
import { HeaderUserId } from 'omniboxd/decorators/header-user-id.decorator';

@Controller('internal/api/v1/namespaces/:namespaceId/vfs')
export class InternalVFSController {
  constructor(private readonly vfsService: VFSService) {}

  @Public()
  @Get('list')
  async listChildrenByPath(
    @Param('namespaceId') namespaceId: string,
    @HeaderUserId() userId: string,
    @Query('path') path: string,
  ) {
    return await this.vfsService.listChildrenByPath(namespaceId, userId, path);
  }

  @Public()
  @Get()
  async getContentByPath(
    @Param('namespaceId') namespaceId: string,
    @HeaderUserId() userId: string,
    @Query('path') path: string,
  ) {
    return await this.vfsService.getContentByPath(namespaceId, userId, path);
  }

  @Public()
  @Put()
  async createByPath(
    @Param('namespaceId') namespaceId: string,
    @HeaderUserId() userId: string,
    @Body('path') path: string,
    @Body('content') content: string,
  ) {
    return await this.vfsService.createByPath(
      namespaceId,
      userId,
      path,
      content,
    );
  }

  @Public()
  @Get('filter')
  async resourceFilter(
    @Param('namespaceId') namespaceId: string,
    @HeaderUserId() userId: string,
    @Query() requestDto: VFSFilterResourcesRequestDto,
  ) {
    return await this.vfsService.resourceFilter(
      namespaceId,
      userId,
      requestDto,
    );
  }
}
