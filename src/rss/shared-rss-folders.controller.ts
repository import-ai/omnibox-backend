import {
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Query,
  UseInterceptors,
} from '@nestjs/common';
import { CookieAuth } from 'omniboxd/auth/decorators';
import {
  ValidatedShare,
  ValidateShare,
} from 'omniboxd/decorators/validate-share.decorator';
import { ValidateShareInterceptor } from 'omniboxd/interceptor/validate-share.interceptor';
import { RssItemDetailResponseDto } from 'omniboxd/rss/dto/rss-item-detail-response.dto';
import { RssItemResponseDto } from 'omniboxd/rss/dto/rss-item-response.dto';
import { RssFoldersService } from 'omniboxd/rss/rss-folders.service';
import { SharedResourcesService } from 'omniboxd/shared-resources/shared-resources.service';
import { Share } from 'omniboxd/shares/entities/share.entity';

// Viewer-side read path for a shared rss folder's items, retained for older
// clients (an item is a resource now, so the generic shared-resource endpoints
// serve it too). Authorization is unchanged: the items are reached purely
// through the folder's share via
// SharedResourcesService.getAndValidateResource, and the service then looks
// items up under that folder, so an item is visible only when the share covers
// its parent rss folder. There is still no per-item share — individual items
// are not independently shareable.
@Controller('api/v1/shares/:shareId/resources/:resourceId/rss-items')
@UseInterceptors(ValidateShareInterceptor)
export class SharedRssFoldersController {
  constructor(
    private readonly sharedResourcesService: SharedResourcesService,
    private readonly rssFoldersService: RssFoldersService,
  ) {}

  @CookieAuth({ onAuthFail: 'continue' })
  @ValidateShare()
  @Get()
  async listItems(
    @Param('resourceId') resourceId: string,
    @ValidatedShare() share: Share,
    @Query('limit', new ParseIntPipe({ optional: true })) limit?: number,
    @Query('offset', new ParseIntPipe({ optional: true })) offset?: number,
  ): Promise<RssItemResponseDto[]> {
    // Authorizes that this resource is reachable through the share (throws
    // RESOURCE_NOT_FOUND otherwise); getRssFolderOrFail inside the service
    // rejects non-rss resources.
    await this.sharedResourcesService.getAndValidateResource(share, resourceId);
    return await this.rssFoldersService.listFolderItems(
      share.namespaceId,
      resourceId,
      limit,
      offset,
    );
  }

  @CookieAuth({ onAuthFail: 'continue' })
  @ValidateShare()
  @Get(':itemId')
  async getItem(
    @Param('resourceId') resourceId: string,
    @Param('itemId') itemId: string,
    @ValidatedShare() share: Share,
  ): Promise<RssItemDetailResponseDto> {
    await this.sharedResourcesService.getAndValidateResource(share, resourceId);
    return await this.rssFoldersService.getFolderItem(
      share.namespaceId,
      resourceId,
      itemId,
    );
  }
}
