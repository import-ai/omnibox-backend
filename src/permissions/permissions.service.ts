import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Permission } from './permissions.entity';
import { Repository, IsNull } from 'typeorm';
import { ResourcesService } from 'src/resources/resources.service';
import { PermissionDto } from './dto/permission.dto';
import {
  GroupPermissionDto,
  ListRespDto,
  UserPermissionDto,
} from './dto/list-resp.dto';
import { plainToInstance } from 'class-transformer';

@Injectable()
export class PermissionsService {
  constructor(
    @InjectRepository(Permission)
    private readonly permissionRepository: Repository<Permission>,
    private readonly resourcesService: ResourcesService,
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

  async updateNamespacePermission(
    resourceId: string,
    permission: PermissionDto,
  ) {
    const resource = await this.resourcesService.get(resourceId);
    await this.permissionRepository.upsert(
      {
        namespaceId: resource.namespace.id,
        resourceId,
        permissionType: permission.permission,
      },
      ['namespaceId', 'resourceId'],
    );
  }

  async getGroupPermission(
    resourceId: string,
    groupId: string,
  ): Promise<Permission | null> {
    return await this.permissionRepository.findOne({
      where: { resourceId, groupId, userId: IsNull() },
    });
  }

  async updateGroupPermission(
    resourceId: string,
    groupId: string,
    permission: PermissionDto,
  ) {
    const resource = await this.resourcesService.get(resourceId);
    await this.permissionRepository.upsert(
      {
        namespaceId: resource.namespace.id,
        resourceId,
        groupId,
        permissionType: permission.permission,
      },
      ['namespaceId', 'resourceId', 'groupId'],
    );
  }

  async getUserPermission(
    resourceId: string,
    userId: string,
  ): Promise<Permission | null> {
    return await this.permissionRepository.findOne({
      where: { resourceId, groupId: IsNull(), userId },
    });
  }

  async updateUserPermission(
    resourceId: string,
    userId: string,
    permission: PermissionDto,
  ) {
    const resource = await this.resourcesService.get(resourceId);
    await this.permissionRepository.upsert(
      {
        namespaceId: resource.namespace.id,
        resourceId,
        userId,
        permissionType: permission.permission,
      },
      ['namespaceId', 'resourceId', 'userId'],
    );
  }
}
