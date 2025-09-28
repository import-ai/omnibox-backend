import each from 'omniboxd/utils/each';
import { InjectRepository } from '@nestjs/typeorm';
import { Namespace } from './entities/namespace.entity';
import { Resource } from 'omniboxd/resources/entities/resource.entity';
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
import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  NamespaceMember,
  NamespaceRole,
} from './entities/namespace-member.entity';
import { ResourcesService } from 'omniboxd/resources/resources.service';
import { ResourceMetaDto } from 'omniboxd/resources/dto/resource-meta.dto';

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
  ) {}

  async getPrivateRootId(userId: string, namespaceId: string): Promise<string> {
    const member = await this.namespaceMemberRepository.findOne({
      where: {
        userId,
        namespaceId,
      },
    });
    if (member === null) {
      throw new NotFoundException('Root resource not found.');
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
      throw new NotFoundException('Workspace not found');
    }
    if (!namespace.rootResourceId) {
      throw new NotFoundException('Root resource not found');
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
      throw new NotFoundException('Workspace not found');
    }
    return namespace;
  }

  async createUserNamespace(
    userId: string,
    userName: string | null,
    entityManager?: EntityManager,
  ): Promise<Namespace> {
    const namespaceName = await this.userService.getNamespaceName(
      userId,
      userName,
      entityManager,
    );
    return await this.createAndJoinNamespace(
      userId,
      namespaceName,
      entityManager,
    );
  }

  async createAndJoinNamespace(
    ownerId: string,
    namespaceName: string,
    entityManager?: EntityManager,
  ): Promise<Namespace> {
    if (!entityManager) {
      return await this.dataSource.transaction((entityManager) =>
        this.createAndJoinNamespace(ownerId, namespaceName, entityManager),
      );
    }
    const namespace = await this.createNamespace(namespaceName, entityManager);
    await this.addMember(
      namespace.id,
      ownerId,
      NamespaceRole.OWNER,
      ResourcePermission.FULL_ACCESS,
      entityManager,
    );
    return namespace;
  }

  async createNamespace(
    name: string,
    manager: EntityManager,
  ): Promise<Namespace> {
    if ((await manager.countBy(Namespace, { name })) > 0) {
      throw new ConflictException({ code: 'namespace_conflict' });
    }
    const namespace = await manager.save(manager.create(Namespace, { name }));
    const publicRoot = await this.resourcesService.createResource(
      {
        namespaceId: namespace.id,
        parentId: null,
        userId: null,
        resourceType: ResourceType.FOLDER,
      },
      manager,
    );
    await manager.update(Namespace, namespace.id, {
      rootResourceId: publicRoot.id,
    });
    return namespace;
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
      if ((await repo.countBy({ name: updateDto.name })) > 0) {
        throw new ConflictException({ code: 'namespace_conflict' });
      }
      namespace.name = updateDto.name;
    }
    return await repo.update(id, namespace);
  }

  async delete(id: string) {
    await this.namespaceRepository.softDelete(id);
  }

  async addMember(
    namespaceId: string,
    userId: string,
    role: NamespaceRole,
    permission: ResourcePermission,
    entityManager: EntityManager,
  ) {
    const count = await entityManager.count(NamespaceMember, {
      where: {
        namespaceId,
        userId,
        deletedAt: IsNull(),
      },
    });
    if (count > 0) {
      return;
    }
    const privateRoot = await this.resourcesService.createResource(
      {
        namespaceId,
        parentId: null,
        userId,
        resourceType: ResourceType.FOLDER,
      },
      entityManager,
    );
    await entityManager.save(
      entityManager.create(NamespaceMember, {
        namespaceId,
        userId,
        role,
        rootResourceId: privateRoot.id,
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
      privateRoot.id,
      userId,
      ResourcePermission.FULL_ACCESS,
      entityManager,
    );
    await this.resourcesService.createResource(
      {
        namespaceId,
        parentId: privateRoot.id,
        userId,
        resourceType: ResourceType.FOLDER,
        name: await this.getUncategorizedName(userId, entityManager),
      },
      entityManager,
    );
  }

  private async getUncategorizedName(
    userId: string,
    entityManager?: EntityManager,
  ): Promise<string> {
    const option = await this.userService.getOption(
      userId,
      'language',
      entityManager,
    );
    if (option && option.value == 'zh-CN') {
      return '未分类';
    }
    return 'Uncategorized';
  }

  async updateMemberRole(
    namespaceId: string,
    userId: string,
    role: NamespaceRole,
  ) {
    await this.namespaceMemberRepository.update(
      { namespaceId, userId },
      { role },
    );
  }

  async listNamespaces(userId: string): Promise<Namespace[]> {
    const memberRecords = await this.namespaceMemberRepository.find({
      where: {
        userId,
      },
      select: ['namespaceId'],
    });
    const namespaceIds = memberRecords.map((v) => v.namespaceId);
    return await this.namespaceRepository.find({
      where: {
        id: In(namespaceIds),
      },
    });
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
    await this.dataSource.transaction(async (manager) => {
      const member = await manager.findOne(NamespaceMember, {
        where: { namespaceId, userId },
      });
      if (!member) {
        return;
      }
      // Delete private root
      await manager.softDelete(Resource, {
        namespaceId,
        id: member.rootResourceId,
      });
      // Clear user permissions
      await manager.softDelete(UserPermission, {
        namespaceId,
        userId,
      });
      // Remove user from all groups
      await manager.softDelete(GroupUser, {
        namespaceId,
        userId,
      });
      // Delete namespace member record
      await manager.softDelete(NamespaceMember, { id: member.id });
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
