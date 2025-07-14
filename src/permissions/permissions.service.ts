import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Group } from 'src/groups/entities/group.entity';
import { DataSource, EntityManager, In, IsNull, Repository } from 'typeorm';
import { PermissionDto } from './dto/permission.dto';
import {
  GroupPermissionDto,
  ListRespDto,
  UserPermissionDto,
} from './dto/list-resp.dto';
import {
  comparePermission,
  maxPermissions,
  ResourcePermission,
} from './resource-permission.enum';
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
    private readonly groupRepository: Repository<Group>,
    @InjectRepository(NamespaceMember)
    private readonly namespaceMembersRepository: Repository<NamespaceMember>,
    private readonly dataSource: DataSource,
    private readonly userService: UserService,
  ) {}

  async getGroupPermissions(
    namespaceId: string,
    parentResourceIds: string[],
    groupIds?: string[],
  ): Promise<Map<string, ResourcePermission>> {
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
    const groupPermissionMap: Map<string, ResourcePermission> = new Map();
    for (const resourceId of parentResourceIds) {
      for (const permission of permissionMap.get(resourceId) || []) {
        const groupId = permission.groupId;
        if (!groupPermissionMap.has(groupId)) {
          groupPermissionMap.set(groupId, permission.permission);
        }
      }
    }
    return groupPermissionMap;
  }

  async getUserPermissions(
    namespaceId: string,
    parentResourceIds: string[],
    userIds?: string[],
  ): Promise<Map<string, ResourcePermission>> {
    const permissions = await this.userPermiRepo.find({
      where: {
        namespaceId,
        resourceId: In(parentResourceIds),
        userId: userIds ? In(userIds) : undefined,
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
    const userPermissionMap: Map<string, ResourcePermission> = new Map();
    for (const resourceId of parentResourceIds) {
      for (const permission of permissionMap.get(resourceId) || []) {
        const userId = permission.userId;
        if (!userPermissionMap.has(userId)) {
          userPermissionMap.set(userId, permission.permission);
        }
      }
    }
    return userPermissionMap;
  }

  async getCurrentPermission(
    namespaceId: string,
    resources: Resource[],
    userId: string,
  ): Promise<ResourcePermission> {
    const groups = await this.groupUserRepository.find({
      where: {
        namespaceId,
        userId,
      },
    });
    const groupIds = groups.map((group) => group.groupId);
    const resourceIds = resources.map((resource) => resource.id);

    const globalPermission = getGlobalPermission(resources);
    const userPermission = await this.getUserPermissions(
      namespaceId,
      resourceIds,
      [userId],
    );
    const groupPermissionMap = await this.getGroupPermissions(
      namespaceId,
      resourceIds,
      groupIds,
    );
    const curPermission = maxPermissions([
      globalPermission,
      userPermission.get(userId) || null,
      ...groupPermissionMap.values(),
    ]);
    return curPermission || ResourcePermission.NO_ACCESS;
  }

  async updateGlobalPermission(
    namespaceId: string,
    resourceId: string,
    permission: PermissionDto,
  ) {
    await this.resourceRepository.update(
      { namespaceId, id: resourceId },
      { globalPermission: permission.level },
    );
  }

  async updateGroupPermission(
    namespaceId: string,
    resourceId: string,
    groupId: string,
    permission: ResourcePermission,
  ): Promise<void> {
    const result = await this.groupPermiRepo.update(
      { namespaceId, resourceId, groupId, deletedAt: IsNull() },
      { permission: permission },
    );
    if (result.affected === 0) {
      const groupPermission = this.groupPermiRepo.create({
        namespaceId,
        resourceId,
        groupId,
        permission: permission,
      });
      await this.groupPermiRepo.save(groupPermission);
    }
  }

  async updateUserPermission(
    namespaceId: string,
    resourceId: string,
    userId: string,
    permission: ResourcePermission,
    manager: EntityManager = this.dataSource.manager,
  ) {
    const repo = manager.getRepository(UserPermission);
    const result = await repo.update(
      { namespaceId, resourceId, userId, deletedAt: IsNull() },
      { permission: permission },
    );
    if (result.affected === 0) {
      const userPermission = repo.create({
        namespaceId,
        resourceId,
        userId,
        permission: permission,
      });
      await repo.save(userPermission);
    }
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

  async listPermissions(
    namespaceId: string,
    resourceId: string,
    userId: string,
  ): Promise<ListRespDto> {
    // Get resources
    const resources = await this.getParentResources(namespaceId, resourceId);
    const resourceIds = resources.map((resource) => resource.id);

    // Get permissions
    const globalPermission = getGlobalPermission(resources);
    const userPermissionMap = await this.getUserPermissions(
      namespaceId,
      resourceIds,
    );
    const groupPermissionMap = await this.getGroupPermissions(
      namespaceId,
      resourceIds,
    );

    // Get user information
    const userIds = Array.from(userPermissionMap.keys());
    const users = await this.userService.findByIds(userIds);
    const userMap = new Map<string, User>(users.map((user) => [user.id, user]));

    // Get group information
    const groupIds = Array.from(groupPermissionMap.keys());
    const groups = await this.groupRepository.find({
      where: { namespaceId, id: In(groupIds) },
      select: ['id', 'title'],
    });
    const groupMap = new Map<string, Group>(
      groups.map((group) => [group.id, group]),
    );

    // Prepare response
    const userPermissions: UserPermissionDto[] = [];
    for (const [userId, level] of userPermissionMap) {
      const user = userMap.get(userId);
      if (user) {
        userPermissions.push(UserPermissionDto.new(user, level));
      }
    }
    const groupPermissions: GroupPermissionDto[] = [];
    for (const [groupId, level] of groupPermissionMap) {
      const group = groupMap.get(groupId);
      if (group) {
        groupPermissions.push(GroupPermissionDto.new(group, level));
      }
    }
    userPermissions.sort((a, b) => {
      // Current user first
      if (a.user.id == userId) {
        return -1;
      }
      if (b.user.id == userId) {
        return 1;
      }
      // Other users sorted by email
      return a.user.email.localeCompare(b.user.email);
    });
    return {
      globalPermission: globalPermission || ResourcePermission.NO_ACCESS,
      users: userPermissions,
      groups: groupPermissions,
    };
  }

  async userHasPermission(
    namespaceId: string,
    resourceId: string,
    userId: string,
    requiredPermission: ResourcePermission = ResourcePermission.CAN_VIEW,
    resources?: Resource[],
  ) {
    // Check if the user is a member of the namespace
    const count = await this.namespaceMembersRepository.count({
      where: { namespaceId, userId },
    });
    if (count == 0) {
      return false;
    }
    if (!resources) {
      resources = await this.getParentResources(namespaceId, resourceId);
    }
    const permission = await this.getCurrentPermission(
      namespaceId,
      resources,
      userId,
    );
    return comparePermission(permission, requiredPermission) >= 0;
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
        select: ['id', 'name', 'resourceType', 'parentId', 'globalPermission'],
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

function getGlobalPermission(
  parentResources: Resource[],
): ResourcePermission | null {
  for (const resource of parentResources) {
    if (resource.globalPermission) {
      return resource.globalPermission;
    }
  }
  return null;
}
