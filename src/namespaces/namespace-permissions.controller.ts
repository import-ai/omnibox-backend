import { Body, Controller, Delete, Param, Patch, Req } from '@nestjs/common';
import { PermissionDto } from 'omniboxd/permissions/dto/permission.dto';
import { PermissionsService } from 'omniboxd/permissions/permissions.service';

import { NamespacesService } from './namespaces.service';

@Controller('api/v1/namespaces/:namespaceId/permissions')
export class NamespacePermissionsController {
  constructor(
    private readonly permissionsService: PermissionsService,
    private readonly namespacesService: NamespacesService,
  ) {}

  @Patch('users/:userId')
  async updateUserPermission(
    @Req() req,
    @Param('namespaceId') namespaceId: string,
    @Param('userId') userId: string,
    @Body() permissionDto: PermissionDto,
  ) {
    const { id: resourceId } =
      await this.namespacesService.getTeamspaceRoot(namespaceId);
    await this.permissionsService.updateUserPermissionWithChecks(
      namespaceId,
      resourceId,
      req.user.id,
      userId,
      permissionDto.permission,
    );
  }

  @Delete('users/:userId')
  async deleteUserPermission(
    @Req() req,
    @Param('namespaceId') namespaceId: string,
    @Param('userId') userId: string,
  ) {
    const { id: resourceId } =
      await this.namespacesService.getTeamspaceRoot(namespaceId);
    await this.permissionsService.deleteUserPermissionWithChecks(
      namespaceId,
      resourceId,
      req.user.id,
      userId,
    );
  }
}
