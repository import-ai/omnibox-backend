import { InjectRepository } from '@nestjs/typeorm';
import { Namespace } from './entities/namespace.entity';
import { UpdateNamespaceDto } from './dto/update-namespace.dto';
import { NamespaceMemberDto } from './dto/namespace-member.dto';
import { GroupUser } from 'omniboxd/groups/entities/group-user.entity';
import { NamespaceResourcesService } from 'omniboxd/namespace-resources/namespace-resources.service';
import { ResourcePermission } from 'omniboxd/permissions/resource-permission.enum';
import { DataSource, EntityManager, In, IsNull, Repository } from 'typeorm';
import { PermissionsService } from 'omniboxd/permissions/permissions.service';
import { UserPermission } from 'omniboxd/permissions/entities/user-permission.entity';
import { UserService } from 'omniboxd/user/user.service';
import { ResourceType } from 'omniboxd/resources/entities/resource.entity';
import { HttpStatus, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  NamespaceMember,
  NamespaceRole,
  ROLE_LEVEL,
} from './entities/namespace-member.entity';
import { ResourcesService } from 'omniboxd/resources/resources.service';
import { ResourceMetaDto } from 'omniboxd/resources/dto/resource-meta.dto';
import { AppException } from 'omniboxd/common/exceptions/app.exception';
import { I18nService } from 'nestjs-i18n';
import { isNameBlocked } from 'omniboxd/utils/blocked-names';
import { filterEmoji } from 'omniboxd/utils/emoji';
import { Transaction, transaction } from 'omniboxd/utils/transaction-utils';
import { APIKey } from 'omniboxd/api-key/api-key.entity';
import { Applications } from 'omniboxd/applications/applications.entity';
import { TasksService } from 'omniboxd/tasks/tasks.service';
import { Share } from 'omniboxd/shares/entities/share.entity';

@Injectable()
export class NamespacesService {
  private readonly proUrl: string | undefined;

  constructor(
    @InjectRepository(Namespace)
    private readonly namespaceRepository: Repository<Namespace>,

    @InjectRepository(NamespaceMember)
    private namespaceMemberRepository: Repository<NamespaceMember>,

    private readonly dataSource: DataSource,
    private readonly userService: UserService,

    private readonly namespaceResourcesService: NamespaceResourcesService,
    private readonly resourcesService: ResourcesService,

    private readonly permissionsService: PermissionsService,
    private readonly tasksService: TasksService,
    private readonly i18n: I18nService,
    configService: ConfigService,
  ) {
    this.proUrl = configService.get<string>('OBB_PRO_URL');
  }

  private async hasOwner(
    namespaceId: string,
    entityManager: EntityManager,
  ): Promise<boolean> {
    const count = await entityManager.count(NamespaceMember, {
      where: { namespaceId, role: NamespaceRole.OWNER, deletedAt: IsNull() },
    });
    return count > 0;
  }

  /**
   * Destructor: Clean up user's data when leaving or being removed from a namespace.
   * - Soft-deletes API keys created by user in namespace
   * - Soft-deletes WeChat assistant applications
   * - Cancels ongoing tasks
   * - Disables shares created by user in namespace
   */
  private async destructor(
    namespaceId: string,
    userId: string,
    tx: Transaction,
  ): Promise<void> {
    const entityManager = tx.entityManager;

    // Soft-delete API keys for this user in this namespace
    await entityManager.softDelete(APIKey, { namespaceId, userId });

    // Soft-delete applications (WeChat assistant) for this user in this namespace
    await entityManager.softDelete(Applications, { namespaceId, userId });

    // Cancel ongoing tasks for this user in this namespace
    await this.tasksService.cancelUserTasks(namespaceId, userId, tx);

    // Disable shares created by this user in this namespace
    await entityManager.update(
      Share,
      { namespaceId, userId },
      { enabled: false },
    );
  }

  async getPrivateRootId(userId: string, namespaceId: string): Promise<string> {
    const member = await this.namespaceMemberRepository.findOne({
      where: {
        userId,
        namespaceId,
      },
    });
    if (member === null) {
      const message = this.i18n.t('namespace.errors.rootResourceNotFound');
      throw new AppException(
        message,
        'ROOT_RESOURCE_NOT_FOUND',
        HttpStatus.NOT_FOUND,
      );
    }
    return member.rootResourceId;
  }

