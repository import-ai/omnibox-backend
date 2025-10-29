import { Injectable, HttpStatus } from '@nestjs/common';
import { AppException } from 'omniboxd/common/exceptions/app.exception';
import { I18nService } from 'nestjs-i18n';
import { InjectRepository } from '@nestjs/typeorm';
import { Group } from 'omniboxd/groups/entities/group.entity';
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
import { Resource } from 'omniboxd/resources/entities/resource.entity';
import { UserService } from 'omniboxd/user/user.service';
import { GroupUser } from 'omniboxd/groups/entities/group-user.entity';
import { NamespaceMember } from 'omniboxd/namespaces/entities/namespace-member.entity';
import { User } from 'omniboxd/user/entities/user.entity';
import { ResourcesService } from 'omniboxd/resources/resources.service';
import { ResourceMetaDto } from 'omniboxd/resources/dto/resource-meta.dto';

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
    private readonly resourcesService: ResourcesService,
    private readonly i18n: I18nService,
  ) {}

  async getGroupPermissions(
    namespaceId: string,
    parentResourceIds: string[],
    groupIds?: string[],
    entityManager?: EntityManager,
  ): Promise<Map<string, ResourcePermission>> {
    const groupPermiRepo = entityManager
      ? entityManager.getRepository(GroupPermission)
      : this.groupPermiRepo;
    const permissions = await groupPermiRepo.find({
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

    // groupId -> Permission
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
    entityManager?: EntityManager,
  ): Promise<Map<string, ResourcePermission>> {
    const userPermiRepo = entityManager
      ? entityManager.getRepository(UserPermission)
      : this.userPermiRepo;
    const permissions = await userPermiRepo.find({
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

    // userId -> Permission
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
    resources: ResourceMetaDto[],
    userId: string,
    entityManager?: EntityManager,
  ): Promise<ResourcePermission> {
    const groupUserRepository = entityManager
      ? entityManager.getRepository(GroupUser)
      : this.groupUserRepository;
    const groups = await groupUserRepository.find({
      where: {
        namespaceId,
        userId,
      },
    });
    const groupIds = groups.map((group) => group.groupId);
    const resourceIds = resources.map((resource) => resource.id);

    const globalPermission = getGlobalPermission(resources);
    const userPermissionMap = await this.getUserPermissions(
      namespaceId,
      resourceIds,
      [userId],
      entityManager,
    );
    const groupPermissionMap = await this.getGroupPermissions(
      namespaceId,
      resourceIds,
      groupIds,
      entityManager,
    );
    const curPermission = maxPermissions([
      globalPermission,
      userPermissionMap.get(userId) || null,
      ...groupPermissionMap.values(),
    ]);
    return curPermission || ResourcePermission.NO_ACCESS;
  }

  /**
   * Get the current permissions for each specified resource.
   * For each non-root resource specified, it's required that all its parents are also specified.
   */
  async getCurrentPermissions(
    userId: string,
    namespaceId: string,
    resources: ResourceMetaDto[],
    entityManager?: EntityManager,
  ): Promise<Map<string, ResourcePermission>> {
    if (!entityManager) {
      return await this.dataSource.transaction((entityManager) =>
        this.getCurrentPermissions(
          userId,
          namespaceId,
          resources,
          entityManager,
        ),
      );
    }

    const groups = await entityManager.find(GroupUser, {
      where: {
        namespaceId,
        userId,
      },
    });
    const groupIds = groups.map((group) => group.groupId);
    const resourceIds = resources.map((resource) => resource.id);

    const groupPermissions = await entityManager.find(GroupPermission, {
      where: {
        namespaceId,
        groupId: In(groupIds),
        resourceId: In(resourceIds),
      },
    });
    const userPermissions = await entityManager.find(UserPermission, {
      where: {
        namespaceId,
        userId,
        resourceId: In(resourceIds),
      },
    });

    // resourceId + groupId -> GroupPermission
    const groupPermissionKeyMap: Map<string, GroupPermission> = new Map();
    for (const permission of groupPermissions) {
      groupPermissionKeyMap.set(
        `${permission.resourceId}||${permission.groupId}`,
        permission,
      );
    }
    // resourceId -> UserPermission
    const userPermissionMap: Map<string, UserPermission> = new Map();
    for (const permission of userPermissions) {
      userPermissionMap.set(permission.resourceId, permission);
    }
    // resourceId -> ResourceMetaDto
    const resourceMap: Map<string, ResourceMetaDto> = new Map();
    for (const resource of resources) {
      resourceMap.set(resource.id, resource);
    }

    const calcUserPermission = (resource: ResourceMetaDto) => {
      while (true) {
        const userPermission = userPermissionMap.get(resource.id);
        if (userPermission) {
          return userPermission.permission;
        }
        if (!resource.parentId) {
          return null;
        }
        const parent = resourceMap.get(resource.parentId);
        if (!parent) {
          return null;
        }
        resource = parent;
      }
    };

    const calcGroupPermission = (
      resource: ResourceMetaDto,
      groupId: string,
    ) => {
      while (true) {
        const groupPermission = groupPermissionKeyMap.get(
          `${resource.id}||${groupId}`,
        );
        if (groupPermission) {
          return groupPermission.permission;
        }
        if (!resource.parentId) {
          return null;
        }
        const parent = resourceMap.get(resource.parentId);
        if (!parent) {
          return null;
        }
        resource = parent;
      }
    };

    const calcGlobalPermission = (resource: ResourceMetaDto) => {
      while (true) {
        if (resource.globalPermission) {
          return resource.globalPermission;
        }
        if (!resource.parentId) {
          return null;
        }
        const parent = resourceMap.get(resource.parentId);
        if (!parent) {
          return null;
        }
        resource = parent;
      }
    };

    const permissions: Map<string, ResourcePermission> = new Map();
    for (let i = 0; i < resources.length; i++) {
      const resource = resources[i];
      const userPermission = calcUserPermission(resource);
      const groupPermissions = groupIds.map((groupId) =>
        calcGroupPermission(resource, groupId),
      );
      const globalPermission = calcGlobalPermission(resource);
      const permission = maxPermissions([
        globalPermission,
        userPermission,
        ...groupPermissions,
      ]);
      permissions.set(resource.id, permission || ResourcePermission.NO_ACCESS);
    }
    return permissions;
  }

  async updateGlobalPermission(
    namespaceId: string,
    resourceId: string,
    permission: PermissionDto,
  ) {
    await this.resourceRepository.update(
      { namespaceId, id: resourceId },
      { globalPermission: permission.permission },
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
    entityManager?: EntityManager,
  ): Promise<ListRespDto> {
    // Get resources
    const resources = await this.resourcesService.getParentResourcesOrFail(
      namespaceId,
      resourceId,
      entityManager,
    );
    if (resources.length === 0 || resources[resources.length - 1].parentId) {
      // Parent resource has been deleted
      const message = this.i18n.t('resource.errors.resourceNotFound');
      throw new AppException(
        message,
        'RESOURCE_NOT_FOUND',
        HttpStatus.NOT_FOUND,
      );
    }
    const resourceIds = resources.map((resource) => resource.id);

    // Get permissions
    const globalPermission = getGlobalPermission(resources);
    const userPermissionMap = await this.getUserPermissions(
      namespaceId,
      resourceIds,
      undefined,
      entityManager,
    );
    const groupPermissionMap = await this.getGroupPermissions(
      namespaceId,
      resourceIds,
      undefined,
      entityManager,
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
    for (const [userId, permission] of userPermissionMap) {
      const user = userMap.get(userId);
      if (user) {
        userPermissions.push(UserPermissionDto.new(user, permission));
      }
    }
    const groupPermissions: GroupPermissionDto[] = [];
    for (const [groupId, permission] of groupPermissionMap) {
      const group = groupMap.get(groupId);
      if (group) {
        groupPermissions.push(GroupPermissionDto.new(group, permission));
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
      if (a.user.email && b.user.email) {
        // Sort by email if both have email
        return a.user.email.localeCompare(b.user.email);
      }
      return 0;
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
    resources?: ResourceMetaDto[],
    entityManager?: EntityManager,
  ) {
    // Check if the user is a member of the namespace
    const namespaceMembersRepository = entityManager
      ? entityManager.getRepository(NamespaceMember)
      : this.namespaceMembersRepository;
    const count = await namespaceMembersRepository.count({
      where: { namespaceId, userId },
    });
    if (count == 0) {
      return false;
    }
    if (!resources) {
      resources = await this.resourcesService.getParentResourcesOrFail(
        namespaceId,
        resourceId,
        entityManager,
      );
    }
    if (resources.length === 0 || resources[resources.length - 1].parentId) {
      // Parent resource has been deleted
      return false;
    }
    const permission = await this.getCurrentPermission(
      namespaceId,
      resources,
      userId,
      entityManager,
    );
    return comparePermission(permission, requiredPermission) >= 0;
  }

  /**
   * Filter resources by permission.
   * For each non-root resource specified, it's required that all its parents are also specified.
   */
  async filterResourcesByPermission(
    userId: string,
    namespaceId: string,
    resources: ResourceMetaDto[],
    requiredPermission: ResourcePermission = ResourcePermission.CAN_VIEW,
    entityManager?: EntityManager,
  ): Promise<ResourceMetaDto[]> {
    const permissions = await this.getCurrentPermissions(
      userId,
      namespaceId,
      resources,
      entityManager,
    );
    return resources.filter((res) => {
      const permission = permissions.get(res.id);
      return (
        permission && comparePermission(permission, requiredPermission) >= 0
      );
    });
  }

  async userInNamespace(userId: string, namespaceId: string): Promise<boolean> {
    const count = await this.namespaceMembersRepository.count({
      where: { namespaceId, userId },
    });
    return count > 0;
  }
}

function getGlobalPermission(
  parentResources: ResourceMetaDto[],
): ResourcePermission | null {
  for (const resource of parentResources) {
    if (resource.globalPermission) {
      return resource.globalPermission;
    }
  }
  return null;
}
