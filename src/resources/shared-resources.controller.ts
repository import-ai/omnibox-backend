import { Controller, Get, NotFoundException, Param } from '@nestjs/common';
import { ResourcesService } from './resources.service';
import { Public } from 'omniboxd/auth/decorators/public.decorator';
import { SharesService } from 'omniboxd/shares/shares.service';
import { ResourceDto } from './dto/resource.dto';

@Controller('api/v1/shares/:shareId/resources')
export class SharedResourcesController {
  constructor(
    private readonly resourcesService: ResourcesService,
    private readonly sharesService: SharesService,
  ) {}

  @Public()
  @Get(':resourceId')
  async getResource(
    @Param('shareId') shareId: string,
    @Param('resourceId') resourceId: string,
  ): Promise<ResourceDto> {
    const share = await this.sharesService.getShareById(shareId);
    if (!share) {
      throw new NotFoundException(`No share found with id ${shareId}`);
    }
    const resource = await this.resourcesService.get(resourceId);
    if (!resource || resource.namespaceId != share.namespaceId) {
      throw new NotFoundException(`No resource found with id ${resourceId}`);
    }
    if (resource.id !== share.resourceId) {
      const parents = await this.resourcesService.getParentResources(
        share.namespaceId,
        resource.parentId,
      );
      if (!parents.map((r) => r.id).includes(share.resourceId)) {
        throw new NotFoundException(`No resource found with id ${resourceId}`);
      }
    }
    return ResourceDto.fromEntity(resource);
  }
}
