import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Permission } from './permissions.entity';
import { Repository, IsNull } from 'typeorm';
import { PermissionDto } from './dto/permission.dto';
import {
  GroupPermissionDto,
  ListRespDto,
  UserPermissionDto,
} from './dto/list-resp.dto';
import { plainToInstance } from 'class-transformer';
import { PermissionType } from './permission-type.enum';

@Injectable()
export class PermissionsService {
  constructor(
    @InjectRepository(Permission)
    private readonly permissionRepository: Repository<Permission>,
  ) {}

  async listPermissions(
    namespaceId: string,
    resourceId: string,
  ): Promise<ListRespDto> {
    const permissions = await this.permissionRepository.find({
      where: { namespaceId, resourceId },
      relations: ['user', 'group'],
    });
    const resp = new ListRespDto();
    for (const permission of permissions) {
      if (permission.user) {
        resp.entries.push(
          plainToInstance(UserPermissionDto, {
            user: permission.user,
            permission: permission.permissionType,
          }),
        );
      } else if (permission.group) {
        resp.entries.push(
          plainToInstance(GroupPermissionDto, {
            group: permission.group,
            permission: permission.permissionType,
          }),
        );
      } else {
        resp.globalPermission = permission.permissionType;
      }
    }
    return resp;
  }

  async getNamespacePermission(resourceId: string): Promise<Permission | null> {
    return await this.permissionRepository.findOne({
      where: { resourceId, groupId: IsNull(), userId: IsNull() },
    });
  }

  async updateGlobalPermission(
    namespaceId: string,
    resourceId: string,
    permission: PermissionDto,
  ) {
    await this.permissionRepository.upsert(
      {
        namespaceId,
        resourceId,
        permissionType: permission.permissionType,
      },
      ['namespaceId', 'resourceId'],
    );
  }

  async getGroupPermission(
    namespaceId: string,
    resourceId: string,
    groupId: string,
  ): Promise<PermissionDto> {
    const permission = await this.permissionRepository.findOne({
      where: { namespaceId, resourceId, groupId, userId: IsNull() },
    });
    const permissionType = permission
      ? permission.permissionType
      : PermissionType.FULL_ACCESS;
    return plainToInstance(PermissionDto, { permissionType });
  }

  async updateGroupPermission(
    namespaceId: string,
    resourceId: string,
    groupId: string,
    permission: PermissionDto,
  ) {
    await this.permissionRepository.upsert(
      {
        namespaceId,
        resourceId,
        groupId,
        permissionType: permission.permissionType,
      },
      ['namespaceId', 'resourceId', 'groupId'],
    );
  }

  async getUserPermission(
    namespaceId: string,
    resourceId: string,
    userId: string,
  ): Promise<PermissionDto> {
    const permission = await this.permissionRepository.findOne({
      where: { namespaceId, resourceId, groupId: IsNull(), userId },
    });
    const permissionType = permission
      ? permission.permissionType
      : PermissionType.FULL_ACCESS;
    return plainToInstance(PermissionDto, { permissionType });
  }

  async updateUserPermission(
    namespaceId: string,
    resourceId: string,
    userId: string,
    permission: PermissionDto,
  ) {
    await this.permissionRepository.upsert(
      {
        namespaceId,
        resourceId,
        userId,
        permissionType: permission.permissionType,
      },
      ['namespaceId', 'resourceId', 'userId'],
    );
  }
}
