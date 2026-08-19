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

// Viewer-side read path for a shared rss folder's items. Items are the folder's
// content (not resources), so they are authorized purely by the folder's share
// via SharedResourcesService.getAndValidateResource — no per-item share exists,
// which is why individual items are not independently shareable.
@Controller('api/v1/shares/:shareId/resources/:resourceId/rss-items')
@UseInterceptors(ValidateShareInterceptor)
export class SharedRssFoldersController {
  constructor(
    private readonly sharedResourcesService: SharedResourcesService,
    private readonly rssFoldersService: RssFoldersService,
  ) {}

  @CookieAuth({ onAuthFail: 'continue' })
  @ValidateShare({ requireResources: true })
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
  @ValidateShare({ requireResources: true })
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
