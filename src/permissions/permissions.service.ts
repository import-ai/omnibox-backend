import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Permission } from './permissions.entity';
import { Repository, IsNull } from 'typeorm';
import { PermissionDto } from './dto/permission.dto';
import { ResourcesService } from 'src/resources/resources.service';

@Injectable()
export class PermissionsService {
  constructor(
    @InjectRepository(Permission)
    private readonly permissionRepository: Repository<Permission>,
    private readonly resourcesService: ResourcesService,
  ) {}

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
        read: permission.read,
        write: permission.write,
        comment: permission.comment,
        share: permission.share,
        noAccess: permission.noAccess,
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
        read: permission.read,
        write: permission.write,
        comment: permission.comment,
        share: permission.share,
        noAccess: permission.noAccess,
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
        read: permission.read,
        write: permission.write,
        comment: permission.comment,
        share: permission.share,
        noAccess: permission.noAccess,
      },
      ['namespaceId', 'resourceId', 'userId'],
    );
  }
}
