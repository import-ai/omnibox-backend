import { Body, Controller, Get, Param, Patch, Req } from '@nestjs/common';
import { PermissionsService } from './permissions.service';
import { PermissionDto } from './dto/permission.dto';
import { plainToInstance } from 'class-transformer';

@Controller('api/v1/namespaces/:namespaceId/resources/:resourceId/permissions')
export class PermissionsController {
  constructor(private readonly permissionsService: PermissionsService) {}

  @Get()
  async listPermissions(
    @Req() req,
    @Param('namespaceId') namespaceId: string,
    @Param('resourceId') resourceId: string,
  ) {
    return await this.permissionsService.listPermissions(
      namespaceId,
      resourceId,
    );
  }

  @Patch()
  async updateGlobalPermission(
    @Req() req,
    @Param('namespaceId') namespaceId: string,
    @Param('resourceId') resourceId: string,
    @Body() permissionDto: PermissionDto,
  ) {
    await this.permissionsService.updateNamespacePermission(
      resourceId,
      permissionDto,
    );
  }

  @Get('groups/:groupId')
  async getGroupPermission(
    @Req() req,
    @Param('namespaceId') namespaceId: string,
    @Param('resourceId') resourceId: string,
    @Param('groupId') groupId: string,
  ) {
    const permission = await this.permissionsService.getGroupPermission(
      resourceId,
      groupId,
    );
    if (permission === null) {
      return plainToInstance(PermissionDto, {
        read: false,
        write: false,
        comment: false,
        share: false,
        noAccess: false,
      });
    }
    return plainToInstance(PermissionDto, permission);
  }

  @Patch('groups/:groupId')
  async updateGroupPermission(
    @Req() req,
    @Param('namespaceId') namespaceId: string,
    @Param('resourceId') resourceId: string,
    @Param('groupId') groupId: string,
    @Body() permissionDto: PermissionDto,
  ) {
    await this.permissionsService.updateGroupPermission(
      resourceId,
      groupId,
      permissionDto,
    );
  }

  @Get('users/:userId')
  async getUserPermission(
    @Req() req,
    @Param('namespaceId') namespaceId: string,
    @Param('resourceId') resourceId: string,
    @Param('userId') userId: string,
  ) {
    const permission = await this.permissionsService.getGroupPermission(
      resourceId,
      userId,
    );
    if (permission === null) {
      return plainToInstance(PermissionDto, {
        read: false,
        write: false,
        comment: false,
        share: false,
        noAccess: false,
      });
    }
    return plainToInstance(PermissionDto, permission);
  }

  @Patch('users/:userId')
  async updateUserPermission(
    @Req() req,
    @Param('namespaceId') namespaceId: string,
    @Param('resourceId') resourceId: string,
    @Param('userId') userId: string,
    @Body() permissionDto: PermissionDto,
  ) {
    await this.permissionsService.updateGroupPermission(
      resourceId,
      userId,
      permissionDto,
    );
  }
}
