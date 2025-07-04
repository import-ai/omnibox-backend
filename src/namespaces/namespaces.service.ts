import each from 'src/utils/each';
import { InjectRepository } from '@nestjs/typeorm';
import { Namespace } from './entities/namespace.entity';
import { Resource } from 'src/resources/resources.entity';
import { UpdateNamespaceDto } from './dto/update-namespace.dto';
import { NamespaceMemberDto } from './dto/namespace-member.dto';
import { GroupUser } from 'src/groups/entities/group-user.entity';
import { ResourcesService } from 'src/resources/resources.service';
import { PermissionLevel } from 'src/permissions/permission-level.enum';
import { DataSource, EntityManager, IsNull, Repository } from 'typeorm';
import { PermissionsService } from 'src/permissions/permissions.service';
import { UserPermission } from 'src/permissions/entities/user-permission.entity';
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

    private readonly dataSource: DataSource,

    private readonly resourceService: ResourcesService,

    private readonly permissionsService: PermissionsService,
  ) {}

  async getPrivateRoot(userId: string, namespaceId: string): Promise<Resource> {
    const member = await this.namespaceMemberRepository.findOne({
      where: {
        user: { id: userId },
        namespace: { id: namespaceId },
      },
      relations: ['rootResource'],
    });
    if (member === null) {
      throw new NotFoundException('Root resource not found.');
    }
    return member.rootResource;
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
      relations: ['rootResource'],
    });
    if (namespace === null) {
      throw new NotFoundException('Workspace not found');
    }
    if (namespace.rootResource === null) {
      throw new NotFoundException('Root resource not found');
    }
    return namespace.rootResource;
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
        PermissionLevel.FULL_ACCESS,
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
      rootResource: { id: publicRoot.id },
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
    level: PermissionLevel,
    manager: EntityManager,
  ) {
    const count = await manager.count(NamespaceMember, {
      where: {
        namespace: { id: namespaceId },
        user: { id: userId },
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
        namespace: { id: namespaceId },
        user: { id: userId },
        role,
        rootResource: { id: privateRoot.id },
      }),
    );
    const teamspaceRoot = await this.getTeamspaceRoot(namespaceId, manager);
    await this.permissionsService.updateUserLevel(
      namespaceId,
      teamspaceRoot.id,
      userId,
      level,
      manager,
    );
    await this.permissionsService.updateUserLevel(
      namespaceId,
      privateRoot.id,
      userId,
      PermissionLevel.FULL_ACCESS,
      manager,
    );
  }

  async updateMemberRole(
    namespaceId: string,
    userId: string,
    role: NamespaceRole,
  ) {
    await this.namespaceMemberRepository.update(
      { namespace: { id: namespaceId }, user: { id: userId } },
      { role },
    );
  }

  async listNamespaces(userId: string): Promise<Namespace[]> {
    const namespaces = await this.namespaceMemberRepository.find({
      where: {
        user: { id: userId },
      },
      relations: ['namespace'],
    });
    return namespaces.map((v) => v.namespace);
  }

  async listMembers(
    namespaceId: string,
    manager?: EntityManager,
  ): Promise<NamespaceMemberDto[]> {
    const members = await this.namespaceMemberRepository.find({
      where: { namespace: { id: namespaceId } },
      relations: ['user'],
    });
    if (members.length <= 0) {
      return [];
    }
    return await Promise.all(
      members.map((member) =>
        this.getTeamspaceRoot(namespaceId, manager)
          .then((teamspaceRoot) =>
            this.permissionsService.getUserLevel(
              namespaceId,
              teamspaceRoot.id,
              member.user.id,
            ),
          )
          .then((userLevel) =>
            Promise.resolve({
              id: member.id,
              level: userLevel,
              role: member.role,
              userId: member.user.id,
              email: member.user.email,
              username: member.user.username,
            }),
          ),
      ),
    );
  }

  async getMemberByUserId(namespaceId: string, userId: string) {
    return await this.namespaceMemberRepository.findOne({
      where: {
        namespace: { id: namespaceId },
        user: { id: userId },
        deletedAt: IsNull(),
      },
    });
  }

  async deleteMember(namespaceId: string, userId: string) {
    await this.dataSource.transaction(async (manager) => {
      const member = await manager.findOne(NamespaceMember, {
        where: { namespace: { id: namespaceId }, user: { id: userId } },
        relations: ['rootResource'],
      });
      if (!member) {
        return;
      }
      // Delete private root
      await manager.softDelete(Resource, {
        namespace: { id: namespaceId },
        id: member.rootResource.id,
      });
      // Clear user permissions
      await manager.softDelete(UserPermission, {
        namespace: { id: namespaceId },
        user: { id: userId },
      });
      // Remove user from all groups
      await manager.softDelete(GroupUser, {
        namespace: { id: namespaceId },
        user: { id: userId },
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
        namespace: { id: namespaceId },
        user: { id: userId },
        deletedAt: IsNull(),
      },
    });
    if (!user) {
      return false;
    }
    return user.role === NamespaceRole.OWNER;
  }
}
