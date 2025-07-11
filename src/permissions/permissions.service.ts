import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Group } from 'src/groups/entities/group.entity';
import { DataSource, EntityManager, In, IsNull, Repository } from 'typeorm';
import { PermissionDto } from './dto/permission.dto';
import { ListRespDto, UserPermissionDto } from './dto/list-resp.dto';
import { plainToInstance } from 'class-transformer';
import {
  comparePermissionLevel,
  maxPermission,
  maxPermissions,
  PermissionLevel,
} from './permission-level.enum';
import { UserPermission } from './entities/user-permission.entity';
import { GroupPermission } from './entities/group-permission.entity';
import { Resource } from 'src/resources/resources.entity';
import { UserService } from 'src/user/user.service';
import { GroupUser } from 'src/groups/entities/group-user.entity';
import { NamespaceMember } from 'src/namespaces/entities/namespace-member.entity';
import { User } from 'src/user/entities/user.entity';

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
    @InjectRepository(Group)
    private readonly GroupRepository: Repository<Group>,
    @InjectRepository(NamespaceMember)
    private readonly namespaceMembersRepository: Repository<NamespaceMember>,
    private readonly dataSource: DataSource,
    private readonly userService: UserService,
  ) {}

  async listPermissions(
    namespaceId: string,
    resourceId: string,
    userId: string,
  ): Promise<ListRespDto> {
    const parentResources = await this.getParentResources(
      namespaceId,
      resourceId,
    );
    const parentResourceIds = parentResources.map((resource) => resource.id);

    const userPermissionMap = await this.listUserPermissions(
      namespaceId,
      parentResourceIds,
    );
    const userIds = Array.from(userPermissionMap.keys());
    const users = await this.userService.findByIds(userIds);
    const userMap = new Map<string, User>(users.map((user) => [user.id, user]));
    const userPermissions: UserPermissionDto[] = [];
    for (const [userId, level] of userPermissionMap) {
      const user = userMap.get(userId);
      if (!user) {
        continue;
      }
      userPermissions.push(UserPermissionDto.new(user, level));
    }

    let groups: GroupPermission[] = [];
    const groupsPermi = await this.groupPermiRepo.find({
      where: { namespaceId, resourceId },
    });
    if (groupsPermi.length > 0) {
      groups = await Promise.all(
        groupsPermi.map((groupPermi) =>
          groupPermi.groupId
            ? this.GroupRepository.findOneBy({ id: groupPermi.groupId }).then(
                (group) => Promise.resolve({ ...groupPermi, group }),
              )
            : Promise.resolve(groupPermi),
        ),
      );
    }
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
    parentResourceIds: string[],
    userId?: string,
  ): Promise<Map<string, PermissionLevel>> {
    const permissions = await this.userPermiRepo.find({
      where: {
        namespaceId,
        resourceId: In(parentResourceIds),
        userId,
      },
    });

    // resourceId -> UserPermission[]
    const permissionMap: Map<string, UserPermission[]> = new Map();
    for (const permission of permissions) {
      const resourceId = permission.resourceId;
      if (!permissionMap.has(resourceId)) {
        permissionMap.set(resourceId, []);
      }
      permissionMap.get(resourceId)!.push(permission);
    }

    // userId -> PermissionLevel
    const userPermissionMap: Map<string, PermissionLevel> = new Map();
    for (const resourceId of parentResourceIds) {
      for (const permission of permissionMap.get(resourceId) || []) {
        const userId = permission.userId;
        if (!userPermissionMap.has(userId)) {
          userPermissionMap.set(userId, permission.level);
        }
      }
    }
    return userPermissionMap;
  }

  async updateGlobalPermission(
    namespaceId: string,
    resourceId: string,
    permission: PermissionDto,
  ) {
    await this.resourceRepository.update(
      { namespaceId, id: resourceId },
      { globalLevel: permission.level },
    );
  }

  async getGroupPermission(
    namespaceId: string,
    resourceId: string,
    groupId: string,
    permissionLevel: PermissionLevel,
  ) {
    return await this.groupPermiRepo.findOne({
      where: {
        level: permissionLevel,
        namespaceId,
        resourceId,
        groupId,
      },
    });
  }

  async createGroupPermission(
    namespaceId: string,
    resourceId: string,
    groupId: string,
    permissionLevel: PermissionLevel,
  ) {
    const groupPermission = this.groupPermiRepo.create({
      level: permissionLevel,
      namespaceId,
      resourceId,
      groupId,
    });
    await this.groupPermiRepo.save(groupPermission);
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
          namespaceId,
          resourceId,
          groupId,
          deletedAt: IsNull(),
        },
        { level },
      );
      if (result.affected === 0) {
        await manager.save(
          manager.create(GroupPermission, {
            namespaceId,
            resourceId,
            groupId,
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
      namespaceId,
      resourceId,
      groupId,
    });
  }

  async getUserPermission(
    namespaceId: string,
    resourceId: string,
    userId: string,
  ): Promise<UserPermissionDto> {
    while (true) {
      const user = await this.userService.find(userId);
      const permission = await this.userPermiRepo.findOne({
        where: {
          namespaceId,
          resourceId,
          userId,
        },
      });
      if (permission) {
        return plainToInstance(UserPermissionDto, {
          user,
          ...permission,
        });
      }
      const parentId = await this.getParentId(namespaceId, resourceId);
      if (!parentId) {
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
          namespaceId,
          resourceId,
          groupId,
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
      const resource = await this.resourceRepository.findOne({
        where: { namespaceId, id: resourceId },
      });
      if (!resource) {
        break;
      }
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

  async getUserLevel(namespaceId: string, resourceId: string, userId: string) {
    const userPermission = await this.userPermiRepo.findOne({
      where: {
        namespaceId,
        resourceId,
        userId,
      },
    });
    return userPermission ? userPermission.level : PermissionLevel.NO_ACCESS;
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
        namespaceId,
        resourceId,
        userId,
        deletedAt: IsNull(),
      },
      { level },
    );
    if (result.affected === 0) {
      await manager.save(
        manager.create(UserPermission, {
          namespaceId,
          resourceId,
          userId,
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
      namespaceId,
      resourceId,
      userId,
    });
  }

  async userHasPermission(
    namespaceId: string,
    resourceId: string,
    userId: string,
    level: PermissionLevel = PermissionLevel.CAN_VIEW,
  ) {
    // Check if the user is a member of the namespace
    const count = await this.namespaceMembersRepository.count({
      where: { namespaceId, userId },
    });
    if (count == 0) {
      return false;
    }
    const globalLevel = await this.getGlobalPermissionLevel(
      namespaceId,
      resourceId,
    );
    if (comparePermissionLevel(globalLevel, level) >= 0) {
      return true;
    }
    const userPermi = await this.getUserPermission(
      namespaceId,
      resourceId,
      userId,
    );
    if (comparePermissionLevel(userPermi.level, level) >= 0) {
      return true;
    }
    const groups = await this.groupUserRepository.find({
      where: {
        namespaceId,
        userId,
      },
    });
    for (const group of groups) {
      const groupLevel = await this.getGroupPermissionLevel(
        namespaceId,
        resourceId,
        group.groupId,
      );
      if (comparePermissionLevel(groupLevel, level) >= 0) {
        return true;
      }
    }
    return false;
  }

  async getCurrentLevel(
    namespaceId: string,
    resourceId: string,
    userId: string,
  ): Promise<PermissionLevel> {
    let level = PermissionLevel.NO_ACCESS;
    const globalLevel = await this.getGlobalPermissionLevel(
      namespaceId,
      resourceId,
    );
    if (comparePermissionLevel(globalLevel, level) >= 0) {
      level = globalLevel;
    }
    const userPermi = await this.getUserPermission(
      namespaceId,
      resourceId,
      userId,
    );
    if (comparePermissionLevel(userPermi.level, level) >= 0) {
      level = userPermi.level;
    }
    const groups = await this.groupUserRepository.find({
      where: {
        namespaceId,
        userId,
      },
    });
    for (const group of groups) {
      const groupLevel = await this.getGroupPermissionLevel(
        namespaceId,
        resourceId,
        group.groupId,
      );
      if (comparePermissionLevel(groupLevel, level) >= 0) {
        level = groupLevel;
      }
    }
    return level;
  }

  getGlobalPermissionFromParents(
    parentResources: Resource[],
  ): PermissionLevel | null {
    for (const resource of parentResources) {
      if (resource.globalLevel) {
        return resource.globalLevel;
      }
    }
    return null;
  }

  async getGroupPermissions(
    namespaceId: string,
    parentResourceIds: string[],
    groupIds?: string[],
  ): Promise<Map<string, PermissionLevel>> {
    const permissions = await this.groupPermiRepo.find({
      where: {
        namespaceId,
        resourceId: In(parentResourceIds),
        groupId: groupIds ? In(groupIds) : undefined,
      },
    });

    // resourceId -> GroupPermission[]
    const permissionMap: Map<string, GroupPermission[]> = new Map();
    for (const permission of permissions) {
      const resourceId = permission.resourceId;
      if (!permissionMap.has(resourceId)) {
        permissionMap.set(resourceId, []);
      }
      permissionMap.get(resourceId)!.push(permission);
    }

    // groupId -> PermissionLevel
    const groupPermissionMap: Map<string, PermissionLevel> = new Map();
    for (const resourceId of parentResourceIds) {
      for (const permission of permissionMap.get(resourceId) || []) {
        const groupId = permission.groupId;
        if (!groupPermissionMap.has(groupId)) {
          groupPermissionMap.set(groupId, permission.level);
        }
      }
    }
    return groupPermissionMap;
  }

  async getCurrentPermissionFromParents(
    namespaceId: string,
    parentResources: Resource[],
    userId: string,
  ): Promise<PermissionLevel> {
    const groups = await this.groupUserRepository.find({
      where: {
        namespaceId,
        userId,
      },
    });
    const groupIds = groups.map((group) => group.groupId);
    const parentResourceIds = parentResources.map((resource) => resource.id);

    const globalPermission =
      this.getGlobalPermissionFromParents(parentResources);
    const userPermission = await this.listUserPermissions(
      namespaceId,
      parentResourceIds,
      userId,
    );
    const groupPermissionMap = await this.getGroupPermissions(
      namespaceId,
      parentResourceIds,
      groupIds,
    );
    const curPermission = maxPermissions([
      globalPermission,
      userPermission.get(userId) || null,
      ...groupPermissionMap.values(),
    ]);
    return curPermission || PermissionLevel.NO_ACCESS;
  }

  async getParentId(
    namespaceId: string,
    resourceId: string,
  ): Promise<string | null> {
    const resource = await this.resourceRepository.findOne({
      where: { namespaceId, id: resourceId },
    });
    if (!resource) {
      return null;
    }
    return resource.parentId;
  }

  async getParentResources(
    namespaceId: string,
    resourceId: string | null,
  ): Promise<Resource[]> {
    if (!resourceId) {
      return [];
    }
    const resources: Resource[] = [];
    while (true) {
      const resource = await this.resourceRepository.findOneOrFail({
        where: { namespaceId, id: resourceId },
        select: ['id', 'name', 'resourceType', 'parentId', 'globalLevel'],
      });
      resources.push(resource);
      if (!resource.parentId) {
        break;
      }
      resourceId = resource.parentId;
    }
    return resources;
  }
}
