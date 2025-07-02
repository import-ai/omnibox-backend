import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
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
import { Record } from 'openai/core';

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

  async getGroupPermission(
    namespaceId: string,
    resourceId: string,
    groupId: string,
    permissionLevel: PermissionLevel,
  ) {
    return await this.groupPermiRepo.findOne({
      where: {
        level: permissionLevel,
        namespace: { id: namespaceId },
        resource: { id: resourceId },
        group: { id: groupId },
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
      namespace: { id: namespaceId },
      resource: { id: resourceId },
      group: { id: groupId },
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
      const resource = await this.resourceRepository.findOne({
        where: { namespace: { id: namespaceId }, id: resourceId },
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
        namespace: { id: namespaceId },
        resource: { id: resourceId },
        user: { id: userId },
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
    level: PermissionLevel = PermissionLevel.CAN_VIEW,
  ) {
    // Check if the user is a member of the namespace
    const count = await this.namespaceMembersRepository.count({
      where: { namespace: { id: namespaceId }, user: { id: userId } },
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

  async getUserPermissionFromParents(
    namespaceId: string,
    parentResourceIds: string[],
    userId: string,
  ): Promise<PermissionLevel | null> {
    const userPermissions = await this.userPermiRepo.find({
      where: {
        namespace: { id: namespaceId },
        user: { id: userId },
        resource: { id: In(parentResourceIds) },
      },
    });
    const userPermiMap: Map<string, UserPermission> = new Map(
      userPermissions.map((permi) => [permi.resource!.id, permi]),
    );
    for (const resourceId of parentResourceIds) {
      const permission = userPermiMap.get(resourceId);
      if (permission) {
        return permission.level;
      }
    }
    return null;
  }

  async getGroupPermissionFromParents(
    namespaceId: string,
    parentResourceIds: string[],
    groupIds: string[],
  ): Promise<PermissionLevel | null> {
    const groupPermissions = await this.groupPermiRepo.find({
      where: {
        namespace: { id: namespaceId },
        resource: { id: In(parentResourceIds) },
        group: { id: In(groupIds) },
      },
    });
    const permiMap: Map<string, PermissionLevel | null> = new Map();
    for (const groupPermi of groupPermissions) {
      const resourceId = groupPermi.resource!.id;
      const curPermi = permiMap.get(resourceId) || null;
      permiMap.set(resourceId, maxPermission(curPermi, groupPermi.level));
    }
    for (const resourceId of parentResourceIds) {
      const permission = permiMap.get(resourceId);
      if (permission) {
        return permission;
      }
    }
    return null;
  }

  async getCurrentPermissionFromParents(
    namespaceId: string,
    parentResources: Resource[],
    userId: string,
  ): Promise<PermissionLevel> {
    const groups = await this.groupUserRepository.find({
      where: {
        namespace: { id: namespaceId },
        user: { id: userId },
      },
      relations: ['group'],
    });
    const groupIds = groups.map((group) => group.group.id);
    const parentResourceIds = parentResources.map((resource) => resource.id);

    const globalPermission =
      this.getGlobalPermissionFromParents(parentResources);
    const userPermission = await this.getUserPermissionFromParents(
      namespaceId,
      parentResourceIds,
      userId,
    );
    const groupPermission = await this.getGroupPermissionFromParents(
      namespaceId,
      parentResourceIds,
      groupIds,
    );
    const curPermission = maxPermissions([
      globalPermission,
      userPermission,
      groupPermission,
    ]);
    return curPermission || PermissionLevel.NO_ACCESS;
  }

  async getParentId(
    namespaceId: string,
    resourceId: string,
  ): Promise<string | null> {
    const resource = await this.resourceRepository.findOne({
      where: { namespace: { id: namespaceId }, id: resourceId },
    });
    if (!resource) {
      return null;
    }
    return resource.parentId;
  }
}
