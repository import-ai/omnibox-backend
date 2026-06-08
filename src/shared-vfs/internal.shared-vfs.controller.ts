import { Controller, Get, Query, UseInterceptors } from '@nestjs/common';
import { Public } from 'omniboxd/auth';
import {
  ValidatedShare,
  ValidateShare,
} from 'omniboxd/decorators/validate-share.decorator';
import { ValidateShareInterceptor } from 'omniboxd/interceptor/validate-share.interceptor';
import { Share } from 'omniboxd/shares/entities/share.entity';
import { VFSFilterResourcesRequestDto } from 'omniboxd/vfs/dto/filter.request.dto';
import { FilterResponseDto } from 'omniboxd/vfs/dto/filter.response.dto';
import { GetResponseDto } from 'omniboxd/vfs/dto/get.response.dto';
import { ListResponseDto } from 'omniboxd/vfs/dto/list.response.dto';

import { SharedVfsResourceResponseDto } from './dto/shared-vfs.resource.response.dto';
import { SharedVfsService } from './shared-vfs.service';

@Controller('internal/api/v1/shares/:shareId/vfs')
@UseInterceptors(ValidateShareInterceptor)
export class InternalSharedVfsController {
  constructor(private readonly sharedVfsService: SharedVfsService) {}

  @Public()
  @ValidateShare()
  @Get('list')
  async listChildrenByPath(
    @ValidatedShare() share: Share,
    @Query('path') path: string,
    @Query('offset') offset: number = 0,
    @Query('limit') limit: number = 20,
  ): Promise<ListResponseDto> {
    return await this.sharedVfsService.listChildrenByPath(
      share,
      path,
      offset,
      limit,
    );
  }

  @Public()
  @ValidateShare()
  @Get('content')
  async getContentByPath(
    @ValidatedShare() share: Share,
    @Query('path') path: string,
  ): Promise<GetResponseDto> {
    return await this.sharedVfsService.getContentByPath(share, path);
  }

  @Public()
  @ValidateShare()
  @Get()
  async getVfsResourceByPath(
    @ValidatedShare() share: Share,
    @Query('path') path: string,
  ): Promise<SharedVfsResourceResponseDto> {
    return await this.sharedVfsService.getVfsResourceByPath(share, path);
  }

  @Public()
  @ValidateShare()
  @Get('filter')
  async resourceFilter(
    @ValidatedShare() share: Share,
    @Query() requestDto: VFSFilterResourcesRequestDto,
  ): Promise<FilterResponseDto> {
    return await this.sharedVfsService.resourceFilter(share, requestDto);
  }

  @Public()
  @ValidateShare()
  @Get('path')
  async getPathByResourceId(
    @ValidatedShare() share: Share,
    @Query('resource_id') resourceId: string,
  ): Promise<{ path: string }> {
    return await this.sharedVfsService.getPathByResourceId(share, resourceId);
  }
}
