import {
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  Param,
  Patch,
  Req,
} from '@nestjs/common';
import { PermissionsService } from './permissions.service';
import { PermissionDto } from './dto/permission.dto';

@Controller('api/v1/namespaces/:namespaceId/resources/:resourceId/permissions')
export class PermissionsController {
  constructor(private readonly permissionsService: PermissionsService) {}

  @Get()
  async listPermissions(
    @Req() req,
    @Param('namespaceId') namespaceId: string,
    @Param('resourceId') resourceId: string,
  ) {
    const hasPermission = await this.permissionsService.userHasPermission(
      namespaceId,
      resourceId,
      req.user.id,
    );
    if (!hasPermission) {
      throw new ForbiddenException('Not authorized');
    }
    return await this.permissionsService.listPermissions(
      namespaceId,
      resourceId,
      req.user.id,
    );
  }

  @Patch()
  async updateGlobalPermission(
    @Req() req,
    @Param('namespaceId') namespaceId: string,
    @Param('resourceId') resourceId: string,
    @Body() permissionDto: PermissionDto,
  ) {
    const hasPermission = await this.permissionsService.userHasPermission(
      namespaceId,
      resourceId,
      req.user.id,
    );
    if (!hasPermission) {
      throw new ForbiddenException('Not authorized');
    }
    await this.permissionsService.updateGlobalPermission(
      namespaceId,
      resourceId,
      permissionDto,
    );
  }

  @Patch('groups/:groupId')
  async updateGroupPermission(
    @Req() req,
    @Param('namespaceId') namespaceId: string,
    @Param('resourceId') resourceId: string,
    @Param('groupId') groupId: string,
    @Body() permissionDto: PermissionDto,
  ) {
    const hasPermission = await this.permissionsService.userHasPermission(
      namespaceId,
      resourceId,
      req.user.id,
    );
    if (!hasPermission) {
      throw new ForbiddenException('Not authorized');
    }
    await this.permissionsService.updateGroupPermission(
      namespaceId,
      resourceId,
      groupId,
      permissionDto.permission,
    );
  }

  @Delete('groups/:groupId')
  async deleteGroupPermission(
    @Req() req,
    @Param('namespaceId') namespaceId: string,
    @Param('resourceId') resourceId: string,
    @Param('groupId') groupId: string,
  ) {
    const hasPermission = await this.permissionsService.userHasPermission(
      namespaceId,
      resourceId,
      req.user.id,
    );
    if (!hasPermission) {
      throw new ForbiddenException('Not authorized');
    }
    await this.permissionsService.deleteGroupPermission(
      namespaceId,
      resourceId,
      groupId,
    );
  }

  @Patch('users/:userId')
  async updateUserPermission(
    @Req() req,
    @Param('namespaceId') namespaceId: string,
    @Param('resourceId') resourceId: string,
    @Param('userId') userId: string,
    @Body() permissionDto: PermissionDto,
  ) {
    const hasPermission = await this.permissionsService.userHasPermission(
      namespaceId,
      resourceId,
      req.user.id,
    );
    if (!hasPermission) {
      throw new ForbiddenException('Not authorized');
    }
    await this.permissionsService.updateUserPermission(
      namespaceId,
      resourceId,
      userId,
      permissionDto.permission,
    );
  }

  @Delete('users/:userId')
  async deleteUserPermission(
    @Req() req,
    @Param('namespaceId') namespaceId: string,
    @Param('resourceId') resourceId: string,
    @Param('userId') userId: string,
  ) {
    const hasPermission = await this.permissionsService.userHasPermission(
      namespaceId,
      resourceId,
      req.user.id,
    );
    if (!hasPermission) {
      throw new ForbiddenException('Not authorized');
    }
    await this.permissionsService.deleteUserPermission(
      namespaceId,
      resourceId,
      userId,
    );
  }
}
