import * as bcrypt from 'bcrypt';
import {
  Controller,
  ForbiddenException,
  Get,
  Headers,
  NotFoundException,
  Param,
} from '@nestjs/common';
import { ResourcesService } from './resources.service';
import { SharesService } from 'omniboxd/shares/shares.service';
import { SharedResourceDto } from './dto/resource.dto';
import { Public } from 'omniboxd/auth/decorators/public.auth.decorator';

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
    @Headers('X-OmniBox-Share-Password') password: string,
  ): Promise<SharedResourceDto> {
    const share = await this.sharesService.getShareById(shareId);
    if (!share || !share.enabled) {
      throw new NotFoundException(`No share found with id ${shareId}`);
    }
    if (share.password) {
      if (!password) {
        throw new ForbiddenException(`Invalid password for share ${shareId}`);
      }
      const match = await bcrypt.compare(password, share.password);
      if (!match) {
        throw new ForbiddenException(`Invalid password for share ${shareId}`);
      }
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
    return SharedResourceDto.fromEntity(resource);
  }
}
