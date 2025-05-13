import each from 'src/utils/each';
import { ArrayContains, DataSource, EntityManager, Repository } from 'typeorm';
import { InjectRepository } from '@nestjs/typeorm';
import { UpdateNamespaceDto } from './dto/update-namespace.dto';
import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Resource } from 'src/resources/resources.entity';
import { Namespace } from './entities/namespace.entity';
import { NamespaceMember } from './entities/namespace-member.entity';
import { NamespaceMemberDto } from './dto/namespace-member.dto';

@Injectable()
export class NamespacesService {
  constructor(
    @InjectRepository(Namespace)
    private readonly namespaceRepository: Repository<Namespace>,

    @InjectRepository(NamespaceMember)
    private namespaceMemberRepository: Repository<NamespaceMember>,

    private readonly dataSource: DataSource,
  ) {}

  async getTeamspaceRoot(namespaceId: string): Promise<Resource> {
    const namespace = await this.namespaceRepository.findOne({
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

  async create(ownerId: string, name: string): Promise<Namespace> {
    return await this.dataSource.transaction(async (manager) => {
      return await this.createAndInit(ownerId, name, manager);
    });
  }

  async createAndInit(
    ownerId: string,
    name: string,
    manager: EntityManager,
  ): Promise<Namespace> {
    const namespace = await manager.save(
      manager.create(Namespace, {
        name,
      }),
    );
    const privateRoot = await manager.save(
      manager.create(Resource, {
        resourceType: 'folder',
        parent: null,
        namespace: { id: namespace.id },
        user: { id: ownerId },
      }),
    );
    const publicRoot = await manager.save(
      manager.create(Resource, {
        resourceType: 'folder',
        parent: null,
        namespace: { id: namespace.id },
        user: { id: ownerId },
      }),
    );
    await this.addMember(namespace.id, ownerId, privateRoot.id, manager);
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
    privateRootId: string,
    manager?: EntityManager,
  ) {
    const repo = manager
      ? manager.getRepository(NamespaceMember)
      : this.namespaceMemberRepository;
    await repo.save(
      repo.create({
        namespace: { id: namespaceId },
        user: { id: userId },
        rootResource: { id: privateRootId },
      }),
    );
  }

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

  async listNamespaces(userId: string): Promise<Namespace[]> {
    const namespaces = await this.namespaceMemberRepository.find({
      where: {
        user: { id: userId },
      },
      relations: ['namespace'],
    });
    return namespaces.map((v) => v.namespace);
  }

  async listMembers(namespaceId: string): Promise<NamespaceMemberDto[]> {
    const members = await this.namespaceMemberRepository.find({
      where: { namespace: { id: namespaceId } },
      relations: ['user'],
    });
    return members.map((member) => {
      return { email: member.user.email, role: member.role };
    });
  }
}
