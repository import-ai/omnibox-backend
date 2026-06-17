import { Body, Controller, Delete, Param, Patch, Req } from '@nestjs/common';
import { PermissionDto } from 'omniboxd/permissions/dto/permission.dto';

import { NamespacesService } from './namespaces.service';

@Controller('api/v1/namespaces/:namespaceId/permissions')
export class NamespacePermissionsController {
  constructor(private readonly namespacesService: NamespacesService) {}

  @Patch('users/:userId')
  async updateUserPermission(
    @Req() req,
    @Param('namespaceId') namespaceId: string,
    @Param('userId') userId: string,
    @Body() permissionDto: PermissionDto,
  ) {
    await this.namespacesService.updateUserPermission(
      namespaceId,
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
    await this.namespacesService.deleteUserPermission(
      namespaceId,
      req.user.id,
      userId,
    );
  }
}