  async getPrivateRoot(
    userId: string,
    namespaceId: string,
  ): Promise<ResourceMetaDto> {
    const rootResourceId = await this.getPrivateRootId(userId, namespaceId);
    return await this.resourcesService.getResourceMetaOrFail(
      namespaceId,
      rootResourceId,
    );
  }

  async getTeamspaceRoot(
    namespaceId: string,
    manager?: EntityManager,
  ): Promise<ResourceMetaDto> {
    const repo = manager
      ? manager.getRepository(Namespace)
      : this.namespaceRepository;
    const namespace = await repo.findOne({
      where: {
        id: namespaceId,
      },
    });
    if (!namespace) {
      const message = this.i18n.t('namespace.errors.workspaceNotFound');
      throw new AppException(
        message,
        'WORKSPACE_NOT_FOUND',
        HttpStatus.NOT_FOUND,
      );
    }
    if (!namespace.rootResourceId) {
      const message = this.i18n.t('namespace.errors.rootResourceNotFound');
      throw new AppException(
        message,
        'ROOT_RESOURCE_NOT_FOUND',
        HttpStatus.NOT_FOUND,
      );
    }
    return await this.resourcesService.getResourceMetaOrFail(
      namespaceId,
      namespace.rootResourceId,
      manager,
    );
  }

  async getNamespace(namespaceId: string, manager?: EntityManager) {
    const repo = manager
      ? manager.getRepository(Namespace)
      : this.namespaceRepository;
    const namespace = await repo.findOne({
      where: {
        id: namespaceId,
      },
    });
    if (!namespace) {
      const message = this.i18n.t('namespace.errors.workspaceNotFound');
      throw new AppException(
        message,
        'WORKSPACE_NOT_FOUND',
        HttpStatus.NOT_FOUND,
      );
    }
    return namespace;
  }

  async createUserNamespace(
    userId: string,
    userName: string | null,
    tx?: Transaction,
  ): Promise<Namespace> {
    const namespaceName = this.i18n.t('namespace.userNamespaceName', {
      args: { userName },
    });
    return await this.createAndJoinNamespace(userId, namespaceName, tx);
  }

