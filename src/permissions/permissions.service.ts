import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, IsNull, Repository } from 'typeorm';
import { PermissionDto } from './dto/permission.dto';
import { ListRespDto } from './dto/list-resp.dto';
import { plainToInstance } from 'class-transformer';
import { PermissionLevel } from './permission-level.enum';
import { UserPermission } from './entities/user-permission.entity';
import { GroupPermission } from './entities/group-permission.entity';
import { ResourcesService } from 'src/resources/resources.service';

@Injectable()
export class PermissionsService {
  constructor(
    @InjectRepository(UserPermission)
    private readonly userPermiRepo: Repository<UserPermission>,
    @InjectRepository(GroupPermission)
    private readonly groupPermiRepo: Repository<GroupPermission>,
    private readonly dataSource: DataSource,
    private readonly resourceService: ResourcesService,
  ) {}

  async listPermissions(
    namespaceId: string,
    resourceId: string,
  ): Promise<ListRespDto> {
    const users = await this.userPermiRepo.find({
      where: { namespace: { id: namespaceId }, resource: { id: resourceId } },
      relations: ['user'],
    });
    const groups = await this.groupPermiRepo.find({
      where: { namespace: { id: namespaceId }, resource: { id: resourceId } },
      relations: ['group'],
    });
    const globalLevel = await this.getGlobalPermissionLevel(
      namespaceId,
      resourceId,
    );
    return plainToInstance(
      ListRespDto,
      {
        users,
        groups,
        globalLevel,
      },
      { excludeExtraneousValues: true },
    );
  }

  async updateGlobalPermission(
    namespaceId: string,
    resourceId: string,
    permission: PermissionDto,
  ) {
    await this.resourceService.updateGlobalPermissionLevel(
      namespaceId,
      resourceId,
      permission.level,
    );
  }

  async updateGroupPermission(
    namespaceId: string,
    resourceId: string,
    groupId: string,
    permission: PermissionDto,
  ) {
    const level = permission.level;
    await this.dataSource.transaction(async (manager) => {
      const result = await manager.update(
        GroupPermission,
        {
          namespace: { id: namespaceId },
          resource: { id: resourceId },
          group: { id: groupId },
          deletedAt: IsNull(),
        },
        { level },
      );
      if (result.affected === 0) {
        await manager.save(
          manager.create(GroupPermission, {
            namespace: { id: namespaceId },
            resource: { id: resourceId },
            group: { id: groupId },
            level,
          }),
        );
      }
    });
  }

  async deleteGroupPermission(
    namespaceId: string,
    resourceId: string,
    groupId: string,
  ) {
    await this.groupPermiRepo.delete({
      namespace: { id: namespaceId },
      resource: { id: resourceId },
      group: { id: groupId },
    });
  }

  async getUserPermissionLevel(
    namespaceId: string,
    resourceId: string,
    userId: string,
  ): Promise<PermissionLevel> {
    let permission: UserPermission | null = null;
    while (true) {
      permission = await this.userPermiRepo.findOne({
        where: {
          namespace: { id: namespaceId },
          resource: { id: resourceId },
          user: { id: userId },
        },
      });
      if (permission) {
        break;
      }
      const parentId = await this.resourceService.getParentId(
        namespaceId,
        resourceId,
      );
      if (!parentId) {
        break;
      }
      resourceId = parentId;
    }
    const level = permission ? permission.level : PermissionLevel.NO_ACCESS;
    return level;
  }

  async getGroupPermissionLevel(
    namespaceId: string,
    resourceId: string,
    groupId: string,
  ): Promise<PermissionLevel> {
    let permission: GroupPermission | null = null;
    while (true) {
      permission = await this.groupPermiRepo.findOne({
        where: {
          namespace: { id: namespaceId },
          resource: { id: resourceId },
          group: { id: groupId },
        },
      });
      if (permission) {
        break;
      }
      const parentId = await this.resourceService.getParentId(
        namespaceId,
        resourceId,
      );
      if (!parentId) {
        break;
      }
      resourceId = parentId;
    }
    const level = permission ? permission.level : PermissionLevel.NO_ACCESS;
    return level;
  }

  async getGlobalPermissionLevel(
    namespaceId: string,
    resourceId: string,
  ): Promise<PermissionLevel> {
    let level: PermissionLevel | null = null;
    while (true) {
      level = await this.resourceService.getGlobalPermissionLevel(
        namespaceId,
        resourceId,
      );
      if (level) {
        break;
      }
      const parentId = await this.resourceService.getParentId(
        namespaceId,
        resourceId,
      );
      if (!parentId) {
        break;
      }
      resourceId = parentId;
    }
    level = level || PermissionLevel.NO_ACCESS;
    return level;
  }

  async updateUserPermission(
    namespaceId: string,
    resourceId: string,
    userId: string,
    permission: PermissionDto,
  ) {
    const level = permission.level;
    await this.dataSource.transaction(async (manager) => {
      const result = await manager.update(
        UserPermission,
        {
          namespace: { id: namespaceId },
          resource: { id: resourceId },
          user: { id: userId },
          deletedAt: IsNull(),
        },
        { level },
      );
      if (result.affected === 0) {
        await manager.save(
          manager.create(UserPermission, {
            namespace: { id: namespaceId },
            resource: { id: resourceId },
            user: { id: userId },
            level,
          }),
        );
      }
    });
  }

  async deleteUserPermission(
    namespaceId: string,
    resourceId: string,
    userId: string,
  ) {
    await this.userPermiRepo.delete({
      namespace: { id: namespaceId },
      resource: { id: resourceId },
      user: { id: userId },
    });
  }
}
