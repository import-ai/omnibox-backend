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
import { Injectable, HttpStatus } from '@nestjs/common';
import {
  NamespaceMember,
  NamespaceRole,
} from './entities/namespace-member.entity';
import { ResourcesService } from 'omniboxd/resources/resources.service';
import { ResourceMetaDto } from 'omniboxd/resources/dto/resource-meta.dto';
import { AppException } from 'omniboxd/common/exceptions/app.exception';
import { I18nService } from 'nestjs-i18n';
import { isNameBlocked } from 'omniboxd/utils/blocked-names';
import { filterEmoji } from 'omniboxd/utils/emoji';
import { Transaction, transaction } from 'omniboxd/utils/transaction-utils';

@Injectable()
export class NamespacesService {
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
    private readonly i18n: I18nService,
  ) {}

  private async hasOwner(
    namespaceId: string,
    entityManager: EntityManager,
  ): Promise<boolean> {
    const count = await entityManager.count(NamespaceMember, {
      where: { namespaceId, role: NamespaceRole.OWNER },
    });
    return count > 0;
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

  async delete(id: string) {
    await this.namespaceRepository.softDelete(id);
  }

  async createOrRestorePrivateRoot(
    userId: string,
    namespaceId: string,
    namespaceMember: NamespaceMember | null,
    tx: Transaction,
  ): Promise<string> {
    if (namespaceMember) {
      await this.resourcesService.restoreResource(
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
  ) {
    await this.dataSource.transaction(async (manager) => {
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

  async deleteMember(namespaceId: string, userId: string) {
    await transaction(this.dataSource.manager, async (tx) => {
      const entityManager = tx.entityManager;

      const member = await entityManager.findOne(NamespaceMember, {
        where: { namespaceId, userId },
      });
      if (!member) {
        return;
      }
      // Delete private root
      await this.resourcesService.deleteResource(
        userId,
        namespaceId,
        member.rootResourceId,
        tx,
      );
      // Clear user permissions
      await entityManager.softDelete(UserPermission, {
        namespaceId,
        userId,
      });
      // Remove user from all groups
      await entityManager.softDelete(GroupUser, {
        namespaceId,
        userId,
      });
      // Delete namespace member record
      await entityManager.softDelete(NamespaceMember, { id: member.id });
      const hasOwner = await this.hasOwner(namespaceId, entityManager);
      if (!hasOwner) {
        throw new AppException(
          this.i18n.t('namespace.errors.noOwnerAfterwards'),
          'NO_OWNER_AFTERWARDS',
          HttpStatus.UNPROCESSABLE_ENTITY,
        );
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
}