  async createNamespaceForUser(userId: string, name: string): Promise<Namespace> {
    if (!this.proUrl) {
      return await this.createAndJoinNamespace(userId, name);
    }
    const url = `${this.proUrl}/internal/api/v1/pro-namespaces`;
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ user_id: userId, name }),
    });
    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      throw new AppException(
        data.message ?? `Pro API error: ${response.statusText}`,
        data.code ?? 'PRO_NAMESPACE_CREATE_FAILED',
        response.status as HttpStatus,
      );
    }
    const { id } = await response.json();
    return await this.getNamespace(id);
  }

  async createAndJoinNamespace(
    ownerId: string,
    namespaceName: string,
    tx?: Transaction,
  ): Promise<Namespace> {
    if (!tx) {
      return await transaction(this.dataSource.manager, (tx) =>
        this.createAndJoinNamespace(ownerId, namespaceName, tx),
      );
    }
    const namespace = await this.createNamespace(namespaceName, tx);
    await this.addMember(
      namespace.id,
      ownerId,
      NamespaceRole.OWNER,
      ResourcePermission.FULL_ACCESS,
      tx,
    );
    return namespace;
  }

  async createNamespace(name: string, tx: Transaction): Promise<Namespace> {
    const manager = tx.entityManager;

    // Filter emoji from namespace name
    const filteredName = filterEmoji(name);

    if (
      isNameBlocked(filteredName) ||
      (await manager.countBy(Namespace, { name: filteredName })) > 0
    ) {
      const message = this.i18n.t('namespace.errors.namespaceConflict');
      throw new AppException(
        message,
        'NAMESPACE_CONFLICT',
        HttpStatus.CONFLICT,
      );
    }
    const namespace = await manager.save(
      manager.create(Namespace, { name: filteredName }),
    );
    const publicRoot = await this.resourcesService.createResource(
      {
        namespaceId: namespace.id,
        parentId: null,
        userId: null,
        resourceType: ResourceType.FOLDER,
      },
      tx,
    );
    await manager.update(Namespace, namespace.id, {
      rootResourceId: publicRoot.id,
    });
    return namespace;
  }

  async getNamespaceByName(
    name: string,
    entityManager?: EntityManager,
  ): Promise<Namespace | null> {
    const repo = entityManager
      ? entityManager.getRepository(Namespace)
      : this.namespaceRepository;
    return repo.findOne({ where: { name } });
  }

  async update(
    id: string,
    updateDto: UpdateNamespaceDto,
    manager?: EntityManager,
  ) {
    const repo = manager
      ? manager.getRepository(Namespace)
      : this.namespaceRepository;
    const namespace = await this.getNamespace(id, manager);
    if (updateDto.name && updateDto.name !== namespace.name) {
      // Filter emoji from namespace name
      const filteredName = filterEmoji(updateDto.name);

      if (
        isNameBlocked(filteredName) ||
        (await repo.countBy({ name: filteredName })) > 0
      ) {
        const message = this.i18n.t('namespace.errors.namespaceConflict');
        throw new AppException(
          message,
          'NAMESPACE_CONFLICT',
          HttpStatus.CONFLICT,
        );
      }
      namespace.name = filteredName;
    }
    return await repo.update(id, namespace);
  }

  async delete(namespaceId: string) {
    await transaction(this.dataSource.manager, async (tx) => {
      const entityManager = tx.entityManager;

      // Count members
      const memberCount = await entityManager.count(NamespaceMember, {
        where: { namespaceId },
      });

      // Block if more than 1 member
      if (memberCount > 1) {
        throw new AppException(
          this.i18n.t('namespace.errors.cannotDeleteWithMembers'),
          'CANNOT_DELETE_WITH_MEMBERS',
          HttpStatus.FORBIDDEN,
        );
      }

      // Get the last member (must exist since owner is calling this)
      const member = await entityManager.findOne(NamespaceMember, {
        where: { namespaceId },
      });

      if (member) {
        // Run destructor to clean up member's data in this namespace
        await this.destructor(namespaceId, member.userId, tx);

        // Delete member's private root
        await this.resourcesService.deleteResource(
          member.userId,
          namespaceId,
          member.rootResourceId,
          tx,
        );
        await entityManager.softDelete(UserPermission, {
          namespaceId,
          userId: member.userId,
        });
        await entityManager.softDelete(GroupUser, {
          namespaceId,
          userId: member.userId,
        });
        await entityManager.softDelete(NamespaceMember, { id: member.id });

        // Delete teamspace root resource
        const namespace = await this.getNamespace(namespaceId, entityManager);
        if (namespace.rootResourceId) {
          await this.resourcesService.deleteResource(
            member.userId,
            namespaceId,
            namespace.rootResourceId,
            tx,
          );
        }
      }

      // Soft delete namespace
      await entityManager.softDelete(Namespace, namespaceId);
    });
  }

  async createOrRestorePrivateRoot(
    userId: string,
    namespaceId: string,
    namespaceMember: NamespaceMember | null,
    tx: Transaction,
  ): Promise<string> {
    if (namespaceMember) {
      await this.resourcesService.restoreResource(
        userId,
        namespaceId,
        namespaceMember.rootResourceId,
        tx,
      );
      return namespaceMember.rootResourceId;
    }
    const privateRoot = await this.resourcesService.createResource(
      {
        namespaceId,
        parentId: null,
        userId,
        resourceType: ResourceType.FOLDER,
      },
      tx,
    );
    return privateRoot.id;
  }

  async addMember(
    namespaceId: string,
    userId: string,
    role: NamespaceRole,
    permission: ResourcePermission,
    tx: Transaction,
  ) {
    const entityManager = tx.entityManager;

    const count = await entityManager.count(NamespaceMember, {
      where: { namespaceId, userId },
    });
    if (count > 0) {
      return;
    }

    // Prevent adding new owners via invitation - auto-downgrade to ADMIN
    if (role === NamespaceRole.OWNER) {
      const ownerExists = await this.hasOwner(namespaceId, entityManager);
      if (ownerExists) {
        role = NamespaceRole.ADMIN;
      }
    }

    const namespaceMember = await entityManager.findOne(NamespaceMember, {
      where: { namespaceId, userId },
      order: { updatedAt: 'DESC' },
      withDeleted: true,
    });
    const privateRootId = await this.createOrRestorePrivateRoot(
      userId,
      namespaceId,
      namespaceMember,
      tx,
    );
    await entityManager.save(
      entityManager.create(NamespaceMember, {
        namespaceId,
        userId,
        role,
        rootResourceId: privateRootId,
      }),
    );
    const teamspaceRoot = await this.getTeamspaceRoot(
      namespaceId,
      entityManager,
    );
    await this.permissionsService.updateUserPermission(
      namespaceId,
      teamspaceRoot.id,
      userId,
      permission,
      entityManager,
    );
    await this.permissionsService.updateUserPermission(
      namespaceId,
      privateRootId,
      userId,
      ResourcePermission.FULL_ACCESS,
      entityManager,
    );
  }

  async updateMemberRole(
    namespaceId: string,
    userId: string,
    role: NamespaceRole,
    currentUserId: string,
  ) {
    await this.dataSource.transaction(async (manager) => {
      const currentMember = await manager.findOne(NamespaceMember, {
        where: { namespaceId, userId, deletedAt: IsNull() },
      });

      if (!currentMember) {
        throw new AppException(
          this.i18n.t('namespace.errors.memberNotFound'),
          'MEMBER_NOT_FOUND',
          HttpStatus.NOT_FOUND,
        );
      }

      // Check role hierarchy permissions
      const currentUserMember = await manager.findOne(NamespaceMember, {
        where: { namespaceId, userId: currentUserId, deletedAt: IsNull() },
      });

      // Owners can modify anyone and assign any role
      if (currentUserMember?.role !== NamespaceRole.OWNER) {
        const currentUserLevel =
          ROLE_LEVEL[currentUserMember?.role ?? NamespaceRole.MEMBER];
        const targetUserLevel = ROLE_LEVEL[currentMember.role];
        const newRoleLevel = ROLE_LEVEL[role];

        // Non-owners can only modify users at levels strictly greater than their own
        if (currentUserLevel >= targetUserLevel) {
          throw new AppException(
            this.i18n.t('namespace.errors.insufficientPermission'),
            'INSUFFICIENT_PERMISSION',
            HttpStatus.FORBIDDEN,
          );
        }

        // Non-owners can only assign roles at levels strictly greater than their own
        if (currentUserLevel >= newRoleLevel) {
          throw new AppException(
            this.i18n.t('namespace.errors.cannotAssignHigherRole'),
            'CANNOT_ASSIGN_HIGHER_ROLE',
            HttpStatus.FORBIDDEN,
          );
        }
      }

      // Prevent promoting to owner if namespace already has an owner
      if (
        role === NamespaceRole.OWNER &&
        currentMember.role !== NamespaceRole.OWNER
      ) {
        const ownerExists = await this.hasOwner(namespaceId, manager);
        if (ownerExists) {
          throw new AppException(
            this.i18n.t('namespace.errors.namespaceHasOwner'),
            'NAMESPACE_HAS_OWNER',
            HttpStatus.UNPROCESSABLE_ENTITY,
          );
        }
      }

      await manager.update(NamespaceMember, { namespaceId, userId }, { role });
      const hasOwner = await this.hasOwner(namespaceId, manager);
      if (!hasOwner) {
        throw new AppException(
          this.i18n.t('namespace.errors.noOwnerAfterwards'),
          'NO_OWNER_AFTERWARDS',
          HttpStatus.UNPROCESSABLE_ENTITY,
        );
      }
    });
  }

  async listNamespaces(userId: string): Promise<Namespace[]> {
    const memberRecords = await this.namespaceMemberRepository.find({
      where: {
        userId,
      },
      select: ['namespaceId'],
      order: { createdAt: 'DESC' },
    });
    const namespaceIds = memberRecords.map((v) => v.namespaceId);
    return await this.namespaceRepository.find({
      where: {
        id: In(namespaceIds),
      },
    });
  }

  async countMembers(namespaceId: string): Promise<number> {
    return await this.namespaceMemberRepository.countBy({ namespaceId });
  }

  async listMembers(namespaceId: string): Promise<NamespaceMemberDto[]> {
    const members = await this.namespaceMemberRepository.find({
      where: { namespaceId },
    });
    const userIds = members.map((member) => member.userId);
    const users = await this.userService.findByIds(userIds);
    const userMap = new Map(users.map((user) => [user.id, user]));

    const teamspaceRoot = await this.getTeamspaceRoot(namespaceId);
    const permissionMap = await this.permissionsService.getUserPermissions(
      namespaceId,
      [teamspaceRoot.id],
      userIds,
    );

    const memberDtos: NamespaceMemberDto[] = [];
    for (const member of members) {
      const user = userMap.get(member.userId);
      if (!user) {
        continue;
      }
      const permission =
        permissionMap.get(member.userId) || ResourcePermission.NO_ACCESS;
      memberDtos.push({
        userId: user.id,
        email: user.email,
        username: user.username,
        role: member.role,
        permission: permission,
      });
    }
    return memberDtos;
  }

  async getMemberByUserId(namespaceId: string, userId: string) {
    return await this.namespaceMemberRepository.findOne({
      where: {
        namespaceId,
        userId,
        deletedAt: IsNull(),
      },
    });
  }

  async deleteMember(
    namespaceId: string,
    userId: string,
    currentUserId: string,
  ) {
    await transaction(this.dataSource.manager, async (tx) => {
      const entityManager = tx.entityManager;

      const isSelfRemoval = userId === currentUserId;

      const member = await entityManager.findOne(NamespaceMember, {
        where: { namespaceId, userId },
      });
      if (!member) {
        if (isSelfRemoval) {
          throw new AppException(
            this.i18n.t('namespace.errors.notAMember'),
            'NOT_A_MEMBER',
            HttpStatus.FORBIDDEN,
          );
        }
        return;
      }

      // Authorization check: only owner/admin can remove others
      if (!isSelfRemoval) {
        const isOwnerOrAdmin = await this.userIsOwnerOrAdmin(
          namespaceId,
          currentUserId,
        );
        if (!isOwnerOrAdmin) {
          throw new AppException(
            this.i18n.t('namespace.errors.userNotOwnerOrAdmin'),
            'USER_NOT_OWNER_OR_ADMIN',
            HttpStatus.FORBIDDEN,
          );
        }

        // Admins cannot remove the owner
        if (member.role === NamespaceRole.OWNER) {
          const isOwner = await this.userIsOwner(namespaceId, currentUserId);
          if (!isOwner) {
            throw new AppException(
              this.i18n.t('namespace.errors.cannotRemoveOwner'),
              'CANNOT_REMOVE_OWNER',
              HttpStatus.FORBIDDEN,
            );
          }
        }

        // Admins cannot remove other admins (only owner can)
        if (member.role === NamespaceRole.ADMIN) {
          const isOwner = await this.userIsOwner(namespaceId, currentUserId);
          if (!isOwner) {
            throw new AppException(
              this.i18n.t('namespace.errors.adminCannotRemoveAdmin'),
              'ADMIN_CANNOT_REMOVE_ADMIN',
              HttpStatus.FORBIDDEN,
            );
          }
        }
      }

      if (isSelfRemoval) {
        // Self-removal validations
        const memberCount = await entityManager.count(NamespaceMember, {
          where: { namespaceId },
        });
        if (memberCount === 1) {
          throw new AppException(
            this.i18n.t('namespace.errors.lastMemberCannotQuit'),
            'LAST_MEMBER_CANNOT_QUIT',
            HttpStatus.UNPROCESSABLE_ENTITY,
          );
        }
        if (member.role === NamespaceRole.OWNER) {
          const ownerCount = await entityManager.count(NamespaceMember, {
            where: { namespaceId, role: NamespaceRole.OWNER },
          });
          if (ownerCount === 1) {
            throw new AppException(
              this.i18n.t('namespace.errors.lastOwnerCannotQuit'),
              'LAST_OWNER_CANNOT_QUIT',
              HttpStatus.FORBIDDEN,
            );
          }
        }
      }

      // Run destructor to clean up user's data in this namespace
      await this.destructor(namespaceId, userId, tx);

      // Cleanup
      await this.resourcesService.deleteResource(
        userId,
        namespaceId,
        member.rootResourceId,
        tx,
      );
      await entityManager.softDelete(UserPermission, {
        namespaceId,
        userId,
      });
      await entityManager.softDelete(GroupUser, {
        namespaceId,
        userId,
      });
      await entityManager.softDelete(NamespaceMember, { id: member.id });

      // Admin removal validation
      if (!isSelfRemoval) {
        const hasOwner = await this.hasOwner(namespaceId, entityManager);
        if (!hasOwner) {
          throw new AppException(
            this.i18n.t('namespace.errors.noOwnerAfterwards'),
            'NO_OWNER_AFTERWARDS',
            HttpStatus.UNPROCESSABLE_ENTITY,
          );
        }
      }
    });
  }

  async getRoot(namespaceId: string, userId: string) {
    const privateRoot = await this.getPrivateRoot(userId, namespaceId);
    const privateChildren = await this.namespaceResourcesService.listChildren(
      namespaceId,
      privateRoot.id,
      userId,
    );
    const teamspaceRoot = await this.getTeamspaceRoot(namespaceId);
    const teamspaceChildren = await this.namespaceResourcesService.listChildren(
      namespaceId,
      teamspaceRoot.id,
      userId,
    );
    const spaces: any = {
      private: { ...privateRoot, parentId: '0', children: privateChildren },
    };
    const memberCount = await this.namespaceMemberRepository.countBy({
      namespaceId,
    });
    if (memberCount > 1 || teamspaceChildren.length > 0) {
      spaces.teamspace = {
        ...teamspaceRoot,
        parentId: '0',
        children: teamspaceChildren,
      };
    }
    return spaces;
  }

  async userIsOwner(namespaceId: string, userId: string): Promise<boolean> {
    const user = await this.namespaceMemberRepository.findOne({
      where: {
        namespaceId,
        userId,
        deletedAt: IsNull(),
      },
    });
    if (!user) {
      return false;
    }
    return user.role === NamespaceRole.OWNER;
  }

  async userIsOwnerOrAdmin(
    namespaceId: string,
    userId: string,
  ): Promise<boolean> {
    const member = await this.namespaceMemberRepository.findOne({
      where: {
        namespaceId,
        userId,
        deletedAt: IsNull(),
      },
    });
    if (!member) {
      return false;
    }
    return (
      member.role === NamespaceRole.OWNER || member.role === NamespaceRole.ADMIN
    );
  }

  async transferOwnership(
    namespaceId: string,
    currentOwnerId: string,
    newOwnerId: string,
  ) {
    await this.dataSource.transaction(async (manager) => {
      // Verify current user is owner
      const currentOwner = await manager.findOne(NamespaceMember, {
        where: { namespaceId, userId: currentOwnerId, deletedAt: IsNull() },
      });
      if (!currentOwner || currentOwner.role !== NamespaceRole.OWNER) {
        throw new AppException(
          this.i18n.t('namespace.errors.userNotOwner'),
          'USER_NOT_OWNER',
          HttpStatus.FORBIDDEN,
        );
      }

      // Verify target is a member
      const newOwner = await manager.findOne(NamespaceMember, {
        where: { namespaceId, userId: newOwnerId, deletedAt: IsNull() },
      });
      if (!newOwner) {
        throw new AppException(
          this.i18n.t('namespace.errors.targetNotMember'),
          'TARGET_NOT_MEMBER',
          HttpStatus.UNPROCESSABLE_ENTITY,
        );
      }

      // Transfer: new owner becomes OWNER, old owner becomes ADMIN
      await manager.update(
        NamespaceMember,
        { namespaceId, userId: newOwnerId },
        { role: NamespaceRole.OWNER },
      );
      await manager.update(
        NamespaceMember,
        { namespaceId, userId: currentOwnerId },
        { role: NamespaceRole.ADMIN },
      );
    });
  }
}
