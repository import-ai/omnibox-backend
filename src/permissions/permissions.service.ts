import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, IsNull, Repository } from 'typeorm';
import { PermissionDto } from './dto/permission.dto';
import { ListRespDto, UserPermissionDto } from './dto/list-resp.dto';
import { plainToInstance } from 'class-transformer';
import { PermissionLevel } from './permission-level.enum';
import { UserPermission } from './entities/user-permission.entity';
import { GroupPermission } from './entities/group-permission.entity';
import { Resource } from 'src/resources/resources.entity';
import { UserService } from 'src/user/user.service';
import { GroupUser } from 'src/groups/entities/group-user.entity';

@Injectable()
export class PermissionsService {
  constructor(
    @InjectRepository(UserPermission)
    private readonly userPermiRepo: Repository<UserPermission>,
    @InjectRepository(GroupPermission)
    private readonly groupPermiRepo: Repository<GroupPermission>,
    @InjectRepository(GroupUser)
    private readonly groupUserRepository: Repository<GroupUser>,
    @InjectRepository(Resource)
    private readonly resourceRepository: Repository<Resource>,
    private readonly dataSource: DataSource,
    private readonly userService: UserService,
  ) {}

  async listPermissions(
    namespaceId: string,
    resourceId: string,
    userId: string,
  ): Promise<ListRespDto> {
    const curPermi = await this.getUserPermission(
      namespaceId,
      resourceId,
      userId,
    );
    let userPermissions = await this.listUserPermissions(
      namespaceId,
      resourceId,
    );
    userPermissions = userPermissions.filter(
      (permission) => permission.user?.id !== userId,
    );
    const users = [
      curPermi,
      ...plainToInstance(UserPermissionDto, userPermissions),
    ];
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

  async listUserPermissions(
    namespaceId: string,
    resourceId: string,
  ): Promise<UserPermission[]> {
    const userIds = new Set<string>();
    const userPermissions: UserPermission[] = [];
    while (true) {
      const permissions = await this.userPermiRepo.find({
        where: {
          namespace: { id: namespaceId },
          resource: { id: resourceId },
          deletedAt: IsNull(),
        },
        relations: ['user'],
      });
      for (const permission of permissions) {
        const userId = permission.user!.id;
        if (!userIds.has(userId)) {
          userIds.add(userId);
          userPermissions.push(permission);
        }
      }
      const parentId = await this.getParentId(namespaceId, resourceId);
      if (!parentId) {
        break;
      }
      resourceId = parentId;
    }
    return userPermissions;
  }

  async updateGlobalPermission(
    namespaceId: string,
    resourceId: string,
    permission: PermissionDto,
  ) {
    await this.resourceRepository.update(
      { namespace: { id: namespaceId }, id: resourceId },
      { globalLevel: permission.level },
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

  async getUserPermission(
    namespaceId: string,
    resourceId: string,
    userId: string,
  ): Promise<UserPermissionDto> {
    while (true) {
      const permission = await this.userPermiRepo.findOne({
        where: {
          namespace: { id: namespaceId },
          resource: { id: resourceId },
          user: { id: userId },
        },
        relations: ['user'],
      });
      if (permission) {
        return plainToInstance(UserPermissionDto, permission);
      }
      const parentId = await this.getParentId(namespaceId, resourceId);
      if (!parentId) {
        const user = await this.userService.find(userId);
        return plainToInstance(UserPermissionDto, {
          user,
          level: PermissionLevel.NO_ACCESS,
        });
      }
      resourceId = parentId;
    }
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
      const parentId = await this.getParentId(namespaceId, resourceId);
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
      const resource = await this.resourceRepository.findOneOrFail({
        where: { namespace: { id: namespaceId }, id: resourceId },
      });
      level = resource.globalLevel;
      if (level) {
        break;
      }
      const parentId = await this.getParentId(namespaceId, resourceId);
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
    await this.dataSource.transaction(async (manager) => {
      await this.updateUserLevel(
        namespaceId,
        resourceId,
        userId,
        permission.level,
        manager,
      );
    });
  }

  async updateUserLevel(
    namespaceId: string,
    resourceId: string,
    userId: string,
    level: PermissionLevel,
    manager: EntityManager,
  ) {
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

  async userHasPermission(
    namespaceId: string,
    resourceId: string,
    userId: string,
  ) {
    const globalLevel = await this.getGlobalPermissionLevel(
      namespaceId,
      resourceId,
    );
    if (globalLevel != PermissionLevel.NO_ACCESS) {
      return true;
    }
    const userPermi = await this.getUserPermission(
      namespaceId,
      resourceId,
      userId,
    );
    if (userPermi.level != PermissionLevel.NO_ACCESS) {
      return true;
    }
    const groups = await this.groupUserRepository.find({
      where: {
        namespace: { id: namespaceId },
        user: { id: userId },
      },
      relations: ['group'],
    });
    for (const group of groups) {
      const groupLevel = await this.getGroupPermissionLevel(
        namespaceId,
        resourceId,
        group.group.id,
      );
      if (groupLevel != PermissionLevel.NO_ACCESS) {
        return true;
      }
    }
    return false;
  }

  async getParentId(
    namespaceId: string,
    resourceId: string,
  ): Promise<string | null> {
    const resource = await this.resourceRepository.findOneOrFail({
      where: { namespace: { id: namespaceId }, id: resourceId },
    });
    return resource.parentId;
  }
}
