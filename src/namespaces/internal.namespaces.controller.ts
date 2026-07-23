import { Controller, Get, Param } from '@nestjs/common';
import { Public } from 'omniboxd/auth/decorators/public.auth.decorator';
import { HeaderUserId } from 'omniboxd/decorators/header-user-id.decorator';
import { NamespaceResourcesService } from 'omniboxd/namespace-resources/namespace-resources.service';
import { CurrentInfoService } from 'omniboxd/namespaces/current-info.service';
import { CurrentInfoResponseDto } from 'omniboxd/namespaces/dto/current-info-response.dto';
import { NamespacesService } from 'omniboxd/namespaces/namespaces.service';

@Controller('internal/api/v1/namespaces/:namespaceId')
export class InternalNamespacesController {
  constructor(
    private readonly namespacesService: NamespacesService,
    private readonly namespaceResourcesService: NamespaceResourcesService,
    private readonly currentInfoService: CurrentInfoService,
  ) {}

  @Public()
  @Get('info')
  async getInfo(
    @Param('namespaceId') namespaceId: string,
    @HeaderUserId() userId: string,
  ): Promise<CurrentInfoResponseDto> {
    return await this.currentInfoService.getCurrentInfo(userId, namespaceId);
  }

  @Public()
  @Get('roots')
  async getRoots(
    @Param('namespaceId') namespaceId: string,
    @HeaderUserId() userId: string,
  ) {
    const privateRoot = await this.namespacesService.getPrivateRoot(
      userId,
      namespaceId,
    );
    const teamspaceRoot =
      await this.namespacesService.getTeamspaceRoot(namespaceId);
    const [privateHasChildren, teamspaceHasChildren] = await Promise.all([
      this.namespaceResourcesService.hasChildren(
        userId,
        namespaceId,
        privateRoot.id,
      ),
      this.namespaceResourcesService.hasChildren(
        userId,
        namespaceId,
        teamspaceRoot.id,
      ),
    ]);
    return {
      private: {
        id: privateRoot.id,
        name: privateRoot.name,
        has_children: privateHasChildren,
      },
      teamspace: {
        id: teamspaceRoot.id,
        name: teamspaceRoot.name,
        has_children: teamspaceHasChildren,
      },
    };
  }
}
