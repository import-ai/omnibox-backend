import each from 'omniboxd/utils/each';
import { InjectRepository } from '@nestjs/typeorm';
import { Namespace } from './entities/namespace.entity';
import { Resource } from 'omniboxd/resources/resources.entity';
import { UpdateNamespaceDto } from './dto/update-namespace.dto';
import { NamespaceMemberDto } from './dto/namespace-member.dto';
import { GroupUser } from 'omniboxd/groups/entities/group-user.entity';
import { ResourcesService } from 'omniboxd/resources/resources.service';
import { ResourcePermission } from 'omniboxd/permissions/resource-permission.enum';
import { DataSource, EntityManager, In, IsNull, Repository } from 'typeorm';
import { PermissionsService } from 'omniboxd/permissions/permissions.service';
import { UserPermission } from 'omniboxd/permissions/entities/user-permission.entity';
import { UserService } from 'omniboxd/user/user.service';
import {
  Injectable,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import {
  NamespaceRole,
  NamespaceMember,
} from './entities/namespace-member.entity';

@Injectable()
export class NamespacesService {
  constructor(
    @InjectRepository(Namespace)
    private readonly namespaceRepository: Repository<Namespace>,

    @InjectRepository(NamespaceMember)
    private namespaceMemberRepository: Repository<NamespaceMember>,

    @InjectRepository(Resource)
    private resourceRepository: Repository<Resource>,

    private readonly dataSource: DataSource,
    private readonly userService: UserService,

    private readonly resourceService: ResourcesService,

    private readonly permissionsService: PermissionsService,
  ) {}

  async getPrivateRoot(userId: string, namespaceId: string): Promise<Resource> {
    const member = await this.namespaceMemberRepository.findOne({
      where: {
        userId,
        namespaceId,
      },
    });
    if (member === null) {
      throw new NotFoundException('Root resource not found.');
    }
    return await this.resourceService.get(member.rootResourceId);
  }

  async getTeamspaceRoot(
    namespaceId: string,
    manager?: EntityManager,
  ): Promise<Resource> {
    const repo = manager
      ? manager.getRepository(Namespace)
      : this.namespaceRepository;
    const namespace = await repo.findOne({
      where: {
        id: namespaceId,
      },
    });
    if (namespace === null) {
      throw new NotFoundException('Workspace not found');
    }
    if (namespace.rootResourceId === null) {
      throw new NotFoundException('Root resource not found');
    }
    const resourceRepo = manager
      ? manager.getRepository(Resource)
      : this.resourceRepository;
    return await resourceRepo.findOneOrFail({
      where: {
        id: namespace.rootResourceId,
      },
    });
  }

  async get(id: string, manager?: EntityManager) {
    const repo = manager
      ? manager.getRepository(Namespace)
      : this.namespaceRepository;
    const namespace = await repo.findOne({
      where: {
        id,
      },
    });
    if (!namespace) {
      throw new NotFoundException('Workspace not found');
    }
    return namespace;
  }

  async createAndJoinNamespace(
    ownerId: string,
    name: string,
    manager?: EntityManager,
  ): Promise<Namespace> {
    const transaction = async (manager: EntityManager) => {
      const namespace = await this.createNamespace(name, manager);
      await this.addMember(
        namespace.id,
        ownerId,
        NamespaceRole.OWNER,
        ResourcePermission.FULL_ACCESS,
        manager,
      );
      return namespace;
    };
    return manager
      ? await transaction(manager)
      : await this.dataSource.transaction(transaction);
  }

  async createNamespace(
    name: string,
    manager: EntityManager,
  ): Promise<Namespace> {
    const namespace = await manager.save(manager.create(Namespace, { name }));
    const publicRoot = await this.resourceService.createFolder(
      namespace.id,
      null,
      null,
      manager,
    );
    await manager.update(Namespace, namespace.id, {
      rootResourceId: publicRoot.id,
    });
    return namespace;
  }

  async update(
    id: string,
    updateNamespace: UpdateNamespaceDto,
    manager?: EntityManager,
  ) {
    const repo = manager
      ? manager.getRepository(Namespace)
      : this.namespaceRepository;
    const existNamespace = await this.get(id, manager);
    if (!existNamespace) {
      throw new ConflictException('The current namespace does not exist');
    }
    each(updateNamespace, (value, key) => {
      existNamespace[key] = value;
    });
    return await repo.update(id, existNamespace);
  }

  async delete(id: string) {
    await this.namespaceRepository.softDelete(id);
  }

  async addMember(
    namespaceId: string,
    userId: string,
    role: NamespaceRole,
    level: ResourcePermission,
    manager: EntityManager,
  ) {
    const count = await manager.count(NamespaceMember, {
      where: {
        namespaceId,
        userId,
        deletedAt: IsNull(),
      },
    });
    if (count > 0) {
      return;
    }
    const privateRoot = await this.resourceService.createFolder(
      namespaceId,
      null,
      userId,
      manager,
    );
    await manager.save(
      manager.create(NamespaceMember, {
        namespaceId,
        userId,
        role,
        rootResourceId: privateRoot.id,
      }),
    );
    const teamspaceRoot = await this.getTeamspaceRoot(namespaceId, manager);
    await this.permissionsService.updateUserPermission(
      namespaceId,
      teamspaceRoot.id,
      userId,
      level,
      manager,
    );
    await this.permissionsService.updateUserPermission(
      namespaceId,
      privateRoot.id,
      userId,
      ResourcePermission.FULL_ACCESS,
      manager,
    );
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
        level: permission,
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
    const privateChildren = await this.resourceService.listChildren(
      namespaceId,
      privateRoot.id,
      userId,
    );
    const teamspaceRoot = await this.getTeamspaceRoot(namespaceId);
    const teamspaceChildren = await this.resourceService.listChildren(
      namespaceId,
      teamspaceRoot.id,
      userId,
    );
    return {
      private: { ...privateRoot, parentId: '0', children: privateChildren },
      teamspace: {
        ...teamspaceRoot,
        parentId: '0',
        children: teamspaceChildren,
      },
    };
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
