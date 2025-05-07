import { Body, Controller, Get, Param, Patch, Req } from '@nestjs/common';
import { PermissionsService } from './permissions.service';
import { PermissionDto } from './dto/permission.dto';
import { plainToInstance } from 'class-transformer';
import { group } from 'console';

@Controller('api/v1/resources/:resourceId/permissions')
export class PermissionsController {
  constructor(private readonly permissionsService: PermissionsService) {}

  @Get()
  async getNamespacePermission(
    @Req() req,
    @Param('resourceId') resourceId: string,
  ) {
    const permission =
      await this.permissionsService.getNamespacePermission(resourceId);
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

  @Patch()
  async updateNamespacePermission(
    @Req() req,
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
